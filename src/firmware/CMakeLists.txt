cmake_minimum_required(VERSION 3.21)

project(firmware
    VERSION 0.1.0
    DESCRIPTION "PI1 Group 1 firmware"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Generates compile_commands.json (used by IntelliSense/clangd)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Debug CACHE STRING "Build type" FORCE)
endif()

option(FIRMWARE_BUILD_TESTS "Build native tests (GoogleTest)" ON)
option(FIRMWARE_ENABLE_COVERAGE "Instrument code for coverage report (gcov)" OFF)
option(FIRMWARE_WARNINGS_AS_ERRORS "Treat compiler warnings as errors" OFF)

if(FIRMWARE_ENABLE_COVERAGE AND NOT CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    message(FATAL_ERROR "Coverage supported only with GCC/Clang")
endif()

# Interface library carrying warning flags (and, when enabled, coverage
# instrumentation) only to the project's own targets, never to GoogleTest
add_library(firmware_warnings INTERFACE)
target_compile_options(firmware_warnings INTERFACE
    $<$<CXX_COMPILER_ID:GNU,Clang>:-Wall>
    $<$<CXX_COMPILER_ID:GNU,Clang>:-Wextra>
    $<$<CXX_COMPILER_ID:GNU,Clang>:-Wpedantic>
    $<$<CXX_COMPILER_ID:GNU,Clang>:-Wshadow>
    $<$<CXX_COMPILER_ID:GNU,Clang>:-Wconversion>
    $<$<CXX_COMPILER_ID:MSVC>:/W4>
    $<$<AND:$<BOOL:${FIRMWARE_WARNINGS_AS_ERRORS}>,$<CXX_COMPILER_ID:GNU,Clang>>:-Werror>
    $<$<AND:$<BOOL:${FIRMWARE_WARNINGS_AS_ERRORS}>,$<CXX_COMPILER_ID:MSVC>>:/WX>
)

if(FIRMWARE_ENABLE_COVERAGE)
    target_compile_options(firmware_warnings INTERFACE --coverage -O0 -g)
    target_link_options(firmware_warnings INTERFACE --coverage)
endif()

# Library with firmware logic
add_library(firmware_logic STATIC
    src/domain/Maze.cpp
    src/domain/FloodFill.cpp
    src/use_cases/Navigator.cpp
    src/use_cases/SessionManager.cpp
    src/domain/Odometry.cpp
    src/domain/DipDecoder.cpp
    src/domain/Pid.cpp
    src/controller/MotionController.cpp
    src/protocol/ProtocolV1.cpp
    src/telemetry/TelemetryBuffer.cpp
    src/telemetry/TelemetryEmitter.cpp
)

target_include_directories(firmware_logic PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(firmware_logic PRIVATE
    firmware_warnings
)

# Main executable
add_executable(firmware
    src/main.cpp
)

target_link_libraries(firmware PRIVATE
    firmware_logic
    firmware_warnings
)

if(FIRMWARE_BUILD_TESTS)
    enable_testing()
    add_subdirectory(test)
endif()
