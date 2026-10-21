#include "adapters/BleTelemetryAdapter.hpp"

#include <algorithm>
#include <atomic>

#include "NimBLEDevice.h"  // componente "esp-nimble-cpp"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace micromouse::adapters {

namespace {
constexpr char kTag[] = "ble";
constexpr char kNusService[] = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
constexpr char kNusTxChar[] = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";  // notify

constexpr uint16_t kDefaultMtu = 23;  // MTU do ATT antes da negociação
constexpr uint16_t kPreferredMtu = 247;
constexpr std::size_t kAttHeader = 3;

constexpr int kNotifyAttempts = 20;
constexpr TickType_t kNotifyRetryDelay = pdMS_TO_TICKS(5);

// Escritos pela tarefa do NimBLE (callbacks) e lidos pela tarefa de telemetria.
// Só vale "conectado" depois que o cliente assina as notificações: o notify enviado
// antes disso (ex.: o hello logo após a conexão) é descartado pela pilha BLE.
std::atomic<bool> g_connected{false};
// O MTU NEGOCIADO com o receptor. O NimBLEDevice::getMTU() devolve o preferido (247), e um
// receptor que negocie menos receberia cada notificação cortada.
std::atomic<uint16_t> g_mtu{kDefaultMtu};

std::atomic<uint32_t> g_sentMessages{0};
std::atomic<uint32_t> g_droppedMessages{0};
std::atomic<uint32_t> g_failedNotifies{0};
std::atomic<uint32_t> g_statusErrors{0};

class ServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* /*server*/, NimBLEConnInfo& info) override {
        g_mtu = info.getMTU();
    }
    void onDisconnect(NimBLEServer* /*server*/, NimBLEConnInfo& /*info*/, int /*reason*/) override {
        g_connected = false;
        g_mtu = kDefaultMtu;
        NimBLEDevice::startAdvertising();
    }
    void onMTUChange(uint16_t mtu, NimBLEConnInfo& /*info*/) override {
        g_mtu = mtu;
        ESP_LOGI(kTag, "MTU negociado: %u", static_cast<unsigned>(mtu));
    }
};

class TxCallbacks : public NimBLECharacteristicCallbacks {
    void onSubscribe(NimBLECharacteristic* /*characteristic*/, NimBLEConnInfo& info,
                     uint16_t subValue) override {
        g_mtu = info.getMTU();
        g_connected = (subValue & 1U) != 0;  // bit 0 = notificações habilitadas
    }
    // Resultado de cada notificação enviada: 0 é sucesso (BLE_HS_EDONE seria o de uma
    // indicação confirmada). Separa a perda no rádio da perda no receptor.
    void onStatus(NimBLECharacteristic* /*characteristic*/, int code) override {
        if (code != 0 && code != BLE_HS_EDONE) {
            ++g_statusErrors;
        }
    }
};

// Envia um pedaço, tentando de novo enquanto a fila de buffers da pilha estiver cheia.
bool notifyChunk(NimBLECharacteristic* characteristic, const char* data, std::size_t size) {
    for (int attempt = 0; attempt < kNotifyAttempts; ++attempt) {
        if (characteristic->notify(reinterpret_cast<const uint8_t*>(data), size)) {
            return true;
        }
        vTaskDelay(kNotifyRetryDelay);
    }
    ++g_failedNotifies;
    return false;
}
}  // namespace

void BleTelemetryAdapter::begin(const std::string& deviceName) {
    NimBLEDevice::init(deviceName);
    NimBLEDevice::setMTU(kPreferredMtu);

    NimBLEServer* server = NimBLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks());

    NimBLEService* service = server->createService(kNusService);
    txCharacteristic_ = service->createCharacteristic(kNusTxChar, NIMBLE_PROPERTY::NOTIFY);
    txCharacteristic_->setCallbacks(new TxCallbacks());

    NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
    advertising->addServiceUUID(kNusService);
    // O UUID de 128 bits ocupa o pacote de anúncio; o nome vai na resposta de scan,
    // senão a ponte (que procura o robô pelo nome) não o encontra.
    NimBLEAdvertisementData scanResponse;
    scanResponse.setName(deviceName);
    advertising->setScanResponseData(scanResponse);
    advertising->enableScanResponse(true);
    NimBLEDevice::startAdvertising();
}

void BleTelemetryAdapter::publish(const std::string& jsonPayload) {
    if (txCharacteristic_ == nullptr || !g_connected) {
        return;
    }
    std::string framed = jsonPayload;
    framed.push_back('\n');

    const std::size_t chunk = std::max<std::size_t>(g_mtu.load(), kDefaultMtu) - kAttHeader;
    for (std::size_t offset = 0; offset < framed.size(); offset += chunk) {
        const std::size_t size = std::min(chunk, framed.size() - offset);
        if (notifyChunk(txCharacteristic_, framed.data() + offset, size)) {
            continue;
        }
        // Um pedaço falhou: desiste da mensagem inteira. Se parte dela já saiu, fecha a
        // linha com '\n', para a ponte descartar uma linha quebrada em vez de colar o resto
        // na próxima mensagem (o que estragaria as duas).
        if (offset > 0) {
            (void)notifyChunk(txCharacteristic_, "\n", 1);
        }
        ++g_droppedMessages;
        ESP_LOGW(kTag, "mensagem descartada (%u descartadas, %u enviadas): %.60s",
                 static_cast<unsigned>(g_droppedMessages.load()),
                 static_cast<unsigned>(g_sentMessages.load()), jsonPayload.c_str());
        return;
    }
    ++g_sentMessages;
}

bool BleTelemetryAdapter::isConnected() const { return g_connected; }

BleStats BleTelemetryAdapter::stats() const {
    return BleStats{g_sentMessages.load(), g_droppedMessages.load(), g_failedNotifies.load(),
                    g_statusErrors.load(), g_mtu.load()};
}

}  // namespace micromouse::adapters
