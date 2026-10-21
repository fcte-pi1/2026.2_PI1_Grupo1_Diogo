# Firmware de DIAGNÓSTICO (console serial, um comando por componente) para testar o
# hardware peça por peça. Reutiliza os MESMOS adapters do robô (../include e ../src).
# Uso:  idf.py -C esp32-diagnostico set-target esp32s3 && idf.py -C esp32-diagnostico build
# Roteiro de testes: ../TESTES_HARDWARE.md
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(micromouse_diagnostico)
