# Ambiente de desenvolvimento — Backend e Frontend

Este guia sobe o sistema web do Micromouse (**PostgreSQL + backend + painel**) com Docker, usando hot reload.
O firmware tem um fluxo próprio, descrito em [src/firmware/GUIA_DESENVOLVIMENTO.md](src/firmware/GUIA_DESENVOLVIMENTO.md).

A arquitetura de referência está em [docs/software/backend/3_arquitetura.md](docs/software/backend/3_arquitetura.md) e em [docs/software/frontend/3_arquitetura.md](docs/software/frontend/3_arquitetura.md).

## Pré-requisitos

- Docker com Compose v2 (Docker Desktop no macOS/Windows).
- Opcional: Node.js ≥ 22.22, para ter tipos e lint no editor e rodar os testes de integração no host.

## Subir o ambiente

```bash
cp .env.example .env          # só na primeira vez
docker compose up --build     # use -d para rodar em segundo plano
docker compose exec backend npm run seed   # dados do ambiente de teste (só na primeira vez)
```

| Serviço | URL | Observação |
|:--|:--|:--|
| Painel (Vite) | http://localhost:5173 | Faz proxy de `/api`, `/ws` e `/health` para o backend |
| Backend (HTTP + WS) | http://localhost:8080 | `/health`, `/ws/telemetria`, `/ws/painel` |
| PostgreSQL 16 | `localhost:5432` | Dono: `rato` / `rato_dev` · App: `rato_app` / `rato_app_dev` |

Ao subir, o backend instala as dependências que faltarem, aplica as migrações pendentes e inicia com `tsx watch`. Alterações em `src/backend` reiniciam o processo, e alterações em `src/frontend` chegam ao navegador por HMR.

O **seed** cria o ambiente AMB dos [casos de teste](docs/software/backend/4_casos_de_teste.md): o dispositivo `sim-01` (token `T-VALIDO`), o operador `op1` (senha em `SEED_OPERADOR_SENHA`) e a apresentação "Teste" ativa. Ele pode ser executado várias vezes sem duplicar dados.

### Parâmetros da derivação

Ambos são opcionais. Ficam comentados no `.env.example`, com os valores padrão, e o `compose.yaml` os repassa ao backend. Um valor inválido impede o backend de subir, com a mensagem de erro no log.

| Variável | Padrão | Uso |
|:--|:--|:--|
| `CURVA_CARGA` | `8.4:100,7.6:50,7.0:10,6.0:0` | Curva `tensão:carga %` da bateria, interpolada entre os pontos, para a carga estimada (RF-85). Precisa ser validada com a frente de Energia |
| `LIMIAR_TENSAO_BAIXA_V` | `7.0` | Abaixo dele, os painéis recebem o alerta `TENSAO_BAIXA` (RF-86). O alerta só volta a disparar depois de a tensão subir 0,1 V acima do limiar |

## Comandos do dia a dia

```bash
docker compose logs -f backend              # logs (pino formatado)
docker compose exec backend npm test        # testes unitários do backend
docker compose exec frontend npm test       # testes unitários e de componentes do painel
docker compose exec backend npm run lint    # ESLint
docker compose exec backend npm run depcruise   # regras de dependência entre camadas
docker compose exec db psql -U rato -d rato_borrachudo   # console SQL

docker compose exec backend npm run migrate:create -- nome-da-migracao   # nova migração SQL
docker compose exec backend npm run migrate up      # aplicar
docker compose exec backend npm run migrate down    # desfazer a última

docker compose down        # para tudo e mantém os dados
docker compose down -v     # para tudo e APAGA o banco e os node_modules dos containers
```

**Testes de integração** (PostgreSQL real via Testcontainers): rode no host, porque eles precisam do Docker.

```bash
cd src/backend && npm install && npm run test:integracao
```

## Receber dados do robô (Bluetooth)

O robô envia a telemetria por Bluetooth de baixa energia (BLE). Como o container não enxerga o Bluetooth do computador, uma **ponte** roda no notebook, fora do Docker, e repassa as mensagens ao backend em `/ws/telemetria`.

