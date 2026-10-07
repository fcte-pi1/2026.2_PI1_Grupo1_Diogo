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

## Estrutura

```
compose.yaml                     # db + backend + frontend (desenvolvimento)
.env.example                     # variáveis do ambiente (copiar para .env)
infra/postgres/initdb/           # cria o papel rato_app na criação do banco
src/backend/
├── migracoes/                   # SQL versionado (node-pg-migrate) — DER da arquitetura §7
├── protocolo/                   # tipos.ts (compartilhado com o painel via @protocolo) e esquemas v1
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
| Banco em estado estranho | `docker compose down -v && docker compose up -d`, depois rode o seed de novo |
