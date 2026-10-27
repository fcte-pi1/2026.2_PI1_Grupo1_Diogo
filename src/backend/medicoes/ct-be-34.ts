/**
 * CT-BE-34 — Recuperação após reinício do backend (RNF-52, #373).
 *
 * Procedimento do roteiro de testes:
 *  1. O simulador emite as 250 primeiras mensagens de uma corrida e o backend as confirma.
 *  2. No instante T0, o processo do backend é encerrado à força (`docker compose kill backend`)
 *     e religado (`docker compose start backend`).
 *  3. O simulador continua emitindo no ritmo do robô desde T0 (só para o buffer, porque o
 *     processo antigo já morreu) e, ao reconectar, envia o `hello` e o buffer de 60 s inteiro.
 *     O backend descarta as duplicatas.
 *  4. A corrida termina.
 *
 * Mede: T0 → `/health` com 200; o tempo do processo até ficar pronto (`uptime_s`, que desconta
 * o tempo do contêiner); T0 → retomada (primeiro `ack` além da 250). Confere: `count(*) =
 * count(DISTINCT seq) = max(seq)` = total da corrida (pela exportação CSV, uma linha por
 * mensagem gravada), sem lacunas, corrida `CONCLUIDA`, e o `snapshot` reconstruído igual ao de
 * antes da queda.
 *
 * O simulador só volta a se conectar depois de o painel de teste pegar o snapshot
 * reconstruído: sem isso, o reenvio do robô poderia mudar o estado antes da comparação. A
 * espera é de poucos milissegundos e está dentro do tempo de retomada medido.
 *
 * Uso (no computador, na raiz do repositório com o ambiente no ar):
 *   cd src/backend && npm run medir:ct-be-34
 * Com o ambiente de implantação (compose.prod.yaml), que é o da apresentação:
 *   npm run medir:ct-be-34 -- --compose compose.prod.yaml
 */
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import type { TipoLabirinto } from '../protocolo/tipos.js';
import { criarSimulador } from '../simulador/simulador.js';
import { diferencasSnapshot, IndiceEnvios, type Recepcao } from './estatistica.js';
import {
  ClienteHttp,
  criarSocketCronometrado,
  dormir,
  inteiroPositivo,
  ms,
  PainelTeste,
  registrar,
  salvarResultado,
  tabelaCriterios,
  URL_PADRAO,
  type Criterio,
} from './instrumentos.js';

const executar = promisify(exec);
const RAIZ_REPOSITORIO = fileURLToPath(new URL('../../../', import.meta.url));

const AJUDA = `CT-BE-34 — recuperação após reinício do backend (RNF-52)

  npm run medir:ct-be-34 -- [opções]

  --url <url>              backend (padrão: ${URL_PADRAO})
  --compose <arquivo>      compose usado nos comandos padrão (padrão: compose.yaml)
  --cmd-derrubar <cmd>     encerra o backend à força (padrão: docker compose -f <arquivo> kill backend)
  --cmd-subir <cmd>        religa o backend (padrão: docker compose -f <arquivo> start backend)
  --apos <n>               mensagens confirmadas antes da queda (padrão: 250)
  --taxa <n>               mensagens/s do simulador (padrão: 20)
  --labirinto <tipo>       4x4, 8x4 ou 12x4 (padrão: 8x4)
  --semente <n>            semente do simulador (padrão: 42, 514 mensagens no 8x4)
  --ajuda                  mostra esta ajuda

Os comandos rodam na raiz do repositório (${RAIZ_REPOSITORIO}).`;

const LIMITE_RECUPERACAO_S = 5;
const PRAZO_PRONTO_MS = 120_000;

