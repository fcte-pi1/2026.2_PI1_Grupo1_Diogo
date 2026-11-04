import { expect, test, type Page } from '@playwright/test';
import { aoVivo, celulaMapa, metricas, snapshot } from '../suporte/mensagens';
import { BackendFalso, corridasGeradas, listaDe } from './suporte/backend-falso';

/**
 * Verificações de tela dos RNF (seção de Frontend do `7.4 - Testes de software`): rolagem
 * horizontal (RNF-44), altura do texto dos dados (RNF-46) e carregamento inicial (RNF-42).
 */
test.describe('verificações de tela', () => {
  let backend: BackendFalso;

  test.beforeEach(async ({ page }) => {
    backend = new BackendFalso();
    backend.listar = () => ({ corpo: listaDe(corridasGeradas(1, 20), 200) });
    backend.snapshotDe = (id) =>
      snapshot({
        corrida: id,
        labirinto: '12x4',
        mapa: [celulaMapa(0, 3)],
        posicao: { x: 0, y: 3, orientacao: 'NORTE' },
        metricas: metricas({
          celulas_percorridas: 3,
          distancia_m: 0.54,
          tempo_decorrido_ms: 4200,
          velocidade_media_mps: 0.13,
          tensao_v: 8.1,
          corrente_a: 0.4,
          potencia_w: 3.2,
          carga_estimada_pct: 80,
          delta_v: 0.2,
        }),
      });
    await backend.instalar(page);
  });

  /** Abre a tela ao vivo com uma corrida 12x4 em andamento. */
  async function abrirAoVivo(page: Page) {
    await page.goto('/');
    await backend.aguardarConexao();
    backend.enviar(aoVivo({ labirinto: '12x4' }));
    await expect(page.getByTestId('celulas-percorridas')).toHaveText('3');
  }

  const larguraDaPagina = (page: Page) =>
    page.evaluate(() => ({
      rolagem: document.documentElement.scrollWidth,
      visivel: document.documentElement.clientWidth,
    }));

  // RNF-44: utilizável sem rolagem horizontal de 360 a 1920 px.
  for (const largura of [360, 768, 1280, 1920]) {
    test(`sem rolagem horizontal a ${largura} px, no ao vivo e no histórico (RNF-44)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largura, height: 900 });

      await abrirAoVivo(page);
      await expect(page.getByTestId('labirinto')).toBeVisible();
      const aoVivoMedido = await larguraDaPagina(page);
      expect(aoVivoMedido.rolagem, 'ao vivo').toBeLessThanOrEqual(aoVivoMedido.visivel);

      await page.goto('/historico');
      await expect(page.getByRole('table')).toBeVisible();
      const historicoMedido = await larguraDaPagina(page);
      expect(historicoMedido.rolagem, 'histórico').toBeLessThanOrEqual(historicoMedido.visivel);
    });
  }

  // Os dados obrigatórios (HU-FE-01) da tela: tipo de labirinto, cronômetro, status, velocidade,
  // células, distância, tensão, corrente e potência. Dados que a tela mostra com o mesmo
  // `data-testid` ao vivo e no histórico.
  const dadosObrigatorios = (page: Page) => ({
    tipo: page.getByTestId('tipo-labirinto'),
    tempo: page.getByTestId('tempo'),
    status: page.getByTestId('status-desafio'),
    velocidade: page.getByTestId('velocidade-media'),
    celulas: page.getByTestId('celulas-percorridas'),
    distancia: page.getByTestId('distancia-total'),
    tensao: page.getByTestId('tensao'),
    corrente: page.getByTestId('corrente'),
    potencia: page.getByTestId('potencia'),
  });

  // RNF-46: os dados obrigatórios com texto de pelo menos 24 px a 1920 × 1080.
  test('os dados obrigatórios têm texto de pelo menos 24 px a 1920 × 1080 (RNF-46)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await abrirAoVivo(page);

    for (const [nome, local] of Object.entries(dadosObrigatorios(page))) {
      await expect(local, nome).toBeVisible();
      const altura = await local.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect.soft(altura, nome).toBeGreaterThanOrEqual(24);
    }
  });

  // RNF-44 com o texto de 24 px: nenhum dado sai do próprio cartão nem da tela a 360 px.
  test('os dados de 24 px cabem no cartão e na tela a 360 px (RNF-44)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await abrirAoVivo(page);

    for (const [nome, local] of Object.entries(dadosObrigatorios(page))) {
      const cabe = await local.evaluate((el) => {
        const caixa = el.getBoundingClientRect();
        const cartao = el.closest('article')!.getBoundingClientRect();
        return {
          dentroDoCartao: caixa.left >= cartao.left - 0.5 && caixa.right <= cartao.right + 0.5,
          dentroDaTela: caixa.right <= document.documentElement.clientWidth + 0.5,
        };
      });
      expect.soft(cabe.dentroDoCartao, `${nome} dentro do cartão`).toBe(true);
      expect.soft(cabe.dentroDaTela, `${nome} dentro da tela`).toBe(true);
    }
    const largura = await larguraDaPagina(page);
    expect(largura.rolagem, 'rolagem horizontal').toBeLessThanOrEqual(largura.visivel);
  });

  // RNF-42: pronta para uso em até 3 s. Aqui no servidor de desenvolvimento local; a meta vale
  // para o build servido pelo backend numa rede Wi-Fi, que não é medido por este teste.
  test('a tela ao vivo fica pronta em até 3 s (RNF-42, servidor local)', async ({ page }) => {
    const inicio = Date.now();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Acompanhamento ao vivo' })).toBeVisible();
    const prontaEmMs = Date.now() - inicio;

    test.info().annotations.push({ type: 'RNF-42', description: `pronta em ${prontaEmMs} ms` });
    expect(prontaEmMs).toBeLessThanOrEqual(3000);
  });
});
