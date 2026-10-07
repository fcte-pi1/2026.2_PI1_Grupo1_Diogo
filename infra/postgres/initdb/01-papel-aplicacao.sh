#!/bin/sh
# Executado pelo container do PostgreSQL apenas na criação do volume (banco vazio).
# Cria o papel com que o backend se conecta. As permissões sobre as tabelas são
# concedidas pela migração inicial (src/backend/migracoes), executada pelo dono do banco.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$DB_APP_PASSWORD" <<'SQL'
CREATE ROLE rato_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE :"DBNAME" TO rato_app;
GRANT USAGE ON SCHEMA public TO rato_app;
SQL
