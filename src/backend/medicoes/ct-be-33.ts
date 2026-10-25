/**
 * CT-BE-33 — Carga sustentada sem bloqueio do event loop (RNF-49, RNF-51, #373).
 *
 * 1 simulador a 50 msg/s (2,5× a taxa do robô) e 10 painéis por 5 min. Durante a carga:
 *  - consulta o `/health` a cada 5 s (código, tempo de resposta e atraso do event loop);
 *  - pede 3 exportações CSV (RF-98) de corridas já encerradas, a 25 %, 50 % e 75 % da duração.
 *
 * Critérios: atraso do event loop com p99 ≤ 20 ms (RNF-49); todas as mensagens gravadas
 * (`count` = enviadas), nenhum painel desconectado e nenhuma rejeição por sobrecarga (RNF-51).
 * A contagem das gravadas vem da exportação CSV de cada corrida (uma linha por mensagem da
 * tabela `mensagem`), feita depois da carga, sem precisar de acesso ao banco.
 *
 * Uso (no computador, com o backend no ar e RECÉM-REINICIADO):
 *   docker compose restart backend
 *   cd src/backend && npm run medir:ct-be-33
 */
import { parseArgs } from 'node:util';
import type { TipoLabirinto } from '../protocolo/tipos.js';
import { executarCarga, type ContextoCarga } from './carga.js';
import { resumir } from './estatistica.js';
import {
  ClienteHttp,
  dormir,
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

const AJUDA = `CT-BE-33 — carga sustentada sem bloqueio do event loop (RNF-49, RNF-51)

  npm run medir:ct-be-33 -- [opções]

  --url <url>          backend (padrão: ${URL_PADRAO})
  --taxa <n>           mensagens/s do simulador (padrão: 50)
  --paineis <n>        painéis de teste (padrão: 10)
  --duracao <s>        duração mínima da carga, em s (padrão: 300)
  --labirinto <tipo>   4x4, 8x4 ou 12x4 (padrão: 12x4)
  --semente <n>        semente do simulador (padrão: aleatória)
  --sem-reinicio       mede mesmo com o backend já usado (o resultado não vale como oficial)
  --ajuda              mostra esta ajuda`;

const LIMITE_EVENT_LOOP_MS = 20;
const INTERVALO_HEALTH_MS = 5000;
const MOMENTOS_EXPORTACAO = [0.25, 0.5, 0.75];

interface AmostraHealth {
  t_s: number;
  codigo: number;
  resposta_ms: number;
  event_loop_p99_ms: number | null;
}

interface Exportacao {
  t_s: number;
  corrida: string;
  codigo: number;
  ms: number;
  bytes: number;
  linhas: number;
}

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
    taxa: inteiroPositivo('taxa', v.taxa, 50),
    paineis: inteiroPositivo('paineis', v.paineis, 10),
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
  const ingestaoAntes = antes.corpo.ingestao;

  const amostras: AmostraHealth[] = [];
  const exportacoes: Exportacao[] = [];

  /** O `/health` a cada 5 s e as 3 exportações, enquanto a carga dura. */
  const emParalelo = async (ctx: ContextoCarga) => {
    const consultarHealth = async () => {
      while (!ctx.terminou()) {
        const r = await http.health();
        amostras.push({
          t_s: Math.round(ctx.decorridoMs() / 100) / 10,
          codigo: r.codigo,
          resposta_ms: Math.round(r.ms * 100) / 100,
          event_loop_p99_ms: r.corpo?.event_loop_atraso_ms.p99 ?? null,
        });
        if (r.codigo !== 200) registrar(`ATENÇÃO: /health respondeu ${r.codigo}`);
        await dormir(INTERVALO_HEALTH_MS);
      }
    };
    const exportar = async () => {
      for (const fracao of MOMENTOS_EXPORTACAO) {
        const momento = fracao * parametros.duracaoS * 1000;
        while (!ctx.terminou() && ctx.decorridoMs() < momento) await dormir(200);
        if (ctx.terminou()) break;
        // A corrida encerrada mais recente; sem nenhuma ainda, espera a primeira terminar.
        let corrida = ctx.corridasEncerradas().at(-1);
        while (!corrida && !ctx.terminou()) {
          await dormir(500);
          corrida = ctx.corridasEncerradas().at(-1);
        }
        if (!corrida) break;
        const r = await http.exportarCsv(corrida);
        exportacoes.push({
          t_s: Math.round(ctx.decorridoMs() / 100) / 10,
          corrida,
          codigo: r.codigo,
          ms: Math.round(r.ms * 100) / 100,
          bytes: r.bytes,
          linhas: r.contagem.linhas,
        });
        registrar(
          `exportação CSV ${exportacoes.length}/3 (${corrida}): ${r.codigo}, ` +
            `${r.contagem.linhas} linhas em ${ms(r.ms)}`,
        );
      }
    };
    await Promise.all([consultarHealth(), exportar()]);
  };

  registrar(
    `CT-BE-33 · ${parametros.taxa} msg/s · ${parametros.paineis} painéis · ` +
      `${parametros.duracaoS} s · ${http.base}`,
  );
  const carga = await executarCarga(
    {
      http,
      ...parametros,
      ...(v.semente !== undefined && { semente: Number(v.semente) }),
    },
    emParalelo,
  );

  // Primeiro o /health final (o atraso do event loop da carga), depois as verificações.
  const depois = await http.health();
  if (!depois.corpo) {
    console.error('ERRO: o /health do fim da medição não respondeu');
    return 2;
  }
  const atraso = depois.corpo.event_loop_atraso_ms;
  const ingestao = depois.corpo.ingestao;
  const delta = {
    aceitas: ingestao.mensagens_aceitas - ingestaoAntes.mensagens_aceitas,
    duplicadas: ingestao.mensagens_duplicadas - ingestaoAntes.mensagens_duplicadas,
    rejeitadas: ingestao.mensagens_rejeitadas - ingestaoAntes.mensagens_rejeitadas,
    conexoesRecusadas: ingestao.conexoes_recusadas - ingestaoAntes.conexoes_recusadas,
  };

  // Gravadas por corrida: uma exportação CSV de cada uma (count(*) da tabela `mensagem`).
  registrar('conferindo as mensagens gravadas de cada corrida (exportação CSV)');
  const uuidPorRobo = new Map(
    [...(await http.mapearCorridas(carga.paineis[0]!.corridas.keys()))].map(([uuid, robo]) => [
      robo,
      uuid,
    ]),
  );
  const persistencia = [];
  for (const c of carga.corridas) {
    const uuid = uuidPorRobo.get(c.corrida);
    const contagem = uuid ? (await http.exportarCsv(uuid)).contagem : null;
    persistencia.push({
      corrida_robo: c.corrida,
      corrida: uuid ?? null,
      enviadas: c.mensagens,
      gravadas: contagem?.linhas ?? 0,
      distintas: contagem?.distintas ?? 0,
      max_seq: contagem?.maxima ?? null,
    });
  }
  const gravadas = persistencia.reduce((soma, p) => soma + p.gravadas, 0);
  const todasGravadas = persistencia.every(
    (p) => p.gravadas === p.enviadas && p.distintas === p.enviadas && p.max_seq === p.enviadas,
  );
  const fechamentosPaineis = carga.paineis.flatMap((p) => p.fechamentosInesperados);
  const quedasSimulador = carga.fechamentosSimulador.filter((f) => f.codigo !== 1000);
  // O histograma do /health vale desde o início do processo: nas primeiras consultas, poucas
  // amostras e o aquecimento (compilação do tsx, conexão com o banco) pesam no p99. Por isso a
  // série só é resumida a partir de 60 s; o critério é o p99 do fim, sobre a carga inteira.
  const depoisDoAquecimento = amostras.filter((a) => a.t_s >= 60);
  const p99Maximo = Math.max(
    ...(depoisDoAquecimento.length > 0 ? depoisDoAquecimento : amostras).map(
      (a) => a.event_loop_p99_ms ?? 0,
    ),
  );
  const respostasHealth = resumir(
    amostras.filter((a) => a.codigo === 200).map((a) => a.resposta_ms),
  );
  const healthOk = amostras.length > 0 && amostras.every((a) => a.codigo === 200);
  const exportacoesOk =
    exportacoes.length === MOMENTOS_EXPORTACAO.length &&
    exportacoes.every((e) => e.codigo === 200 && e.linhas > 0);

  const criterios: Criterio[] = [
    {
      nome: 'RNF-49: atraso do event loop, p99 (fim da carga)',
      limite: `≤ ${LIMITE_EVENT_LOOP_MS} ms`,
      medido: `${ms(atraso.p99)} (maior p99 nas consultas depois de 60 s: ${ms(p99Maximo)})`,
      ok: atraso.p99 <= LIMITE_EVENT_LOOP_MS,
    },
    {
      nome: 'RNF-51: todas as mensagens gravadas (count = enviadas, sem duplicata)',
      limite: `${carga.mensagensEmitidas} de ${carga.mensagensEmitidas}`,
      medido: `${gravadas} de ${carga.mensagensEmitidas}`,
      ok: todasGravadas && gravadas === carga.mensagensEmitidas,
    },
    {
      nome: 'RNF-51: nenhuma rejeição por sobrecarga',
      limite: '0 rejeitadas, 0 recusas, 0 quedas do simulador',
      medido: `${delta.rejeitadas} rejeitadas, ${delta.conexoesRecusadas} recusas, ${quedasSimulador.length} quedas`,
      ok: delta.rejeitadas === 0 && delta.conexoesRecusadas === 0 && quedasSimulador.length === 0,
    },
    {
      nome: 'RNF-51: nenhum painel desconectado',
      limite: '0',
      medido: String(fechamentosPaineis.length),
      ok: fechamentosPaineis.length === 0,
    },
    {
      nome: '/health a cada 5 s respondeu 200',
      limite: 'todas',
      medido: `${amostras.filter((a) => a.codigo === 200).length} de ${amostras.length}`,
      ok: healthOk,
    },
    {
      nome: '3 exportações CSV durante a carga',
      limite: '3 com 200',
      medido: `${exportacoes.filter((e) => e.codigo === 200).length} de ${exportacoes.length}`,
      ok: exportacoesOk,
    },
  ];
  const aprovado = criterios.every((c) => c.ok);

  const resultado = {
    caso: 'CT-BE-33',
    requisitos: ['RNF-49', 'RNF-51'],
    data: new Date().toISOString(),
    backend_url: http.base,
    parametros: { ...parametros, semente: carga.semente, boot: carga.boot },
    duracao_real_s: Math.round(carga.duracaoRealS * 10) / 10,
    corridas: carga.corridas.length,
    mensagens_emitidas: carga.mensagensEmitidas,
    mensagens_gravadas: gravadas,
    event_loop_atraso_ms: atraso,
    event_loop_p99_maximo_nas_consultas_depois_de_60s_ms: p99Maximo,
    health_resposta_ms: respostasHealth,
    ingestao_delta: delta,
    backend_latencia_painel_ms: depois.corpo.latencia_painel_ms ?? null,
    paineis: {
      quantidade: carga.paineis.length,
      mensagens_recebidas: carga.paineis.map((p) => p.mensagens),
      fechamentos_inesperados: fechamentosPaineis,
    },
    simulador_fechamentos: carga.fechamentosSimulador,
    consultas_health: amostras,
    exportacoes,
    persistencia,
    criterios,
    aprovado,
  };
  const arquivo = await salvarResultado('CT-BE-33', resultado);

  console.log(`
## CT-BE-33 — resultado (${resultado.data})

${carga.corridas.length} corridas, ${carga.mensagensEmitidas} mensagens em ${resultado.duracao_real_s} s · \
${parametros.taxa} msg/s · ${parametros.paineis} painéis · labirinto ${parametros.labirinto}

${tabelaCriterios(criterios)}

Atraso do event loop no fim: p50 ${ms(atraso.p50)}, p99 ${ms(atraso.p99)} · \
${amostras.length} consultas ao /health (tempo de resposta p95 ${ms(respostasHealth.p95)}, máx. \
${ms(respostasHealth.max)}) · exportações: ${exportacoes.map((e) => `${e.linhas} linhas em ${ms(e.ms)}`).join('; ')}

Latência no backend sob esta carga (informativa; o critério do RNF-48 é o CT-BE-32):

${tabelaResumos([
  ['Backend, eventos (/health)', depois.corpo.latencia_painel_ms?.eventos],
  ['Backend, contínuos (/health)', depois.corpo.latencia_painel_ms?.continuos],
])}

**${aprovado ? 'CT-BE-33 ATENDIDO' : 'CT-BE-33 NÃO ATENDIDO'}** · resultado gravado em ${arquivo}`);
  return aprovado ? 0 : 1;
}

main().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    console.error('ERRO:', erro instanceof Error ? erro.message : erro);
    process.exit(2);
  },
);
