# Guia de desenvolvimento do firmware

Este guia descreve como o projeto do firmware está organizado e como compilar, executar, testar e medir a cobertura de testes do código.

## Estrutura do projeto

```text
firmware/
├── CMakeLists.txt          # Build principal: biblioteca, executável e opções
├── CMakePresets.json       # Presets de configuração (debug, release, coverage)
├── .clang-format           # Estilo de código (base Google, indentação 4, 100 colunas)
├── .gitignore              # Ignora a pasta build/
├── .vscode/                # Configuração compartilhada do VS Code
│   ├── extensions.json     # Extensões recomendadas
│   ├── settings.json       # Integração com CMake Tools e IntelliSense
│   ├── tasks.json          # Tarefas: configurar, compilar, executar, testar, cobertura
│   └── launch.json         # Depuração com gdb
├── include/                # Headers públicos (.hpp)
│   └── hello.hpp
├── src/                    # Implementação (.cpp)
│   ├── hello.cpp           # Lógica do firmware (vira a biblioteca "hello")
│   └── main.cpp            # Ponto de entrada (executável "firmware")
├── tests/                  # Testes nativos com GoogleTest
│   ├── CMakeLists.txt      # Baixa o GoogleTest e define os alvos de teste/cobertura
│   └── test_hello.cpp
└── build/                  # Gerada pelo CMake (não versionada)
```

### Organização do código

- **A lógica fica em bibliotecas.** O código em `src/` (exceto `main.cpp`) é compilado como biblioteca e usado tanto pelo executável quanto pelos testes. Assim os testes rodam no computador sem precisar do microcontrolador.
- **`main.cpp` deve ser mínimo.** Ele só inicializa e chama a lógica da biblioteca. Por isso fica fora do cálculo de cobertura.
- **Headers em `include/`, implementação em `src/`.** Todo o código usa o namespace `firmware`.
- **Cada módulo tem seu arquivo de teste** em `tests/`, chamado `test_<modulo>.cpp`.

## Pré-requisitos

| Ferramenta       | Versão mínima   | Uso                                           |
| ---------------- | --------------- | --------------------------------------------- |
| CMake            | 3.21            | Configuração e build (os presets exigem 3.21) |
| GCC/G++ ou Clang | suporte a C++17 | Compilador                                    |
| gcovr            | —               | Relatório de cobertura (opcional)             |
| gdb              | —               | Depuração (opcional)                          |

O **GoogleTest não precisa ser instalado**: o CMake baixa a versão 1.17.0 automaticamente via `FetchContent` na primeira configuração, então é preciso ter internet nesse momento.

Para instalar o gcovr:

```bash
sudo apt install gcovr
```

## Como usar

Todos os comandos devem ser executados dentro da pasta `src/firmware/`.

### Presets disponíveis

| Preset     | Tipo de build | Testes | Cobertura | Pasta de saída    |
| ---------- | ------------- | ------ | --------- | ----------------- |
| `debug`    | Debug         | Sim    | Não       | `build/debug/`    |
| `release`  | Release       | Não    | Não       | `build/release/`  |
| `coverage` | Debug         | Sim    | Sim       | `build/coverage/` |

### Compilar e executar

```bash
cmake --preset debug             # configura (só é necessário na primeira vez ou ao mudar o CMake)
cmake --build --preset debug     # compila
./build/debug/firmware           # executa
```

### Rodar os testes

```bash
cmake --build --preset debug
ctest --preset debug
```

Outras formas úteis:

```bash
ctest --preset debug -R HelloMessage                            # roda só os testes cujo nome casa com o filtro
./build/debug/tests/firmware_tests                              # roda o binário de testes direto (saída do GoogleTest)
./build/debug/tests/firmware_tests --gtest_filter='SayHello.*'  # filtra pelo nome da suite de testes
```

### Gerar o relatório de cobertura

```bash
cmake --preset coverage
cmake --build --preset coverage --target coverage
```

Esse build compila o código com instrumentação (`--coverage`), roda todos os testes e gera o relatório:

- **Resumo no terminal**: percentual de linhas, funções e branches.
- **Relatório HTML**: `build/coverage/coverage/index.html`.

