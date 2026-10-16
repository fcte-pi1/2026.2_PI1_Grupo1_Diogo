#include "adapters/BleTelemetryAdapter.hpp"

#include "NimBLEDevice.h"  // componente "esp-nimble-cpp"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

namespace micromouse::adapters {

namespace {
constexpr char kNusService[] = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
constexpr char kNusTxChar[] = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";  // notify

// Só vale "conectado" depois que o cliente assina as notificações: o notify enviado
// antes disso (ex.: o hello logo após a conexão) é descartado pela pilha BLE.
bool g_connected = false;

constexpr int kNotifyAttempts = 20;
constexpr TickType_t kNotifyRetryDelay = pdMS_TO_TICKS(5);

class ServerCallbacks : public NimBLEServerCallbacks {
    void onDisconnect(NimBLEServer* /*server*/, NimBLEConnInfo& /*info*/, int /*reason*/) override {
        g_connected = false;
        NimBLEDevice::startAdvertising();
    }
};

class TxCallbacks : public NimBLECharacteristicCallbacks {
    void onSubscribe(NimBLECharacteristic* /*characteristic*/, NimBLEConnInfo& /*info*/,
                     uint16_t subValue) override {
        g_connected = (subValue & 1U) != 0;  // bit 0 = notificações habilitadas
    }
};
}  // namespace

void BleTelemetryAdapter::begin(const std::string& deviceName) {
    NimBLEDevice::init(deviceName);
    NimBLEDevice::setMTU(247);

    NimBLEServer* server = NimBLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks());

    NimBLEService* service = server->createService(kNusService);
    txCharacteristic_ = service->createCharacteristic(kNusTxChar, NIMBLE_PROPERTY::NOTIFY);
    txCharacteristic_->setCallbacks(new TxCallbacks());
    service->start();  // NimBLE 2.x inicia os serviços junto com o servidor; chamada mantida por clareza

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

    const std::size_t chunk = NimBLEDevice::getMTU() - 3;
    for (std::size_t i = 0; i < framed.size(); i += chunk) {
        const std::string part = framed.substr(i, chunk);
        // A pilha recusa o notify quando a fila de buffers está cheia (mensagens coladas);
        // tentar de novo evita perder a mensagem, o que abriria lacuna na sequência.
        for (int attempt = 0; attempt < kNotifyAttempts; ++attempt) {
            if (txCharacteristic_->notify(reinterpret_cast<const uint8_t*>(part.data()),
                                          part.size())) {
                break;
            }
            vTaskDelay(kNotifyRetryDelay);
        }
    }
}

bool BleTelemetryAdapter::isConnected() const { return g_connected; }

}  // namespace micromouse::adapters