A ponte oficial é a do firmware, em Python: `src/firmware/bridge/ble_ws_bridge.py` (entra no repositório com o PR do firmware). O robô real se identifica como `rato-01`; o seed já o cadastra com o token de `SEED_ROBO_TOKEN`.

A pasta `src/backend/ponte/` é uma versão anterior, para Bluetooth Clássico, que **não conversa com o robô** e será removida. Ela ainda serve para enviar um arquivo de mensagens ao backend sem o robô:

```bash
cd src/backend && npm install
cat corrida.ndjson | npm run ponte -- --porta -
```

O formato das mensagens está em [src/backend/protocolo/v1/README.md](src/backend/protocolo/v1/README.md).

## Implantação (apresentação e testes de integração)

Para usar o sistema de verdade (sem hot reload), há uma imagem de produção: o backend compilado, com o painel compilado servido por ele na **mesma porta** (RNF-58, CT-BE-38).

```bash
cp .env.example .env        # troque as senhas, o JWT_SECRET e os SEED_*
docker compose -f compose.prod.yaml up -d --build
```

Use sempre o `--build`: sem ele, uma imagem `rato-borrachudo/sistema-web` já presente não é reconstruída, e quem atualizou o código sobe a versão antiga sem perceber.

**Credenciais.** O compose de produção não sobe sem `SEED_DISPOSITIVO_TOKEN`, `SEED_ROBO_TOKEN` e `SEED_OPERADOR_SENHA` no `.env`. O seed também confere: em produção, falha se faltar alguma e avisa no log se uma delas ainda tiver o valor público de desenvolvimento do `.env.example`. O `SEED_ROBO_TOKEN` precisa ser o mesmo `TELEMETRY_TOKEN` compilado no firmware.

**Senhas nas URLs do banco.** O `POSTGRES_PASSWORD` e o `DB_APP_PASSWORD` entram no `DATABASE_URL` sem codificação. Use só letras e números. Um `@`, `:`, `/`, `#` ou `%` gera uma URL inválida e um erro de conexão difícil de entender.

**Seed em quem já subiu antes.** O banco fica no volume, e o seed não troca tudo a cada subida:
- **Atualizados a cada subida:** o token do `rato-01` (`SEED_ROBO_TOKEN`) e, com o #376, a senha do `op1` (`SEED_OPERADOR_SENHA`).
- **Gravados só na primeira subida:** os tokens do `sim-01` e do `sim-02` (`SEED_DISPOSITIVO_TOKEN`). Para trocá-los, apague o volume (`down -v`). Os dois simuladores ficam cadastrados também em produção, com o mesmo token, para os testes com o simulador na rede da apresentação.

- **Painel e API:** `http://<endereço-do-notebook>:8080`. O painel deriva o endereço do WebSocket da própria página, então funciona com o IP que o notebook receber na rede local. Os outros computadores e celulares da rede acessam o mesmo endereço.
- **Ao subir**, o backend aplica as migrações e roda o seed (idempotente): dispositivos `sim-01`, `sim-02` e `rato-01`, com os tokens do `.env`, o operador `op1` e a apresentação "Teste".
- **Banco** em volume próprio (`rato-borrachudo-prod_pgdata`), separado do de desenvolvimento, e sem porta publicada.
- **Parar:** `docker compose -f compose.prod.yaml down`. Para apagar os dados: `down -v`.
- Logs com `LOG_LEVEL_PROD` (padrão `info`).

### Rede isolada, sem internet

Gere as imagens numa máquina com internet e leve o arquivo no pendrive (cerca de 200 MB):

```bash
# Na máquina com internet. A plataforma é a do NOTEBOOK que vai rodar o sistema
# (linux/amd64 para os notebooks x86 comuns), e vale para o banco e para o backend.
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker compose -f compose.prod.yaml pull db
docker compose -f compose.prod.yaml build
docker save --platform linux/amd64 rato-borrachudo/sistema-web:latest postgres:16-alpine | gzip > rato-imagens.tar.gz

# No notebook da apresentação, com o repositório e o .env
docker load -i rato-imagens.tar.gz
docker compose -f compose.prod.yaml up -d --no-build
```

