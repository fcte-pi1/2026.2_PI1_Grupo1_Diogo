-- Esquema inicial do banco do Micromouse.
-- Fonte: docs/software/backend/3_arquitetura.md, seção 7 (MER, DER e restrições).

-- Up Migration

-- ---------------------------------------------------------------------------
-- Tipos enumerados (§7.2)
-- ---------------------------------------------------------------------------
CREATE TYPE tipo_labirinto      AS ENUM ('4x4', '8x4', '12x4');
CREATE TYPE status_corrida      AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA', 'FALHOU', 'INTERROMPIDA');
CREATE TYPE motivo_termino      AS ENUM ('SUCESSO', 'FALHA_REPORTADA', 'SEM_SINAL', 'REINICIO_ROBO');
CREATE TYPE tipo_mensagem       AS ENUM ('inicio_corrida', 'celula', 'posicao', 'energia', 'estado', 'fim_corrida');
CREATE TYPE tipo_evento_conexao AS ENUM ('CONECTADO', 'SINAL_PERDIDO', 'SINAL_RETOMADO', 'DESCONECTADO', 'REINICIO_DETECTADO');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
CREATE TABLE dispositivo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identificador text NOT NULL UNIQUE,
  nome          text NOT NULL,
  token_hash    text NOT NULL,                 -- hash argon2 do token
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operador (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login      text NOT NULL UNIQUE,
  nome       text NOT NULL,
  senha_hash text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE apresentacao (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  data       date NOT NULL DEFAULT current_date,
  ativa      boolean NOT NULL DEFAULT false,
  criada_em  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE corrida (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispositivo_id       uuid NOT NULL REFERENCES dispositivo (id),
  id_corrida_robo      text NOT NULL,
  boot                 text NOT NULL,
  apresentacao_id      uuid REFERENCES apresentacao (id),   -- nulo fora de apresentação
  tipo_labirinto       tipo_labirinto NOT NULL,
  numero_tentativa     integer,
  status               status_corrida NOT NULL DEFAULT 'EM_ANDAMENTO',
  motivo_termino       motivo_termino,
  detalhe_termino      text,
  versao_protocolo     smallint NOT NULL,
  t_inicio_robo_ms     bigint,
  t_fim_robo_ms        bigint,
  tempo_conclusao_ms   integer,
  transicoes_celula    integer NOT NULL DEFAULT 0,
  distancia_m          numeric(8,2) GENERATED ALWAYS AS (transicoes_celula * 0.18) STORED,
  velocidade_media_mps numeric(6,3),
  revisitas            integer NOT NULL DEFAULT 0,
  tensao_inicial_v     numeric(5,3),
  tensao_final_v       numeric(5,3),
  delta_v              numeric(5,3),
  carga_inicial_pct    numeric(5,2),
  carga_final_pct      numeric(5,2),
  ultimo_seq_contiguo  integer NOT NULL DEFAULT 0,
  seqs_faltantes       integer NOT NULL DEFAULT 0,
  iniciada_em          timestamptz NOT NULL DEFAULT now(),
  encerrada_em         timestamptz,

  -- Idempotência e unicidade (RF-78, RF-97)
  CONSTRAINT uq_corrida_robo      UNIQUE (dispositivo_id, id_corrida_robo),
  CONSTRAINT uq_corrida_tentativa UNIQUE (apresentacao_id, tipo_labirinto, numero_tentativa)
);

-- Registro append-only de cada mensagem aceita (RF-77, RF-79). Fonte da verdade.
CREATE TABLE mensagem (
  corrida_id       uuid NOT NULL REFERENCES corrida (id),
  seq              integer NOT NULL CHECK (seq >= 1),
  tipo             tipo_mensagem NOT NULL,
  t_robo_ms        bigint NOT NULL,
  versao_protocolo smallint NOT NULL,
  payload          jsonb NOT NULL,
  recebida_em      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corrida_id, seq)
);

-- Projeção de mensagem tipo `celula`: o trajeto (RF-84).
CREATE TABLE passagem_celula (
  corrida_id uuid NOT NULL,
  seq        integer NOT NULL,
  ordem      integer NOT NULL,
  x          smallint NOT NULL,
  y          smallint NOT NULL,
  paredes    smallint NOT NULL CHECK (paredes BETWEEN 0 AND 15),  -- bits N=1 L=2 S=4 O=8
  t_robo_ms  bigint NOT NULL,
  revisita   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (corrida_id, seq),
  FOREIGN KEY (corrida_id, seq) REFERENCES mensagem (corrida_id, seq)
);

-- Projeção de mensagem tipo `energia`: a série de energia (RF-85).
CREATE TABLE leitura_energia (
  corrida_id uuid NOT NULL,
  seq        integer NOT NULL,
  t_robo_ms  bigint NOT NULL,
  tensao_v   numeric(5,3) NOT NULL,
  corrente_a numeric(6,3) NOT NULL,
  potencia_w numeric(6,3) NOT NULL,
  PRIMARY KEY (corrida_id, seq),
  FOREIGN KEY (corrida_id, seq) REFERENCES mensagem (corrida_id, seq),
  CONSTRAINT ck_tensao CHECK (tensao_v BETWEEN 5.0 AND 9.0)
);

-- Estado completo do mapa num seq de corte (RF-80, RNF-52).
CREATE TABLE snapshot_mapa (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  corrida_id        uuid NOT NULL REFERENCES corrida (id),
  seq_corte         integer NOT NULL,
  celulas_visitadas integer NOT NULL,
  estado            jsonb NOT NULL,                -- paredes, posição e métricas
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_snapshot_corte UNIQUE (corrida_id, seq_corte)
);

-- Anulação auditável; a corrida finalizada nunca é alterada (RF-96, RNF-54).
CREATE TABLE anulacao (
  corrida_id  uuid PRIMARY KEY REFERENCES corrida (id),
  operador_id uuid NOT NULL REFERENCES operador (id),
  motivo      text NOT NULL,
  anulada_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_motivo CHECK (length(trim(motivo)) > 0)
);

CREATE TABLE evento_conexao (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dispositivo_id uuid NOT NULL REFERENCES dispositivo (id),
  corrida_id     uuid REFERENCES corrida (id),
  tipo           tipo_evento_conexao NOT NULL,
  boot           text,
  ocorrido_em    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mensagem_rejeitada (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dispositivo_id uuid REFERENCES dispositivo (id),   -- nulo quando anterior à autenticação
  corrida_robo   text,
  seq            integer,
  motivo_codigo  text NOT NULL,
  detalhe        text,
  payload        jsonb,
  recebida_em    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Restrições e índices (§7.3)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX uq_apresentacao_ativa ON apresentacao (ativa) WHERE ativa;

CREATE INDEX ix_corrida_listagem    ON corrida (tipo_labirinto, status, iniciada_em DESC);
CREATE INDEX ix_corrida_leaderboard ON corrida (tipo_labirinto, tempo_conclusao_ms, distancia_m)
  WHERE status = 'CONCLUIDA';
CREATE INDEX ix_evento_conexao_dispositivo ON evento_conexao (dispositivo_id, ocorrido_em);

-- Registro append-only (RF-79)
CREATE FUNCTION impedir_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tabela % é append-only', TG_TABLE_NAME;
END $$;

CREATE TRIGGER tg_mensagem_append_only
  BEFORE UPDATE OR DELETE ON mensagem
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();

CREATE TRIGGER tg_anulacao_append_only
  BEFORE UPDATE OR DELETE ON anulacao
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao();

-- Corrida finalizada é imutável (RNF-54)
CREATE FUNCTION proteger_corrida_finalizada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status IN ('CONCLUIDA', 'FALHOU') THEN
    RAISE EXCEPTION 'corrida % não pode ser alterada', OLD.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_corrida_imutavel
  BEFORE UPDATE OR DELETE ON corrida
  FOR EACH ROW EXECUTE FUNCTION proteger_corrida_finalizada();

-- Ranking (RF-95): só CONCLUÍDAS e não anuladas; desempate pela menor distância
CREATE VIEW vw_leaderboard AS
SELECT c.tipo_labirinto,
       RANK() OVER (PARTITION BY c.tipo_labirinto
                    ORDER BY c.tempo_conclusao_ms, c.distancia_m) AS posicao,
       c.id AS corrida_id, c.apresentacao_id, c.numero_tentativa,
       c.tempo_conclusao_ms, c.distancia_m, c.velocidade_media_mps, c.encerrada_em
FROM corrida c
LEFT JOIN anulacao a ON a.corrida_id = c.id
WHERE c.status = 'CONCLUIDA' AND a.corrida_id IS NULL;

-- ---------------------------------------------------------------------------
-- Permissões do papel da aplicação (§7.3): segunda barreira além dos triggers.
-- Em desenvolvimento o papel é criado com LOGIN por infra/postgres/initdb; aqui ele é
-- criado sem login apenas se não existir (ex.: banco efêmero dos testes de integração).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rato_app') THEN
    CREATE ROLE rato_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO rato_app;

-- Apenas INSERT e SELECT nas tabelas append-only
GRANT SELECT, INSERT ON mensagem, anulacao TO rato_app;
-- Projeções e auditoria: só inserção e leitura
GRANT SELECT, INSERT ON passagem_celula, leitura_energia, snapshot_mapa,
                       evento_conexao, mensagem_rejeitada TO rato_app;
-- Corrida e apresentação mudam de estado (protegidas por trigger quando finalizadas)
GRANT SELECT, INSERT, UPDATE ON corrida, apresentacao TO rato_app;
-- Cadastros: somente leitura (mantidos pelo dono do banco / seed)
GRANT SELECT ON dispositivo, operador TO rato_app;
GRANT SELECT ON vw_leaderboard TO rato_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO rato_app;

-- Down Migration

DROP VIEW IF EXISTS vw_leaderboard;
DROP TABLE IF EXISTS mensagem_rejeitada, evento_conexao, anulacao, snapshot_mapa,
                     leitura_energia, passagem_celula, mensagem, corrida,
                     apresentacao, operador, dispositivo;
DROP FUNCTION IF EXISTS proteger_corrida_finalizada();
DROP FUNCTION IF EXISTS impedir_alteracao();
DROP TYPE IF EXISTS tipo_evento_conexao, tipo_mensagem, motivo_termino, status_corrida, tipo_labirinto;
