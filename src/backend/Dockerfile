# syntax=docker/dockerfile:1
# Backend do Micromouse — imagem multi-stage.
#   dev  : hot reload com tsx (usado pelo compose.yaml da raiz)
#   prod : JavaScript compilado, apenas dependências de produção (RNF-58)

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

# ---------- build ----------
FROM deps AS build
COPY . .
RUN npm run build

# ---------- produção ----------
FROM base AS prod
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migracoes ./migracoes
USER node
EXPOSE 8080
CMD ["sh", "-c", "npm run migrate up && npm start"]