> **Atenção à arquitetura.** Uma imagem gerada num Mac com Apple Silicon é ARM e **não roda** num notebook Windows ou Linux comum (x86). O `DOCKER_DEFAULT_PLATFORM=linux/amd64` resolve, desde que esteja definido **antes** do `pull` e do `build`, e o `docker save` também leve `--platform` (o Docker Desktop guarda as duas arquiteturas do PostgreSQL com o mesmo nome e, sem ele, salva a da máquina). No PowerShell: `$env:DOCKER_DEFAULT_PLATFORM="linux/amd64"`.

Medido em 20/10, num Mac com as imagens já construídas ou carregadas: do `up` ao `/health` com `200` em **3,5 s**, com o banco vazio (migrações e seed incluídos). A meta do RNF-58 é 2 min. A construção a frio da imagem (`npm ci` do backend e do painel, `vite build` e `tsc`) não entra nessa conta: ela é feita antes, na máquina com internet, como no roteiro acima.

## Estrutura

```
compose.yaml                     # db + backend + frontend (desenvolvimento)
.env.example                     # variáveis do ambiente (copiar para .env)
infra/postgres/initdb/           # cria o papel rato_app na criação do banco
src/backend/
├── migracoes/                   # SQL versionado (node-pg-migrate) — DER da arquitetura §7
├── protocolo/                   # tipos.ts (compartilhado com o painel via @protocolo) e esquemas v1
├── ponte/                       # versão anterior da ponte (Bluetooth Clássico); será removida
├── scripts/seed.ts
├── src/{config,adaptadores,aplicacao,dominio,infra}
└── testes/{unit,integracao,e2e}
src/frontend/
├── src/{app,paginas,componentes,view-model,formatacao,estado,dominio,adaptadores,protocolo,estilos}
└── testes/{unit,componentes,e2e}
```

As regras de dependência das seções 5 (backend) e 5.2 (frontend) da arquitetura são verificadas pelo `dependency-cruiser`. Por exemplo, `dominio/` não importa nada de fora dele.

## Banco de dados: dois usuários

- **`rato`** (dono): executa as migrações e o seed (`DATABASE_URL`).
- **`rato_app`**: é o usuário com que o backend se conecta (`DATABASE_URL_APP`). Ele tem apenas `SELECT`/`INSERT` em `mensagem`, `anulacao` e nas projeções, e `UPDATE` só em `corrida` e `apresentacao`. Essa é a segunda barreira, além dos triggers append-only e de imutabilidade (arquitetura do backend, §7.3).

Uma tabela nova precisa de `GRANT` para `rato_app` na própria migração.

## Problemas comuns

| Sintoma | Solução |
|:--|:--|
| Porta 5432, 8080 ou 5173 em uso | Troque `DB_PORT`, `BACKEND_PORT` ou `FRONTEND_PORT` no `.env` |
| Alterações não recarregam | Defina `CHOKIDAR_USEPOLLING=true` no `.env` e rode `docker compose up -d` |
| Erro de dependência após `git pull` | `docker compose restart backend frontend` (o `npm install` roda na subida) |
| `password authentication failed for user "rato_app"` | O `DB_APP_PASSWORD` mudou depois da criação do volume: `docker compose down -v` e suba de novo |
| O mesmo erro no **Windows**, num clone feito antes do `.gitattributes` | O script `infra/postgres/initdb/01-papel-aplicacao.sh` ficou com CRLF. O `git pull` não o reescreve: apague o arquivo e restaure-o com `git checkout -- infra/postgres/initdb/01-papel-aplicacao.sh` (ele volta com LF), depois `docker compose down -v` e suba de novo |
| Banco em estado estranho | `docker compose down -v && docker compose up -d`, depois rode o seed de novo |
