import { expect, test, type Page } from '@playwright/test';
import {
  CORRIDA,
  aoVivo,
  celulaMapa,
  continuo,
  eventoCelula,
  eventoStatus,
  metricas,
  sinal,
  snapshot,
} from '../suporte/mensagens';
import type { MensagemPainelSaida } from '../../src/protocolo';
import { BackendFalso, idCorrida } from './suporte/backend-falso';

const OUTRA_CORRIDA = idCorrida(2);

/** Acompanhamento ao vivo (HU-FE-03 a HU-FE-08, HU-FE-12 a HU-FE-14) pelo /ws/painel. */
test.describe('acompanhamento ao vivo', () => {
  let backend: BackendFalso;

  test.beforeEach(async ({ page }) => {
    backend = new BackendFalso();
    await backend.instalar(page);
  });

  const indicador = (page: Page) => page.locator('[role="status"][data-estado]');

  /** Abre a tela, espera o WebSocket e anuncia uma corrida em andamento no 8x4. */
  async function comCorridaEmAndamento(page: Page, corrida = CORRIDA) {
    backend.snapshotDe = (id) =>
      snapshot({
        corrida: id,
        labirinto: '8x4',
        sequencia_corte: 1,
        mapa: [celulaMapa(0, 3, { sul: true, leste: true, oeste: true })],
        posicao: { x: 0, y: 3, orientacao: 'NORTE' },
      });
    await page.goto('/');
    await backend.aguardarConexao();
    backend.enviar(aoVivo({ corrida, labirinto: '8x4' }));
    await expect.poll(() => backend.mensagensDeCorrida('inscrever')).toContain(corrida);
  }

  test('conecta, inscreve no canal ao vivo e espera a telemetria', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Acompanhamento ao vivo' })).toBeVisible();
    await expect(indicador(page)).toHaveText('Conectado');
    await expect(indicador(page)).toHaveAttribute('data-estado', 'conectado');
    await expect
      .poll(() => backend.recebidasDoPainel)
      .toContainEqual({
        tipo: 'inscrever',
        canal: 'ao_vivo',
      });
    await expect(page.getByText('Aguardando telemetria')).toBeVisible();
    await expect(page.getByTestId('status-desafio')).toHaveText('—');
    await expect(page.getByTestId('painel-execucao')).toHaveAttribute('data-modo', 'ao-vivo');
    await expect(page.getByTestId('etiqueta-modo')).toHaveText('AO VIVO');
  });

  test('com uma corrida já em andamento ao abrir, o painel entra nela sozinho', async ({
    page,
  }) => {
    backend.emAndamento = [aoVivo({ labirinto: '4x4' })];
    backend.snapshotDe = () =>
      snapshot({
        labirinto: '4x4',
        mapa: [celulaMapa(0, 3)],
        posicao: { x: 0, y: 3, orientacao: 'NORTE' },
      });

    await page.goto('/');

    await expect.poll(() => backend.mensagensDeCorrida('inscrever')).toEqual([CORRIDA]);
    await expect(page.getByTestId('status-desafio')).toHaveText('Em andamento');
    await expect(page.getByTestId('labirinto')).toBeVisible();
  });

  test('acompanha a corrida do início ao desafio cumprido', async ({ page }) => {
    await comCorridaEmAndamento(page);
    await expect(page.getByTestId('labirinto-pendente')).toHaveCount(0);
    await expect(page.getByTestId('labirinto')).toBeVisible();
    await expect(page.getByTestId('status-desafio')).toHaveText('Em andamento');
    await expect(page.getByTestId('desafio')).toHaveText('Em andamento');

    backend.enviar(
      eventoCelula(2, 0, 2, {
        metricas: metricas({ celulas_percorridas: 1, distancia_m: 0.18, tempo_decorrido_ms: 1500 }),
      }),
      continuo({
        tempo_ms: 1600,
        posicao: { x: 0, y: 2, orientacao: 'NORTE' },
        energia: { tensao_v: 8.1, corrente_a: 0.4, potencia_w: 3.2 },
        metricas: metricas({
          tempo_decorrido_ms: 1600,
          celulas_percorridas: 1,
          distancia_m: 0.18,
          velocidade_media_mps: 0.11,
          tensao_v: 8.1,
          corrente_a: 0.4,
          potencia_w: 3.2,
          carga_estimada_pct: 87.5,
          delta_v: 0.2,
        }),
      }),
    );

    // Critério dos 500 ms entre a mensagem e a tela (HU-FE-01 CA3, CT-FE-01 passo 5).
    await expect(page.getByTestId('celulas-percorridas')).toHaveText('1', { timeout: 500 });
    await expect(page.getByText('Atualização recebida')).toBeVisible();
    await expect(page.getByTestId('distancia-total')).toHaveText('0,18 m');
    await expect(page.getByTestId('velocidade-media')).toHaveText('0,11 m/s');
    await expect(page.getByTestId('carga-estimada')).toHaveText('87.5%');
    await expect(page.getByTestId('variacao-tensao')).toHaveText('0,2 V');
    // Tensão, corrente e potência na mesma tela (HU-FE-01 CA1).
    const painel = page.getByTestId('painel-execucao');
    for (const leitura of ['8,1 V', '0,4 A', '3,2 W']) {
      await expect(painel.getByText(leitura, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByTestId('grafico-consumo')).toHaveAttribute('data-amostras', '1');
    await expect(page.getByTestId('trajetoria')).toBeAttached();
    await expect(page.getByTestId('robo')).toBeVisible();

    backend.enviar(
      eventoStatus('CONCLUIDA', {
        sequencia: 6,
        tempo_ms: 9500,
        metricas: metricas({
          celulas_percorridas: 1,
          tempo_decorrido_ms: 9400,
          tempo_conclusao_ms: 9400,
        }),
      }),
    );

    // O desafio cumprido aparece em até 500 ms (CT-FE-07).
    await expect(page.getByTestId('desafio-cumprido')).toBeVisible({ timeout: 500 });
    await expect(page.getByTestId('status-desafio')).toHaveText('Concluída', { timeout: 500 });
    await expect(page.getByTestId('desafio')).toHaveText('Concluído');
    // O tempo oficial vem do backend, e o cronômetro para nele.
    await expect(page.getByTestId('tempo')).toHaveText('00:09.4');
    await expect(page.getByTestId('alerta-falha')).toHaveCount(0);
  });

  test('o snapshot substitui o estado da tela, também ao entrar no meio da corrida', async ({
    page,
  }) => {
    backend.snapshotDe = (id) =>
      snapshot({
        corrida: id,
        labirinto: '12x4',
        sequencia_corte: 40,
        mapa: [celulaMapa(0, 3), celulaMapa(1, 3), celulaMapa(2, 3)],
        posicao: { x: 2, y: 3, orientacao: 'LESTE' },
        metricas: metricas({
          celulas_percorridas: 2,
          distancia_m: 0.36,
          tempo_decorrido_ms: 7300,
        }),
      });
    await page.goto('/');
    await backend.aguardarConexao();

    backend.enviar(aoVivo({ labirinto: '12x4' }));

    await expect(page.getByTestId('celulas-percorridas')).toHaveText('2');
    await expect(page.getByTestId('distancia-total')).toHaveText('0,36 m');
    await expect(page.getByTestId('labirinto')).toBeVisible();
    await expect(page.getByTestId('robo')).toBeVisible();
  });

  test('a falha da corrida é avisada na hora, com o motivo e o texto do robô (HU-FE-13)', async ({
    page,
  }) => {
    await comCorridaEmAndamento(page);

    backend.enviar(
      eventoStatus('FALHOU', {
        sequencia: 7,
        motivo_termino: 'FALHA_REPORTADA',
        detalhe: 'Sensor frontal sem leitura',
      }),
    );

    // O critério da história é de 500 ms entre a mensagem e o aviso.
    const alerta = page.getByTestId('alerta-falha');
    await expect(alerta).toBeVisible({ timeout: 500 });
    await expect(alerta).toContainText('Execução falhou');
    await expect(page.getByTestId('alerta-falha-motivo')).toHaveText(
      'Motivo: Falha reportada pelo robô (FALHA_REPORTADA)',
    );
    await expect(page.getByTestId('alerta-falha-detalhe')).toHaveText('Sensor frontal sem leitura');
    await expect(page.getByTestId('status-desafio')).toHaveText('Falhou');
    await expect(page.getByTestId('desafio-cumprido')).toHaveCount(0);
  });

  test('uma interrupção sem sequência (120 s sem sinal) não é descartada', async ({ page }) => {
    await comCorridaEmAndamento(page);

    backend.enviar(
      eventoStatus('INTERROMPIDA', {
        sequencia: null,
        tempo_ms: null,
        motivo_termino: 'SEM_SINAL',
      }),
    );

    await expect(page.getByTestId('alerta-falha')).toContainText('Execução interrompida', {
      timeout: 500,
    });
    await expect(page.getByTestId('alerta-falha-motivo')).toHaveText(
      'Motivo: Perda de comunicação (SEM_SINAL)',
    );
    await expect(page.getByTestId('status-desafio')).toHaveText('Interrompida');
  });

  test('perda e retomada do sinal do robô aparecem no aviso e no indicador de conexão', async ({
    page,
  }) => {
    await comCorridaEmAndamento(page);
    await expect(indicador(page)).toHaveText('Conectado');

    backend.enviar(sinal('PERDIDO'));

    // Cada alerta aparece em até 500 ms (CT-FE-13).
    await expect(page.getByTestId('alerta-sem-sinal')).toContainText('Sem sinal do robô', {
      timeout: 500,
    });
    await expect(indicador(page)).toHaveText('Sem sinal do robô');
    await expect(indicador(page)).toHaveAttribute('data-estado', 'desconectado');

    backend.enviar(sinal('RETOMADO'));

    await expect(page.getByTestId('alerta-sem-sinal')).toHaveCount(0);
    await expect(page.getByTestId('sinal-retomado')).toContainText('Comunicação retomada', {
      timeout: 500,
    });
    // Retomar a comunicação não é terminar a execução.
    await expect(page.getByTestId('sinal-retomado')).toContainText(
      'Isto não indica que a execução terminou.',
    );
    await expect(page.getByTestId('status-desafio')).toHaveText('Em andamento');
    await expect(indicador(page)).toHaveText('Conectado');
  });

  test('um sinal de outra corrida é ignorado', async ({ page }) => {
    await comCorridaEmAndamento(page);

    backend.enviar(sinal('PERDIDO', OUTRA_CORRIDA));
    // Uma mensagem da corrida atual depois dela mostra que a anterior já foi tratada.
    backend.enviar(eventoCelula(2, 0, 2, { metricas: metricas({ celulas_percorridas: 1 }) }));

    await expect(page.getByTestId('celulas-percorridas')).toHaveText('1');
    await expect(page.getByTestId('alerta-sem-sinal')).toHaveCount(0);
    await expect(indicador(page)).toHaveText('Conectado');
  });

  test('ao começar outra corrida, cancela a anterior, inscreve na nova e zera a tela', async ({
    page,
  }) => {
    await comCorridaEmAndamento(page);
    backend.enviar(eventoCelula(2, 0, 2, { metricas: metricas({ celulas_percorridas: 1 }) }));
    await expect(page.getByTestId('celulas-percorridas')).toHaveText('1');

    backend.snapshotDe = (id) =>
      snapshot({ corrida: id, labirinto: '4x4', mapa: [], posicao: null, metricas: metricas() });
    backend.enviar(aoVivo({ corrida: OUTRA_CORRIDA, labirinto: '4x4' }));

    await expect.poll(() => backend.mensagensDeCorrida('cancelar')).toEqual([CORRIDA]);
    await expect
      .poll(() => backend.mensagensDeCorrida('inscrever'))
      .toEqual([CORRIDA, OUTRA_CORRIDA]);
    await expect(page.getByTestId('celulas-percorridas')).toHaveText('0');
    await expect(page.getByTestId('status-desafio')).toHaveText('Em andamento');

    // Uma mensagem atrasada da corrida antiga não mexe na nova. A pausa dá tempo de ela ser
    // tratada (e descartada) antes da conferência; sem ela o teste passaria por velocidade.
    backend.enviar(eventoCelula(3, 1, 3, { metricas: metricas({ celulas_percorridas: 9 }) }));
    await page.waitForTimeout(300);
    await expect(page.getByTestId('celulas-percorridas')).toHaveText('0');
    backend.enviar(
      eventoCelula(2, 0, 2, {
        corrida: OUTRA_CORRIDA,
        metricas: metricas({ celulas_percorridas: 1 }),
      }),
    );

    await expect(page.getByTestId('celulas-percorridas')).toHaveText('1');
  });

  test('um ao_vivo atrasado não reabre uma corrida que já terminou', async ({ page }) => {
    await comCorridaEmAndamento(page);
    backend.enviar(eventoStatus('CONCLUIDA', { metricas: metricas({ tempo_conclusao_ms: 9400 }) }));
    await expect(page.getByTestId('status-desafio')).toHaveText('Concluída');

    backend.enviar(aoVivo({ status: 'EM_ANDAMENTO' }), aoVivo({ status: 'CONCLUIDA' }));

    await expect(page.getByTestId('status-desafio')).toHaveText('Concluída');
    await expect(page.getByTestId('desafio-cumprido')).toBeVisible();
  });

  test('cai a conexão: reconecta sozinho e pede o snapshot da corrida em andamento', async ({
    page,
  }) => {
    await comCorridaEmAndamento(page);
    await expect(indicador(page)).toHaveText('Conectado');

    backend.derrubar();

    await expect(indicador(page)).toHaveText('Reconectando');
    await expect(indicador(page)).toHaveAttribute('data-estado', 'reconectando');
    // O recuo da reconexão tem teto de 2 s (RNF-39).
    await expect(indicador(page)).toHaveText('Conectado', { timeout: 5000 });
    expect(backend.conexoes).toBe(2);
    await expect.poll(() => backend.recebidasDoPainel.filter((m) => 'canal' in m).length).toBe(2);
    await expect.poll(() => backend.mensagensDeCorrida('inscrever')).toEqual([CORRIDA, CORRIDA]);
    await expect(page.getByTestId('status-desafio')).toHaveText('Em andamento');
  });

  test('sem nenhum WebSocket do backend, o painel segue tentando reconectar', async ({ page }) => {
    await page.goto('/');
    await backend.aguardarConexao();

    backend.derrubar(1006);
    await expect(indicador(page)).toHaveText('Reconectando');
    await expect(indicador(page)).toHaveText('Conectado', { timeout: 5000 });
    backend.derrubar(1006);
    await expect(indicador(page)).toHaveText('Reconectando');
    await expect(indicador(page)).toHaveText('Conectado', { timeout: 5000 });

    expect(backend.conexoes).toBe(3);
  });

  test('avisa quando o backend está indisponível', async ({ page }) => {
    backend.saude = () => ({ abortar: true });

    await page.goto('/');

    await expect(page.getByText('Backend indisponível')).toBeVisible();
  });

  test('o backend sem banco aparece no cartão de alertas', async ({ page }) => {
    backend.saude = () => ({ corpo: { status: 'degradado', banco: 'indisponivel' }, status: 503 });

    await page.goto('/');

    await expect(page.getByText('Banco de dados')).toBeVisible();
    await expect(page.getByText('indisponivel', { exact: true })).toBeVisible();
  });

  test.describe('modo de depuração (HU-FE-14)', () => {
    const comDepuracao = (depuracao: unknown): MensagemPainelSaida =>
      ({
        ...continuo({ tempo_ms: 1700, metricas: metricas({ tempo_decorrido_ms: 1700 }) }),
        depuracao,
      }) as unknown as MensagemPainelSaida;

    test('mostra os dados brutos dos sensores quando o modo é aberto', async ({ page }) => {
      await comCorridaEmAndamento(page);
      await expect(page.getByTestId('painel-depuracao')).toHaveCount(0);

      await page.getByRole('button', { name: 'Depuração' }).click();

      await expect(page.getByTestId('painel-depuracao')).toBeVisible();
      await expect(page.getByTestId('depuracao-aguardando')).toHaveText(
        'Aguardando leituras de depuração…',
      );
      await expect(page.getByTestId('depuracao-mpu-angulo')).toHaveText('—');

      backend.enviar(
        comDepuracao({
          tof_mm: [120, 85.5, 0],
          mpu_angulo_graus: 90,
          encoder_esquerdo: 1200,
          encoder_direito: 1180,
        }),
      );

      await expect(page.getByTestId('depuracao-aguardando')).toHaveCount(0);
      await expect(page.getByTestId('depuracao-tof-1')).toHaveText('120 mm');
      await expect(page.getByTestId('depuracao-tof-2')).toHaveText('85,5 mm');
      // Zero é uma leitura válida: não vira "—".
      await expect(page.getByTestId('depuracao-tof-3')).toHaveText('0 mm');
      await expect(page.getByTestId('depuracao-mpu-angulo')).toHaveText('90°');
      await expect(page.getByTestId('depuracao-encoder-esquerdo')).toHaveText('1.200');
      await expect(page.getByTestId('depuracao-encoder-direito')).toHaveText('1.180');
    });

    test('um valor ausente ou inválido aparece como "—", e a tentativa não é alterada', async ({
      page,
    }) => {
      await comCorridaEmAndamento(page);
      await page.getByRole('button', { name: 'Depuração' }).click();

      backend.enviar(
        comDepuracao({ tof_mm: [150, -3, null], mpu_angulo_graus: 'x', encoder_esquerdo: 7.5 }),
      );

      await expect(page.getByTestId('depuracao-tof-1')).toHaveText('150 mm');
      await expect(page.getByTestId('depuracao-tof-2')).toHaveText('—');
      await expect(page.getByTestId('depuracao-tof-3')).toHaveText('—');
      await expect(page.getByTestId('depuracao-mpu-angulo')).toHaveText('—');
      await expect(page.getByTestId('depuracao-encoder-esquerdo')).toHaveText('—');
      await expect(page.getByTestId('depuracao-encoder-direito')).toHaveText('—');
      await expect(page.getByTestId('status-desafio')).toHaveText('Em andamento');
    });

    test('mostra até 7 sensores ToF e o console conta as mensagens recebidas', async ({ page }) => {
      await comCorridaEmAndamento(page);
      await page.getByRole('button', { name: 'Depuração' }).click();

      backend.enviar(
        comDepuracao({
          tof_mm: [10, 20, 30, 40, 50, 60, 70, 80, 90],
          mpu_angulo_graus: 0,
          encoder_esquerdo: 0,
          encoder_direito: 0,
        }),
      );

      await expect(page.getByTestId('depuracao-tof-7')).toHaveText('70 mm');
      await expect(page.getByTestId('depuracao-tof-8')).toHaveCount(0);
      await expect(page.getByLabel('Console de depuração')).toContainText('status=Em andamento');
      await expect(page.getByLabel('Console de depuração')).toContainText('backend=ok');
    });
  });
});
