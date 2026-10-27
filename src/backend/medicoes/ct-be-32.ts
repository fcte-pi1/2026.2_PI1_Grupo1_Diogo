/**
 * CT-BE-32 — Latência servidor → painel e ponta a ponta (RNF-48, #373).
 *
 * 1 simulador a 20 msg/s e 5 painéis por 5 min. Mede:
 *  - no backend: os percentis do `/health` (`latencia_painel_ms`), da recepção do quadro do
 *    robô ao envio ao painel, separados em eventos e contínuos (instrumentação do PR #390);
 *  - ponta a ponta: da saída da mensagem no simulador à chegada em cada painel, com o mesmo
 *    relógio, porque simulador e painéis rodam neste processo.
 *
 * Critério: p95 ≤ 50 ms no backend (eventos e contínuos) e p95 ≤ 300 ms ponta a ponta.
 *
 * Uso (no computador, com o backend no ar e RECÉM-REINICIADO):
 *   docker compose restart backend
 *   cd src/backend && npm run medir:ct-be-32
 */
import { parseArgs } from 'node:util';
import type { TipoLabirinto } from '../protocolo/tipos.js';
import { executarCarga } from './carga.js';
import { parear, resumir } from './estatistica.js';
import {
  ClienteHttp,
  inteiroPositivo,
  ms,
  problemaBackendNaoLimpo,
  registrar,
  salvarResultado,
  tabelaCriterios,
  tabelaResumos,
  URL_PADRAO,
  type Criterio,
} from './instrumentos.js';

const AJUDA = `CT-BE-32 — latência servidor → painel e ponta a ponta (RNF-48)

  npm run medir:ct-be-32 -- [opções]

  --url <url>          backend (padrão: ${URL_PADRAO})
  --taxa <n>           mensagens/s do simulador (padrão: 20)
  --paineis <n>        painéis de teste (padrão: 5)
  --duracao <s>        duração mínima da carga, em s (padrão: 300)
  --labirinto <tipo>   4x4, 8x4 ou 12x4 (padrão: 12x4)
  --semente <n>        semente do simulador (padrão: aleatória)
  --sem-reinicio       mede mesmo com o backend já usado (o resultado não vale como oficial)
  --ajuda              mostra esta ajuda`;

const LIMITE_BACKEND_MS = 50;
const LIMITE_PONTA_A_PONTA_MS = 300;

