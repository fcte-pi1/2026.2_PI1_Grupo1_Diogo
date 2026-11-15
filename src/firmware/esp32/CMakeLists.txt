# Projeto ESP-IDF (alvo ESP32-S3). Reutiliza include/ e src/ da raiz.
# Uso:  idf.py -C esp32 set-target esp32s3 && idf.py -C esp32 build
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(micromouse_firmware)