O build **falha se a cobertura de linhas ficar abaixo de 80%**, que é a meta da etapa. Se o gcovr não estiver instalado, o CMake só mostra um aviso e o alvo `coverage` não é criado.

### Build de release

```bash
cmake --preset release
cmake --build --preset release
```

### Opções do CMake

Os presets já definem estas opções. Elas também podem ser passadas manualmente com `-D`:

| Opção                      | Padrão | Descrição                        |
| -------------------------- | ------ | -------------------------------- |
| `FIRMWARE_BUILD_TESTS`     | `ON`   | Compila os testes com GoogleTest |
| `FIRMWARE_ENABLE_COVERAGE` | `OFF`  | Instrumenta o código para o gcov |

## Usando no VS Code

Ao abrir a pasta `src/firmware/` no VS Code, instale as extensões recomendadas (_C/C++_, _CMake Tools_ e _CMake_). O projeto é configurado automaticamente com o preset `debug`.

Tarefas disponíveis em **Terminal → Run Task**:

| Tarefa                             | Atalho         | O que faz                   |
| ---------------------------------- | -------------- | --------------------------- |
| CMake: configurar (debug)          | —              | `cmake --preset debug`      |
| CMake: compilar (debug)            | `Ctrl+Shift+B` | Configura e compila         |
| Executar firmware                  | —              | Compila e executa o binário |
| CTest: executar testes (debug)     | —              | Compila e roda os testes    |
| Cobertura: gerar relatório (gcovr) | —              | Build de cobertura completo |

Para depurar, use **F5** com a configuração _Depurar firmware (gdb)_.

O código é formatado automaticamente ao salvar, seguindo o `.clang-format`.

### Trocando o que o F7 compila

O **F7** (_CMake: Build_) compila conforme o preset e o alvo selecionados na extensão CMake Tools. Para trocar, use a paleta de comandos (`Ctrl+Shift+P`) ou o painel do CMake na barra lateral:

1. `CMake: Select Configure Preset` → `debug`, `release` ou `coverage`
2. `CMake: Select Build Preset` → o preset de mesmo nome
3. `CMake: Set Build Target` → `all`, `firmware`, `firmware_tests` ou `coverage`

Para gerar a cobertura pelo F7, selecione o preset `coverage` e o alvo `coverage`. Para voltar ao normal, selecione o preset `debug` e o alvo `all`.

## Adicionando código novo (fluxo TDD)

1. **Escreva o teste primeiro.** Crie `tests/test_<modulo>.cpp` e registre o arquivo em `tests/CMakeLists.txt`:

   ```cmake
   add_executable(firmware_tests
       test_hello.cpp
       test_<modulo>.cpp
   )
   ```

2. **Declare a interface** em `include/<modulo>.hpp`.
3. **Implemente** em `src/<modulo>.cpp` e adicione o arquivo a uma biblioteca no `CMakeLists.txt` da raiz. Ele pode entrar na biblioteca existente ou em uma nova; nesse caso, ligue a nova biblioteca a `firmware` e a `firmware_tests` com `target_link_libraries`.
4. **Rode os testes** (`ctest --preset debug`) até passarem.
5. **Confira a cobertura** (`cmake --build --preset coverage --target coverage`) antes de abrir o merge request.

Exemplo de teste:

```cpp
#include "module.hpp"

#include <gtest/gtest.h>

namespace {

TEST(NomeDoModulo, DescricaoDoComportamento) {
    EXPECT_EQ(firmware::funcao(2), 4);
}

}  // namespace
```

Os nomes dos testes e variáveis no código-fonte são escritos em inglês. Os testes são descobertos automaticamente pelo `gtest_discover_tests`, então não é preciso registrar cada `TEST` no CMake.

## Solução de problemas

| Problema                                         | Solução                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Erro ao baixar o GoogleTest                      | Verifique a conexão com a internet; o download acontece só na primeira configuração |
| `gcovr not found: 'coverage' target unavailable` | Instale o gcovr e rode `cmake --preset coverage` de novo                            |
| IntelliSense não encontra os headers             | Rode `cmake --preset debug` para gerar o `build/debug/compile_commands.json`        |
| Comportamento estranho após mudar o CMake        | Apague a pasta do preset (ex.: `rm -rf build/debug`) e configure de novo            |