async function main(): Promise<number> {
  const { values: v } = parseArgs({
    options: {
      url: { type: 'string', default: URL_PADRAO },
      compose: { type: 'string', default: 'compose.yaml' },
      'cmd-derrubar': { type: 'string' },
      'cmd-subir': { type: 'string' },
      apos: { type: 'string' },
      taxa: { type: 'string' },
      labirinto: { type: 'string', default: '8x4' },
      semente: { type: 'string', default: '42' },
      ajuda: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (v.ajuda) {
    console.log(AJUDA);
    return 0;
  }
  const apos = inteiroPositivo('apos', v.apos, 250);
  const taxa = inteiroPositivo('taxa', v.taxa, 20);
  const labirinto = v.labirinto as TipoLabirinto;
  const cmdDerrubar = v['cmd-derrubar'] ?? `docker compose -f ${v.compose} kill backend`;
  const cmdSubir = v['cmd-subir'] ?? `docker compose -f ${v.compose} start backend`;
  const http = new ClienteHttp(v.url);

  if ((await http.health()).codigo !== 200) {
    console.error(`ERRO: o backend não respondeu 200 em ${http.base}/health`);
    return 2;
  }

  // ---------------------------------------------------------------------------
  // 1. Corrida em andamento com `apos` mensagens confirmadas
  // ---------------------------------------------------------------------------
  const envios = new IndiceEnvios();
  const recepcoes: Recepcao[] = [];
  const painel = new PainelTeste(1, http.ws('/ws/painel'), recepcoes);
  await painel.conectar();

  const sim = criarSimulador({
    url: http.ws('/ws/telemetria'),
    labirinto,
    taxa,
    semente: Number(v.semente),
    criarSocket: criarSocketCronometrado(envios),
  });
  await sim.conectar();
  const corrida = sim.gerarCorrida();
  const total = corrida.mensagens.length;
  if (total < apos + 20) {
    console.error(`ERRO: a corrida tem ${total} mensagens; use outra --semente ou --labirinto`);
    return 2;
  }
  registrar(
    `CT-BE-34 · corrida ${corrida.id} (${labirinto}, semente ${sim.semente}) com ${total} ` +
      `mensagens · queda depois da ${apos} · ${taxa} msg/s`,
  );

  const intervaloMs = 1000 / taxa;
  /** Emite as mensagens `de` a `ate - 1` no ritmo do robô, contado a partir de `inicio`. */
  const emitirDe = async (de: number, ate: number, inicio = performance.now()) => {
    for (let i = de; i < ate; i++) {
      const espera = inicio + (i - de) * intervaloMs - performance.now();
      if (espera > 0) await dormir(espera);
      sim.emitir(corrida.mensagens[i]!);
    }
  };
  await emitirDe(0, apos);
  await sim.aguardarConfirmacao(apos, 5000, corrida.id);
  await dormir(300);

  const mapa = await http.mapearCorridas(painel.corridas.keys());
  const uuid = [...mapa].find(([, robo]) => robo === corrida.id)?.[0];
  if (!uuid) {
    console.error('ERRO: o painel de teste não viu a corrida no canal ao_vivo');
    return 2;
  }
  const snapshotAntes = await painel.pedirSnapshot(uuid);
  const gravadasAntes = (await http.exportarCsv(uuid)).contagem;
  registrar(
    `${gravadasAntes.linhas} mensagens gravadas antes da queda · snapshot com corte na ` +
      `${String(snapshotAntes.sequencia_corte)}`,
  );

  // ---------------------------------------------------------------------------
  // 2. Queda do backend em T0 e religamento; o robô continua emitindo para o buffer
  // ---------------------------------------------------------------------------
  const t0 = performance.now();
  registrar(`T0: ${cmdDerrubar}`);
  await executar(cmdDerrubar, { cwd: RAIZ_REPOSITORIO });
  const derrubadoEm = performance.now();
  // O robô continua emitindo no ritmo dele desde T0. O que ele emitiria enquanto o comando de
  // derrubar roda sai logo depois, quando o processo antigo já morreu: vai só para o buffer.
  // Assim, o snapshot de antes da queda (corte na `apos`) é o estado do processo ao morrer.
  const emissao = emitirDe(apos, total, t0);
  registrar(`backend derrubado em ${ms(derrubadoEm - t0)} · ${cmdSubir}`);
  await executar(cmdSubir, { cwd: RAIZ_REPOSITORIO });
  const subirRetornouEm = performance.now();

  const prontoEm = await http.aguardarPronto(PRAZO_PRONTO_MS, 50);
  if (prontoEm === null) {
    console.error(`ERRO: o /health não voltou a responder 200 em ${PRAZO_PRONTO_MS / 1000} s`);
    return 2;
  }
  const healthPronto = await http.health();
  const uptimeProntoS = healthPronto.corpo?.uptime_s ?? null;
  registrar(
    `/health com 200 em ${ms(prontoEm - t0)} depois de T0 · processo no ar há ${uptimeProntoS} s`,
  );

  // Estado reconstruído pelo backend, antes de o robô voltar.
  let snapshotDepois: Record<string, unknown> | null = null;
  for (let tentativa = 0; tentativa < 50 && !snapshotDepois; tentativa++) {
    try {
      if (!painel.conectado) await painel.conectar();
      snapshotDepois = await painel.pedirSnapshot(uuid, 1000);
    } catch {
      await dormir(100);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. O robô volta: hello e o buffer inteiro; a corrida é retomada
  // ---------------------------------------------------------------------------
  let reconectadoEm: number | null = null;
  while (reconectadoEm === null) {
    try {
      await sim.conectar();
      reconectadoEm = performance.now();
    } catch {
      await dormir(100);
      if (performance.now() - t0 > PRAZO_PRONTO_MS) {
        console.error('ERRO: o simulador não conseguiu se reconectar');
        return 2;
      }
    }
  }
  await sim.aguardarConfirmacao(apos + 1, 10_000, corrida.id);
  const retomadaEm = performance.now();
  registrar(`corrida retomada (ack além da ${apos}) em ${ms(retomadaEm - t0)} depois de T0`);

  await emissao;
  await sim.aguardarConfirmacao(total, 15_000, corrida.id);
  await dormir(1500);
  await sim.encerrar();
  await painel.encerrar();

  // ---------------------------------------------------------------------------
  // 4. Verificações
  // ---------------------------------------------------------------------------
  const detalhe = await http.detalhe(uuid);
  const exportacao = await http.exportarCsv(uuid);
  const contagem = exportacao.contagem;
  const healthFinal = await http.health();
  const diferencas = snapshotDepois
    ? diferencasSnapshot(snapshotAntes, snapshotDepois)
    : ['o snapshot depois do reinício não chegou'];

  const segundos = (inicio: number, fim: number) => Math.round((fim - inicio) / 10) / 100;
  const prontoS = segundos(t0, prontoEm);
  const retomadaS = segundos(t0, retomadaEm);
  // Descontado o contêiner: o tempo do processo até ficar pronto (o `uptime_s` do /health, que
  // vem arredondado para o segundo e por isso é limitado ao tempo desde T0), mais a volta do robô.
  const processoS = uptimeProntoS === null ? null : Math.min(uptimeProntoS, prontoS);
  const retomadaProcessoS =
    processoS === null
      ? null
      : Math.round((processoS + (retomadaEm - prontoEm) / 1000) * 100) / 100;

  const criterios: Criterio[] = [
    {
      nome: '/health pronto, descontado o contêiner (uptime do processo)',
      limite: `≤ ${LIMITE_RECUPERACAO_S} s`,
      medido: `${processoS ?? '—'} s (T0 → 200: ${prontoS} s)`,
      ok: processoS !== null && processoS <= LIMITE_RECUPERACAO_S,
    },
    {
      nome: 'Corrida retomada, descontado o contêiner',
      limite: `≤ ${LIMITE_RECUPERACAO_S} s`,
      medido: `${retomadaProcessoS ?? '—'} s (T0 → retomada: ${retomadaS} s)`,
      ok: retomadaProcessoS !== null && retomadaProcessoS <= LIMITE_RECUPERACAO_S,
    },
    {
      nome: 'count(*) = count(DISTINCT seq) = max(seq) = total',
      limite: String(total),
      medido: `${contagem.linhas} = ${contagem.distintas} = ${contagem.maxima ?? '—'}`,
      ok: contagem.linhas === total && contagem.distintas === total && contagem.maxima === total,
    },
    {
      nome: 'Sem lacunas e corrida concluída',
      limite: '0 faltantes, CONCLUIDA',
      medido: `${String(detalhe.sequencias_faltantes)} faltantes, ${String(detalhe.status)}`,
      ok: detalhe.sequencias_faltantes === 0 && detalhe.status === 'CONCLUIDA',
    },
    {
      nome: 'Estado reconstruído igual ao de antes da queda (snapshot)',
      limite: 'sem diferenças',
      medido: diferencas.length === 0 ? 'sem diferenças' : diferencas.join('; '),
      ok: diferencas.length === 0,
    },
  ];
  const aprovado = criterios.every((c) => c.ok);

  const resultado = {
    caso: 'CT-BE-34',
    requisito: 'RNF-52',
    data: new Date().toISOString(),
    backend_url: http.base,
    parametros: {
      apos,
      taxa,
      labirinto,
      semente: sim.semente,
      cmd_derrubar: cmdDerrubar,
      cmd_subir: cmdSubir,
    },
    corrida: { robo: corrida.id, id: uuid, total },
    tempos_s: {
      derrubar: segundos(t0, derrubadoEm),
      comando_subir_retornou: segundos(t0, subirRetornouEm),
      health_pronto: prontoS,
      uptime_processo_no_pronto: uptimeProntoS,
      simulador_reconectado: reconectadoEm === null ? null : segundos(t0, reconectadoEm),
      retomada: retomadaS,
      retomada_descontado_conteiner: retomadaProcessoS,
    },
    gravadas_antes_da_queda: gravadasAntes,
    contagem_final: contagem,
    detalhe_final: {
      status: detalhe.status,
      sequencias_faltantes: detalhe.sequencias_faltantes,
      ultima_sequencia_contigua: detalhe.ultima_sequencia_contigua,
    },
    reenvio: {
      mensagens_reenviadas_pelo_simulador: envios.repetidos,
      duplicadas_descartadas_pelo_backend: healthFinal.corpo?.ingestao.mensagens_duplicadas ?? null,
    },
    snapshot_antes: snapshotAntes,
    snapshot_depois: snapshotDepois,
    diferencas_snapshot: diferencas,
    criterios,
    aprovado,
  };
  const arquivo = await salvarResultado('CT-BE-34', resultado);

  console.log(`
## CT-BE-34 — resultado (${resultado.data})

Corrida ${corrida.id} (${labirinto}, ${total} mensagens), queda depois da ${apos}. \
Derrubar: \`${cmdDerrubar}\` · subir: \`${cmdSubir}\`

| Marco | Depois de T0 |
|:--|--:|
| Comando de derrubar retornou | ${resultado.tempos_s.derrubar} s |
| Comando de subir retornou | ${resultado.tempos_s.comando_subir_retornou} s |
| \`/health\` com 200 | ${prontoS} s (processo no ar há ${uptimeProntoS} s) |
| Simulador reconectado (hello + buffer) | ${resultado.tempos_s.simulador_reconectado} s |
| Corrida retomada (ack além da ${apos}) | ${retomadaS} s |

${tabelaCriterios(criterios)}

Reenvio: ${envios.repetidos} mensagens reenviadas pelo simulador, \
${resultado.reenvio.duplicadas_descartadas_pelo_backend} duplicadas descartadas pelo backend.

**${aprovado ? 'CT-BE-34 ATENDIDO' : 'CT-BE-34 NÃO ATENDIDO'}** · resultado gravado em ${arquivo}`);
  return aprovado ? 0 : 1;
}

main().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    console.error('ERRO:', erro instanceof Error ? erro.message : erro);
    process.exit(2);
  },
);
