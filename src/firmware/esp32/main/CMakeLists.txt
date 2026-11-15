set(CORE_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/../..)

idf_component_register(
    SRCS
        # Núcleo - os MESMOS .cpp dos testes de host
        "${CORE_ROOT}/src/domain/Maze.cpp"
        "${CORE_ROOT}/src/domain/FloodFill.cpp"
        "${CORE_ROOT}/src/domain/Odometry.cpp"
        "${CORE_ROOT}/src/domain/DipDecoder.cpp"
        "${CORE_ROOT}/src/domain/BuzzerPattern.cpp"
        "${CORE_ROOT}/src/domain/Pid.cpp"
        "${CORE_ROOT}/src/domain/Maneuver.cpp"
        "${CORE_ROOT}/src/domain/ImuIdentity.cpp"
        "${CORE_ROOT}/src/domain/BatteryMonitor.cpp"
        "${CORE_ROOT}/src/domain/SensorHealthMonitor.cpp"
        "${CORE_ROOT}/src/domain/SoftStart.cpp"
        "${CORE_ROOT}/src/domain/WallCentering.cpp"
        "${CORE_ROOT}/src/domain/WheelStall.cpp"
        "${CORE_ROOT}/src/domain/BridgeDrive.cpp"
        "${CORE_ROOT}/src/drivers/Vl53l1x.cpp"
        "${CORE_ROOT}/src/domain/MotorVoltage.cpp"
        "${CORE_ROOT}/src/controller/TrapezoidProfile.cpp"
        "${CORE_ROOT}/src/controller/WheelLoop.cpp"
        "${CORE_ROOT}/src/controller/StraightMove.cpp"
        "${CORE_ROOT}/src/controller/PivotMove.cpp"
        "${CORE_ROOT}/src/use_cases/Navigator.cpp"
        "${CORE_ROOT}/src/use_cases/SessionManager.cpp"
        "${CORE_ROOT}/src/protocol/ProtocolV1.cpp"
        "${CORE_ROOT}/src/telemetry/TelemetryBuffer.cpp"
        "${CORE_ROOT}/src/telemetry/TelemetryEmitter.cpp"
        # Adapters - só compilam aqui, no alvo
        "${CORE_ROOT}/src/adapters/I2cBus.cpp"
        "${CORE_ROOT}/src/adapters/IdfRegisterBus.cpp"
        "${CORE_ROOT}/src/adapters/MotorDriver.cpp"
        "${CORE_ROOT}/src/adapters/Encoders.cpp"
        "${CORE_ROOT}/src/adapters/Vl53l1xSensorAdapter.cpp"
        "${CORE_ROOT}/src/adapters/Mpu6050.cpp"
        "${CORE_ROOT}/src/adapters/Ina219.cpp"
        "${CORE_ROOT}/src/adapters/Drv8833MotionAdapter.cpp"
        "${CORE_ROOT}/src/adapters/LocalInterfaceAdapter.cpp"
        "${CORE_ROOT}/src/adapters/DipReaderAdapter.cpp"
        "${CORE_ROOT}/src/adapters/BleTelemetryAdapter.cpp"
        "${CORE_ROOT}/src/adapters/BenchMotionAdapter.cpp"
        # Composition root
        "${CORE_ROOT}/src/main.cpp"
    INCLUDE_DIRS "${CORE_ROOT}/include"
    REQUIRES driver esp_driver_i2c esp_driver_pcnt esp_driver_ledc esp_rom esp-nimble-cpp)

target_compile_features(${COMPONENT_LIB} PUBLIC cxx_std_17)
