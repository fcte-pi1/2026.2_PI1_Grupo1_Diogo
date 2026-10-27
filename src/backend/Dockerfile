# syntax=docker/dockerfile:1
# Backend do Micromouse — imagem de DESENVOLVIMENTO (hot reload com tsx), usada pelo
# compose.yaml da raiz. A imagem de produção, com o painel compilado, é o Dockerfile.prod
# (compose.prod.yaml, RNF-58).

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# ---------- dependências (todas) ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------- desenvolvimento ----------
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 8080 9229
CMD ["sh", "-c", "npm run migrate up && npm run dev"]
