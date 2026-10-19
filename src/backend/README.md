# _Backend_

> [!NOTE]
> **Como rodar e configurar:** [`DESENVOLVIMENTO.md`](../../DESENVOLVIMENTO.md), na raiz do repositório: subir o ambiente, comandos do dia a dia e as variáveis de ambiente, inclusive os parâmetros da derivação (`CURVA_CARGA` e `LIMIAR_TENSAO_BAIXA_V`). Os valores padrão estão comentados no [`.env.example`](../../.env.example).
>
> **Protocolos:** robô → backend em [`protocolo/v1/README.md`](protocolo/v1/README.md), API HTTP em [`protocolo/v1/API.md`](protocolo/v1/API.md) e painel em [`protocolo/v1/PAINEL.md`](protocolo/v1/PAINEL.md).

Esta pasta deverá armazenar arquivos referentes a:

- Código-fonte da API REST: rotas, controladores, modelos e lógica de negócio.
- Arquivos de configuração do servidor: `app.py`, `server.js`, `main.go` etc., dependendo da linguagem/framework utilizado ([Flask](https://flask.palletsprojects.com/), [FastAPI](https://fastapi.tiangolo.com/), [Express](https://expressjs.com/), [Django](https://www.djangoproject.com/) etc.).
- Arquivos de definição de dependências: `requirements.txt` ou `pyproject.toml` (Python), `package.json` (Node.js), `pom.xml` (Java/Maven) etc.
- Scripts de migração e esquemas de banco de dados: arquivos `.sql`, scripts de migração ([Alembic](https://alembic.sqlalchemy.org/), [Sequelize](https://sequelize.org/) etc.) e seeds de dados para desenvolvimento.
- Arquivos de configuração de ambiente: `.env.example` com as variáveis de ambiente necessárias (nunca o `.env` real).
- Arquivos de containerização: `Dockerfile` e `docker-compose.yml`, caso o serviço seja executado em contêiner.

Evite incluir:

- Credenciais e segredos: arquivos `.env`, chaves de API, senhas, tokens de acesso ou qualquer dado sensível **nunca** devem ser versionados.
- Artefatos de build: diretórios como `__pycache__/`, `dist/`, `build/`, `.eggs/` devem ser gerados localmente e ignorados via `.gitignore`.
- Dependências instaladas: pastas como `node_modules/` ou ambientes virtuais Python (`venv/`, `.env/`) não devem ser incluídos no repositório.
- Arquivos temporários/específicos do sistema operacional: arquivos gerados automaticamente pelo sistema ou pelo gerenciador de arquivos (ex.: `*~`, `.DS_Store`, `Thumbs.db`).
> [!WARNING]
> **Não acrescente arquivos referentes ao _frontend_ nesta pasta.** Eles deverão ser armazenados na pasta [frontend](https://github.com/fcte-pi1/template/tree/main/src/frontend) deste repositório.