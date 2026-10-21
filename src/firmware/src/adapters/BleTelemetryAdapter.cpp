#include "adapters/BleTelemetryAdapter.hpp"

#include "NimBLEDevice.h"  // componente "esp-nimble-cpp"

namespace micromouse::adapters {

namespace {
constexpr char kNusService[] = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
constexpr char kNusTxChar[] = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";  // notify

bool g_connected = false;

class ServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* /*server*/, NimBLEConnInfo& /*info*/) override {
        g_connected = true;
    }
    void onDisconnect(NimBLEServer* /*server*/, NimBLEConnInfo& /*info*/, int /*reason*/) override {
        g_connected = false;
        NimBLEDevice::startAdvertising();
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
    service->start();  // NimBLE 2.x inicia os serviços junto com o servidor; chamada mantida por clareza

    NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
    advertising->addServiceUUID(kNusService);
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
        txCharacteristic_->setValue(reinterpret_cast<const uint8_t*>(part.data()), part.size());
        txCharacteristic_->notify();
    }
}

bool BleTelemetryAdapter::isConnected() const { return g_connected; }

}  // namespace micromouse::adapters
