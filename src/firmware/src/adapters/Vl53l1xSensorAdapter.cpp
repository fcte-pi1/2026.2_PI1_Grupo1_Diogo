#include "adapters/Vl53l1xSensorAdapter.hpp"

#include "adapters/BoardPins.hpp"
#include "driver/gpio.h"
#include "esp_rom_sys.h"

// ============================================================================
// ESQUELETO DA LEITURA REAL DOS ToF (VL53L1X) - hoje em STUB.
//
// Estado atual: rangeXxxMm() retornam 9999 (nenhuma parede) e o begin() só
// liga os XSHUT. Isso COMPILA e GRAVA, mas o sensoriamento fica inativo.
//
// Para ler de verdade (quando o componente VL53L1X estiver escolhido):
//   1. Descomente a dependência em esp32/main/idf_component.yml e rode
//      `idf.py -C esp32 reconfigure`.
//   2. Inclua o header da lib escolhida (ex.: #include "vl53l1x.h").
//   3. Guarde um handle por sensor (frontDev_/leftDev_/rightDev_) - podem ser
//      campos privados no .hpp.
//   4. Implemente o reendereçamento no begin() e a leitura em rangeXxxMm(),
//      substituindo os TODOs abaixo. O resto do firmware NÃO muda (só este
//      arquivo), porque tudo conversa pela porta ISensorPort.
// ============================================================================

namespace micromouse::adapters {

namespace {
// Reendereçamento I2C (RF-28): os VL53L1X nascem todos em 0x29. Liga-se um
// XSHUT por vez e grava-se um endereço distinto antes de ligar o próximo.
void bringUpWithAddress(gpio_num_t xshut, uint8_t newAddress) {
    gpio_set_direction(xshut, GPIO_MODE_OUTPUT);
    gpio_set_level(xshut, 1);  // liga ESTE sensor (sai do reset)
    esp_rom_delay_us(2000);    // tempo de boot do sensor
    (void)newAddress;
    // TODO(real): com a lib escolhida, algo como:
    //   vl53l1x_init(&dev, bus_);                 // inicia no endereço 0x29
    //   vl53l1x_set_i2c_address(&dev, newAddress);// move para o endereço único
    //   vl53l1x_start_ranging(&dev);              // começa a medir
}
}  // namespace

Vl53l1xSensorAdapter::Vl53l1xSensorAdapter(double wallThresholdMm)
    : thresholdMm_(wallThresholdMm) {}

void Vl53l1xSensorAdapter::begin(i2c_master_bus_handle_t bus) {
    bus_ = bus;

    // 1) Desliga TODOS por XSHUT=0 (todos voltam a 0x29 ao religar).
    gpio_set_direction(pins::kTofFrontXshut, GPIO_MODE_OUTPUT);
    gpio_set_direction(pins::kTofLeftXshut, GPIO_MODE_OUTPUT);
    gpio_set_direction(pins::kTofRightXshut, GPIO_MODE_OUTPUT);
    gpio_set_level(pins::kTofFrontXshut, 0);
    gpio_set_level(pins::kTofLeftXshut, 0);
    gpio_set_level(pins::kTofRightXshut, 0);
    esp_rom_delay_us(2000);

    // 2) Liga e reendereça um a um, na ordem e endereços do "4.3 - Projeto
    //    conceitual de hardware", Seção 5.2: esquerdo 0x30, frontal 0x31,
    //    direito 0x32.
    bringUpWithAddress(pins::kTofLeftXshut, 0x30);
    bringUpWithAddress(pins::kTofFrontXshut, 0x31);
    bringUpWithAddress(pins::kTofRightXshut, 0x32);
}

// TODO(real): trocar o 9999 pela leitura da lib no sensor correspondente, p.ex.:
//   return static_cast<int>(vl53l1x_read_distance_mm(&frontDev_));
int Vl53l1xSensorAdapter::rangeFrontMm() const { return 9999; }  // STUB
int Vl53l1xSensorAdapter::rangeLeftMm() const { return 9999; }   // STUB
int Vl53l1xSensorAdapter::rangeRightMm() const { return 9999; }  // STUB

ports::WallsAhead Vl53l1xSensorAdapter::sense() const {
    // Parede presente quando a distância medida fica abaixo do limiar
    // calibrado (RNF-31). O limiar vem do construtor (thresholdMm_).
    return {rangeFrontMm() < thresholdMm_, rangeLeftMm() < thresholdMm_,
            rangeRightMm() < thresholdMm_};
}

}  // namespace micromouse::adapters
