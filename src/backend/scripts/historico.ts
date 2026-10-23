/**
 * Gera um histórico de corridas para o CT-BE-26 e para desenvolver a tela de histórico sem o
 * robô (#328). Usado pelo `npm run seed:historico` e pelo teste de integração da listagem,
 * para os dois trabalharem com os mesmos dados.
 *
 * As corridas vão direto para a tabela `corrida`, sem mensagens: a listagem só lê a corrida.
 * Idempotente: rodar de novo não duplica nada (chave do robô e anulação).
 */

/** O mínimo do `pg.Client`/`pg.Pool` que a geração usa. */
export interface ExecutorSql {
  query(sql: string, parametros?: unknown[]): Promise<unknown>;
}

export interface OpcoesHistorico {
  /** Dispositivo dono das corridas (o `sim-01` do seed). */
  dispositivoId: string;
  /** Os dias, `AAAA-MM-DD` em UTC, distribuídos em rodízio. */
  dias: string[];
  quantidade?: number;
  /** Prefixo do id da corrida do robô: `lista-0`, `lista-1`... */
  prefixo?: string;
}

const TIPOS = ['4x4', '8x4', '12x4'] as const;
// Sem EM_ANDAMENTO: uma corrida "em andamento" em dia passado é recuperada no reinício do
// backend (RNF-52) e, sem sinal, vira INTERROMPIDA uns 2 minutos depois, mudando os dados.
const STATUS = ['CONCLUIDA', 'FALHOU', 'INTERROMPIDA'] as const;
const MOTIVO = {
  CONCLUIDA: 'SUCESSO',
  FALHOU: 'FALHA_REPORTADA',
  INTERROMPIDA: 'SEM_SINAL',
} as const;

/**
 * Tipos e status em rodízio, um instante diferente por corrida. Nenhuma CONCLUIDA no 12x4:
 * esse labirinto fica livre para o ranking (CT-BE-28). A primeira corrida sai anulada.
 * Devolve quantas corridas foram criadas (0 numa segunda execução).
 */
export async function gerarHistorico(
  banco: ExecutorSql,
  { dispositivoId, dias, quantidade = 200, prefixo = 'lista' }: OpcoesHistorico,
): Promise<number> {
  let criadas = 0;
  for (let i = 0; i < quantidade; i++) {
    const dia = dias[i % dias.length]!;
    const hora = String(i % 24).padStart(2, '0');
    const minuto = String(Math.floor(i / 24) % 60).padStart(2, '0');
    const tipo = TIPOS[i % TIPOS.length]!;
    const sorteado = STATUS[i % STATUS.length]!;
    const status = tipo === '12x4' && sorteado === 'CONCLUIDA' ? 'FALHOU' : sorteado;
    const iniciada = `${dia}T${hora}:${minuto}:00Z`;
    // Como no fluxo real: a terminada tem motivo e fim, e a concluída tem o tempo oficial.
    const encerrada = new Date(Date.parse(iniciada) + 60_000).toISOString();
    const resultado = (await banco.query(
      `INSERT INTO corrida (dispositivo_id, id_corrida_robo, boot, tipo_labirinto, status,
                            motivo_termino, tempo_conclusao_ms, versao_protocolo,
                            iniciada_em, encerrada_em)
       VALUES ($1, $2, 'historico', $3, $4, $5, $6, 1, $7, $8)
       ON CONFLICT (dispositivo_id, id_corrida_robo) DO NOTHING`,
      [
        dispositivoId,
        `${prefixo}-${i}`,
        tipo,
        status,
        MOTIVO[status],
        status === 'CONCLUIDA' ? 60_000 + i : null,
        iniciada,
        encerrada,
      ],
    )) as { rowCount: number | null };
    criadas += resultado.rowCount ?? 0;
  }

  // Uma anulada, para a tela mostrar o campo `anulada`. O operador não tem senha válida.
  await banco.query(
    `INSERT INTO operador (login, nome, senha_hash) VALUES ('historico', 'Seed do histórico', 'x')
     ON CONFLICT (login) DO NOTHING`,
  );
  await banco.query(
    `INSERT INTO anulacao (corrida_id, operador_id, motivo)
     SELECT c.id, o.id, 'toque manual' FROM corrida c, operador o
     WHERE c.dispositivo_id = $1 AND c.id_corrida_robo = $2 AND o.login = 'historico'
     ON CONFLICT (corrida_id) DO NOTHING`,
    [dispositivoId, `${prefixo}-0`],
  );
  return criadas;
}
