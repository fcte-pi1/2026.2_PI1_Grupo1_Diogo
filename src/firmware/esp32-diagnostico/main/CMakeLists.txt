set(CORE_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../..)

idf_component_register(
    SRCS
        # Núcleo usado pelo diagnóstico (decodificação do DIP)
        "${CORE_ROOT}/src/domain/Maze.cpp"
        "${CORE_ROOT}/src/domain/DipDecoder.cpp"
        # Adapters - os MESMOS do firmware do robô (../esp32/)
        "${CORE_ROOT}/src/adapters/I2cBus.cpp"
        "${CORE_ROOT}/src/adapters/MotorDriver.cpp"
        "${CORE_ROOT}/src/adapters/Encoders.cpp"
        "${CORE_ROOT}/src/adapters/Vl53l1xSensorAdapter.cpp"
        "${CORE_ROOT}/src/adapters/Mpu6050.cpp"
        "${CORE_ROOT}/src/adapters/Ina219.cpp"
        "${CORE_ROOT}/src/adapters/LocalInterfaceAdapter.cpp"
        "${CORE_ROOT}/src/adapters/DipReaderAdapter.cpp"
        "${CORE_ROOT}/src/adapters/BleTelemetryAdapter.cpp"
        # Console de diagnóstico
        "diagnostico.cpp"
    INCLUDE_DIRS "${CORE_ROOT}/include"
    REQUIRES console driver esp_driver_i2c esp_driver_pcnt esp_driver_ledc esp_driver_gpio
             esp_rom esp_timer spi_flash esp-nimble-cpp)

target_compile_features(${COMPONENT_LIB} PUBLIC cxx_std_17)
