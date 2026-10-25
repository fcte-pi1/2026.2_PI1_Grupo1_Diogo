# Projeto Conceitual — Backend

Documentação da frente de backend para o [Projeto Conceitual de Software](../../4.4%20-%20Projeto%20conceitual%20de%20software.md) (AP5).

| Documento | Conteúdo | Issue |
|:--|:--|:--|
| [1 — Histórias de Usuário](1_historias_de_usuario.md) | Backlog do backend: HU-BE-01 a HU-BE-27 (RF-72 a RF-98), com critérios de aceitação e rastreabilidade dos RNF-48 a RNF-58 | [#242](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/242) |
| [2 — Diagrama de Atividades](2_diagrama_de_atividades.md) | Raia do backend: recepção, validação, persistência, confirmação e monitoramento de sinal (PlantUML + SVG) | [#247](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/247) |
| [3 — Arquitetura](3_arquitetura.md) | Padrão, stack, protocolo, visões lógica/processos/implementação, MER e DER (PostgreSQL) | [#253](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/253) |
| [4 — Casos de Teste](4_casos_de_teste.md) | Roteiro de testes funcionais CT-BE-01 a CT-BE-38 e matriz de rastreabilidade RF/HU ↔ CT | [#258](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/258) |
| [5 — Medições de Desempenho](5_medicoes_desempenho.md) | Execução e resultados do CT-BE-32 (latência, RNF-48), CT-BE-33 (carga, RNF-49 e RNF-51) e CT-BE-34 (recuperação, RNF-52), com os scripts em [`src/backend/medicoes/`](../../../src/backend/medicoes/README.md) | [#373](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/373) |

**Rastreabilidade de ponta a ponta:** RF-NN ↔ HU-BE-(NN−71) ↔ CT-BE-xx (matriz em [4_casos_de_teste.md](4_casos_de_teste.md#matriz-de-rastreabilidade)).

**Diagramas:** as fontes editáveis (`.puml`/`.mmd`) e as imagens exportadas (`.svg`) ficam em [`diagramas/`](diagramas/README.md), conforme o *Guia da Equipe de Software* (§7).
