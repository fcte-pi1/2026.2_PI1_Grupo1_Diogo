include(FetchContent)

# GoogleTest automatically downloaded during configuration
FetchContent_Declare(
    googletest
    URL https://github.com/google/googletest/releases/download/v1.17.0/googletest-1.17.0.tar.gz
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)

# Avoids overwriting the MSVC runtime; does not install gtest or build gmock
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
set(BUILD_GMOCK OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

add_executable(firmware_tests
    domain/MazeTest.cpp
    domain/FloodFillTest.cpp
    simulation/SimulatedRobot.hpp
    use_cases/NavigatorTest.cpp
    spy/SpySignalPort.cpp
    use_cases/SessionManagerTest.cpp
)

target_include_directories(firmware_tests PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
)

target_link_libraries(firmware_tests PRIVATE
    firmware_logic
    firmware_warnings
    GTest::gtest_main
)

include(GoogleTest)
gtest_discover_tests(firmware_tests)

# "coverage" target: runs tests and generates HTML report with gcovr,
# failing if line coverage falls below 80%
if(FIRMWARE_ENABLE_COVERAGE)
    find_program(GCOVR_EXECUTABLE gcovr)
    if(GCOVR_EXECUTABLE)
        add_custom_target(coverage
            COMMAND ${CMAKE_CTEST_COMMAND} --output-on-failure
            COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_BINARY_DIR}/coverage
            COMMAND ${GCOVR_EXECUTABLE}
                --root ${PROJECT_SOURCE_DIR}
                --filter ${PROJECT_SOURCE_DIR}/src/
                --filter ${PROJECT_SOURCE_DIR}/include/
                --exclude ${PROJECT_SOURCE_DIR}/src/main.cpp
                --html-details ${CMAKE_BINARY_DIR}/coverage/index.html
                --print-summary
                --fail-under-line 80
                ${CMAKE_BINARY_DIR}
            WORKING_DIRECTORY ${CMAKE_BINARY_DIR}
            DEPENDS firmware_tests
            COMMENT "Generating coverage report at build/.../coverage/index.html"
        )
    else()
        message(WARNING "gcovr not found: 'coverage' target unavailable")
    endif()
endif()