async function main(): Promise<number> {
  const { values: v } = parseArgs({
    options: {
      url: { type: 'string', default: URL_PADRAO },
      taxa: { type: 'string' },
      paineis: { type: 'string' },
      duracao: { type: 'string' },
      labirinto: { type: 'string', default: '12x4' },
      semente: { type: 'string' },
      'sem-reinicio': { type: 'boolean', default: false },
      ajuda: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (v.ajuda) {
    console.log(AJUDA);
    return 0;
  }
  const parametros = {
    taxa: inteiroPositivo('taxa', v.taxa, 20),
    paineis: inteiroPositivo('paineis', v.paineis, 5),
    duracaoS: inteiroPositivo('duracao', v.duracao, 300),
    labirinto: v.labirinto as TipoLabirinto,
  };
  const http = new ClienteHttp(v.url);

  const antes = await http.health();
  if (antes.codigo !== 200 || !antes.corpo) {
    console.error(`ERRO: o backend não respondeu 200 em ${http.base}/health (${antes.codigo})`);
    return 2;
  }
  const sujo = problemaBackendNaoLimpo(antes.corpo);
  if (sujo && !v['sem-reinicio']) {
    console.error(`ERRO: ${sujo}.\nReinicie antes de medir: docker compose restart backend`);
    return 2;
  }

  registrar(
    `CT-BE-32 · ${parametros.taxa} msg/s · ${parametros.paineis} painéis · ` +
      `${parametros.duracaoS} s · ${http.base}`,
  );
  const carga = await executarCarga({
    http,
    ...parametros,
    ...(v.semente !== undefined && { semente: Number(v.semente) }),
  });

  const depois = await http.health();
  if (!depois.corpo?.latencia_painel_ms) {
    console.error('ERRO: o /health do fim da medição não respondeu');
    return 2;
  }
  const backend = depois.corpo.latencia_painel_ms;
  const mapa = await http.mapearCorridas(carga.recepcoes.map((r) => r.corrida));
  const pontaAPonta = parear(carga.recepcoes, carga.envios, mapa);
  const e2e = {
    eventos: resumir(pontaAPonta.eventos),
    continuos: resumir(pontaAPonta.continuos),
    todos: resumir([...pontaAPonta.eventos, ...pontaAPonta.continuos]),
  };
  const fechamentosPaineis = carga.paineis.flatMap((p) => p.fechamentosInesperados);

  const ate = (valor: number | null, limite: number) => valor !== null && valor <= limite;
  const criterios: Criterio[] = [
    {
      nome: 'Backend, eventos: p95 recepção → envio ao painel',
      limite: `≤ ${LIMITE_BACKEND_MS} ms`,
      medido: ms(backend.eventos.p95),
      ok: ate(backend.eventos.p95, LIMITE_BACKEND_MS),
    },
    {
      nome: 'Backend, contínuos: p95 recepção → envio ao painel',
      limite: `≤ ${LIMITE_BACKEND_MS} ms`,
      medido: ms(backend.continuos.p95),
      ok: ate(backend.continuos.p95, LIMITE_BACKEND_MS),
    },
    {
      nome: 'Ponta a ponta, eventos: p95 simulador → painel',
      limite: `≤ ${LIMITE_PONTA_A_PONTA_MS} ms`,
      medido: ms(e2e.eventos.p95),
      ok: ate(e2e.eventos.p95, LIMITE_PONTA_A_PONTA_MS),
    },
    {
      nome: 'Ponta a ponta, contínuos: p95 simulador → painel',
      limite: `≤ ${LIMITE_PONTA_A_PONTA_MS} ms`,
      medido: ms(e2e.continuos.p95),
      ok: ate(e2e.continuos.p95, LIMITE_PONTA_A_PONTA_MS),
    },
  ];
  const aprovado = criterios.every((c) => c.ok);

  const resultado = {
    caso: 'CT-BE-32',
    requisito: 'RNF-48',
    data: new Date().toISOString(),
    backend_url: http.base,
    parametros: { ...parametros, semente: carga.semente, boot: carga.boot },
    duracao_real_s: Math.round(carga.duracaoRealS * 10) / 10,
    corridas: carga.corridas.length,
    mensagens_emitidas: carga.mensagensEmitidas,
    backend_latencia_painel_ms: backend,
    ponta_a_ponta_ms: { ...e2e, sem_par: pontaAPonta.semPar },
    event_loop_atraso_ms: depois.corpo.event_loop_atraso_ms,
    ingestao: depois.corpo.ingestao,
    paineis: { quantidade: carga.paineis.length, fechamentos_inesperados: fechamentosPaineis },
    criterios,
    aprovado,
  };
  const arquivo = await salvarResultado('CT-BE-32', resultado);

  console.log(`
## CT-BE-32 — resultado (${resultado.data})

${carga.corridas.length} corridas, ${carga.mensagensEmitidas} mensagens em ${resultado.duracao_real_s} s · \
${parametros.taxa} msg/s · ${parametros.paineis} painéis · labirinto ${parametros.labirinto}

${tabelaResumos([
  ['Backend, eventos (/health)', backend.eventos],
  ['Backend, contínuos (/health)', backend.continuos],
  ['Ponta a ponta, eventos', e2e.eventos],
  ['Ponta a ponta, contínuos', e2e.continuos],
  ['Ponta a ponta, todas', e2e.todos],
])}

${tabelaCriterios(criterios)}

Atraso do event loop: p50 ${ms(depois.corpo.event_loop_atraso_ms.p50)}, p99 \
${ms(depois.corpo.event_loop_atraso_ms.p99)} · recepções sem par: ${pontaAPonta.semPar} · \
painéis desconectados: ${fechamentosPaineis.length}

**${aprovado ? 'CT-BE-32 ATENDIDO' : 'CT-BE-32 NÃO ATENDIDO'}** · resultado gravado em ${arquivo}`);
  return aprovado ? 0 : 1;
}

main().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    console.error('ERRO:', erro instanceof Error ? erro.message : erro);
    process.exit(2);
  },
);
