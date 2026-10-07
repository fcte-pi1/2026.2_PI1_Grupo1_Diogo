# syntax=docker/dockerfile:1
# Frontend do Micromouse — imagem multi-stage.
# Contexto de build: src/ (para incluir src/backend/protocolo, alias @protocolo).
#   dev   : servidor do Vite com hot reload (usado pelo compose.yaml da raiz)
#   build : gera frontend/dist com os arquivos estáticos (RNF-41)

FROM node:22-bookworm-slim AS base
WORKDIR /workspace/frontend
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# ---------- dependências ----------
FROM base AS deps
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# ---------- desenvolvimento ----------
FROM deps AS dev
COPY backend/protocolo /workspace/backend/protocolo
COPY frontend .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM deps AS build
COPY backend/protocolo /workspace/backend/protocolo
COPY frontend .
RUN npm run build
