-- A corrida pode ser criada por uma mensagem que chegou antes do `inicio_corrida`
-- (HU-BE-07, CA2: após uma perda, a primeira mensagem recebida pode ser outra). Nesse
-- caso o tipo de labirinto ainda não é conhecido e é preenchido quando o robô reenvia
-- o `inicio_corrida`.

-- Up Migration

ALTER TABLE corrida ALTER COLUMN tipo_labirinto DROP NOT NULL;

-- Down Migration

ALTER TABLE corrida ALTER COLUMN tipo_labirinto SET NOT NULL;
