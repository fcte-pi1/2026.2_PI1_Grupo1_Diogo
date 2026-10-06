cmake_minimum_required(VERSION 3.20)

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

# Coverage instrumentation: applied to all project targets
if(FIRMWARE_ENABLE_COVERAGE)
    if(NOT CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
        message(FATAL_ERROR "Coverage supported only with GCC/Clang")
    endif()
    add_compile_options(--coverage -O0 -g)
    add_link_options(--coverage)
endif()

add_library(firmware_warnings INTERFACE)
target_compile_options(firmware_warnings INTERFACE
    $<$<CXX_COMPILER_ID:GNU,Clang>:-Wall>
    $<$<CXX_COMPILER_ID:GNU,Clang>:-Wextra>
    $<$<CXX_COMPILER_ID:GNU,Clang>:-Wpedantic>
    $<$<CXX_COMPILER_ID:MSVC>:/W4>
)

# Library with firmware logic
add_library(hello src/hello.cpp)
target_include_directories(hello PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)
target_link_libraries(hello PRIVATE firmware_warnings)

# Main executable
add_executable(firmware src/main.cpp)
target_link_libraries(firmware PRIVATE hello firmware_warnings)

if(FIRMWARE_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
