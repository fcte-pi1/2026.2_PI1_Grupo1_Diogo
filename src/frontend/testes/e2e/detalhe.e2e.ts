import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { ID_DETALHE, amostrasEnergia, detalheHttp } from '../suporte/detalhe';
import { CORRIDA, aoVivo, continuo, eventoCelula, metricas } from '../suporte/mensagens';
import { BackendFalso } from './suporte/backend-falso';

/** Detalhe de uma execução passada, exportação e avisos de falha (HU-FE-11, 12, 13 e 15). */
test.describe('detalhe de uma execução', () => {
  let backend: BackendFalso;

  test.beforeEach(async ({ page }) => {
    backend = new BackendFalso();
    backend.detalhe = (id) => ({ corpo: detalheHttp({ id }) });
    await backend.instalar(page);
  });

  const abrir = (page: Page, id = ID_DETALHE) => page.goto(`/historico/${id}`);

  test('mostra a execução gravada na mesma visualização do ao vivo, em modo histórico', async ({
    page,
  }) => {
    await abrir(page);

    await expect(page.getByRole('heading', { name: 'Execução passada' })).toBeVisible();
    await expect(page.getByTestId('aviso-historico')).toContainText('Modo histórico');
    await expect(page.getByTestId('aviso-historico')).toContainText(
      'Mensagens ao vivo não alteram estes dados.',
    );
    await expect(page.getByTestId('painel-execucao')).toHaveAttribute('data-modo', 'historico');
    await expect(page.getByTestId('etiqueta-modo')).toHaveText('MODO HISTÓRICO');
    await expect(page.getByTestId('status-desafio')).toHaveText('Concluída');
    await expect(page.getByTestId('desafio')).toHaveText('Concluído');
    await expect(page.getByTestId('desafio-cumprido')).toBeVisible();
    await expect(page.getByTestId('tempo')).toHaveText('01:34.5');
    await expect(page.getByTestId('celulas-percorridas')).toHaveText('45');
    await expect(page.getByTestId('distancia-total')).toHaveText('8,1 m');
    await expect(page.getByTestId('velocidade-media')).toHaveText('0,09 m/s');
    await expect(page.getByTestId('carga-estimada')).toHaveText('72%');
    await expect(page.getByTestId('variacao-tensao')).toHaveText('0,4 V');
    await expect(page.getByTestId('labirinto')).toBeVisible();
    await expect(page.getByTestId('trajetoria')).toBeAttached();
    await expect(page.getByText('Sem falhas registradas')).toBeVisible();
  });

  test('mostra o carregamento enquanto a execução chega', async ({ page }) => {
    let liberar!: () => void;
    const portao = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    page.once('close', liberar);
    backend.detalhe = (id) => ({ corpo: detalheHttp({ id }), aguardar: portao });

    await abrir(page);

    await expect(page.getByTestId('detalhe-carregando')).toContainText('Carregando execução…');
    await expect(page.getByTestId('painel-execucao')).toHaveCount(0);

    liberar();

    await expect(page.getByTestId('painel-execucao')).toBeVisible();
    await expect(page.getByTestId('detalhe-carregando')).toBeHidden();
  });

  test('desenha o gráfico de consumo com todas as amostras da execução (HU-FE-12)', async ({
    page,
  }) => {
    backend.detalhe = (id) => ({ corpo: detalheHttp({ id, energia: amostrasEnergia(6000) }) });

    await abrir(page);

    await expect(page.getByTestId('grafico-consumo')).toHaveAttribute('data-amostras', '6000');
    await expect(
      page.getByRole('img', { name: 'Tensão, corrente e potência ao longo da tentativa' }),
    ).toBeVisible();
  });

  test('sem amostras de energia, o gráfico espera amostras', async ({ page }) => {
    await abrir(page);

    await expect(page.getByTestId('grafico-consumo')).toHaveAttribute('data-amostras', '0');
    await expect(page.getByTestId('grafico-consumo')).toContainText('Aguardando amostras');
  });

  test('uma execução que falhou mostra o motivo e o texto do robô (HU-FE-13)', async ({ page }) => {
    backend.detalhe = (id) => ({
      corpo: detalheHttp({
        id,
        status: 'FALHOU',
        motivo_termino: 'FALHA_REPORTADA',
        detalhe_termino: 'Sensor frontal sem leitura',
        tempo_conclusao_ms: null,
        metricas: {
          ...detalheHttp().metricas,
          tempo_conclusao_ms: null,
          tempo_decorrido_ms: 31200,
        },
      }),
    });

    await abrir(page);

    await expect(page.getByTestId('alerta-falha')).toContainText('Execução falhou');
    await expect(page.getByTestId('alerta-falha-motivo')).toHaveText(
      'Motivo: Falha reportada pelo robô (FALHA_REPORTADA)',
    );
    await expect(page.getByTestId('alerta-falha-detalhe')).toHaveText('Sensor frontal sem leitura');
    await expect(page.getByTestId('status-desafio')).toHaveText('Falhou');
    await expect(page.getByTestId('desafio-cumprido')).toHaveCount(0);
  });

  test('uma execução interrompida por falta de sinal é avisada como interrompida', async ({
    page,
  }) => {
    backend.detalhe = (id) => ({
      corpo: detalheHttp({
        id,
        status: 'INTERROMPIDA',
        motivo_termino: 'SEM_SINAL',
        tempo_conclusao_ms: null,
      }),
    });

    await abrir(page);

    await expect(page.getByTestId('alerta-falha')).toContainText('Execução interrompida');
    await expect(page.getByTestId('alerta-falha-motivo')).toHaveText(
      'Motivo: Perda de comunicação (SEM_SINAL)',
    );
    await expect(page.getByTestId('status-desafio')).toHaveText('Interrompida');
  });

  test('uma execução que não existe mostra o aviso, sem botão de tentar de novo', async ({
    page,
  }) => {
    backend.detalhe = () => ({ status: 404, corpo: { code: 'CORRIDA_NAO_ENCONTRADA' } });

    await abrir(page);

    const erro = page.getByTestId('detalhe-erro');
    await expect(erro).toContainText('Esta execução não existe ou foi removida do histórico.');
    await expect(erro.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0);
    await expect(erro.getByRole('link', { name: 'Voltar ao histórico' })).toBeVisible();
    await expect(page.getByTestId('painel-execucao')).toHaveCount(0);
  });

  test('um id que não é UUID (400 do backend) também é "não existe"', async ({ page }) => {
    backend.detalhe = () => ({ status: 400, corpo: { code: 'FST_ERR_VALIDATION' } });

    await abrir(page, 'abc');

    await expect(page.getByTestId('detalhe-erro')).toContainText(
      'Esta execução não existe ou foi removida do histórico.',
    );
  });

  test('erro do servidor e falta de rede permitem tentar de novo', async ({ page }) => {
    let modo: 'servidor' | 'rede' | 'ok' = 'servidor';
    backend.detalhe = (id) => {
      if (modo === 'servidor') return { status: 500, corpo: {} };
      if (modo === 'rede') return { abortar: true };
      return { corpo: detalheHttp({ id }) };
    };

    await abrir(page);
    const erro = page.getByTestId('detalhe-erro');
    await expect(erro).toContainText('O servidor não conseguiu retornar os dados desta execução.');

    modo = 'rede';
    await erro.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(erro).toContainText(
      'Não foi possível conectar ao servidor para carregar a execução.',
    );

    modo = 'ok';
    await erro.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.getByTestId('painel-execucao')).toBeVisible();
    await expect(page.getByTestId('detalhe-erro')).toHaveCount(0);
  });

  test('o link do detalhe volta para o histórico', async ({ page }) => {
    await abrir(page);

    await page.getByRole('link', { name: '← Voltar ao histórico' }).click();

    await expect(page).toHaveURL('/historico');
    await expect(page.getByRole('heading', { name: 'Histórico de tentativas' })).toBeVisible();
  });

  test('mensagens ao vivo não alteram a execução aberta, e ficam na tela ao vivo', async ({
    page,
  }) => {
    await abrir(page);
    await backend.aguardarConexao();
    await expect(page.getByTestId('tempo')).toHaveText('01:34.5');

    backend.enviar(
      aoVivo({ corrida: CORRIDA, labirinto: '4x4' }),
      eventoCelula(2, 0, 2, { metricas: metricas({ celulas_percorridas: 3 }) }),
      continuo({
        tempo_ms: 2000,
        metricas: metricas({ tempo_decorrido_ms: 2000, celulas_percorridas: 3 }),
      }),
    );
    // Dá tempo de a mensagem ser tratada: o painel da tela ao vivo reagiria em poucos ms.
    await expect.poll(() => backend.mensagensDeCorrida('inscrever')).toContain(CORRIDA);

    await expect(page.getByTestId('tempo')).toHaveText('01:34.5');
    await expect(page.getByTestId('celulas-percorridas')).toHaveText('45');
    await expect(page.getByTestId('status-desafio')).toHaveText('Concluída');

    await page
      .getByRole('navigation', { name: 'Seções do painel' })
      .getByRole('link', { name: 'Ao vivo' })
      .click();

    await expect(page.getByTestId('painel-execucao')).toHaveAttribute('data-modo', 'ao-vivo');
    await expect(page.getByTestId('celulas-percorridas')).toHaveText('3');
    await expect(page.getByTestId('status-desafio')).toHaveText('Em andamento');
  });

  test.describe('exportação (HU-FE-15)', () => {
    test('CSV: baixa o arquivo com BOM, cabeçalho e as seções da execução', async ({ page }) => {
      await abrir(page);

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTestId('exportar-csv').click(),
      ]);

      expect(download.suggestedFilename()).toBe(`execucao-${ID_DETALHE}.csv`);
      const csv = await readFile((await download.path())!, 'utf8');
      expect(csv.startsWith('\uFEFF')).toBe(true);
      const linhas = csv.replace(/^\uFEFF/, '').split('\r\n');
      expect(linhas[0]).toBe(
        'secao,id_execucao,campo,valor,sequencia,x,y,tempo_ms,tensao_v,corrente_a,potencia_w,carga_estimada_pct',
      );
      expect(linhas).toContain(`resumo,${ID_DETALHE},tipo_labirinto,8x4`);
      expect(linhas).toContain(`resumo,${ID_DETALHE},status,CONCLUIDA`);
      expect(linhas).toContain(`metrica,${ID_DETALHE},celulas_percorridas,45`);
      // O trajeto sai ordenado por sequência, mesmo com o backend enviando fora de ordem.
      expect(linhas.filter((l) => l.startsWith('trajeto,'))).toEqual([
        `trajeto,${ID_DETALHE},,,1,0,3`,
        `trajeto,${ID_DETALHE},,,2,0,2`,
      ]);
      await expect(page.getByTestId('exportacao-erro')).toHaveCount(0);
    });

    test('JSON: baixa a execução com identificação, métricas, mapa, trajeto e energia', async ({
      page,
    }) => {
      backend.detalhe = (id) => ({ corpo: detalheHttp({ id, energia: amostrasEnergia(3) }) });
      await abrir(page);

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTestId('exportar-json').click(),
      ]);

      expect(download.suggestedFilename()).toBe(`execucao-${ID_DETALHE}.json`);
      const json = JSON.parse(await readFile((await download.path())!, 'utf8'));
      expect(json).toMatchObject({
        id: ID_DETALHE,
        iniciada_em: '2026-10-17T14:30:05.000Z',
        tipo_labirinto: '8x4',
        status: 'CONCLUIDA',
        motivo_termino: 'SUCESSO',
        metricas: { tempo_ms: 94500, celulas_percorridas: 45, distancia_m: 8.1 },
      });
      expect(json.trajeto).toEqual([
        { sequencia: 1, x: 0, y: 3 },
        { sequencia: 2, x: 0, y: 2 },
      ]);
      expect(json.energia).toHaveLength(3);
      expect(json.mapa).toHaveLength(2);
    });

    test('o texto livre do robô que começa com "=" não vira fórmula na planilha', async ({
      page,
    }) => {
      backend.detalhe = (id) => ({
        corpo: detalheHttp({
          id,
          status: 'FALHOU',
          motivo_termino: 'FALHA_REPORTADA',
          detalhe_termino: '=HYPERLINK("http://exemplo.invalido")',
        }),
      });
      await abrir(page);

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByTestId('exportar-csv').click(),
      ]);

      const csv = await readFile((await download.path())!, 'utf8');
      expect(csv).toContain(
        `resumo,${ID_DETALHE},detalhe,"'=HYPERLINK(""http://exemplo.invalido"")"`,
      );
    });
  });
});
