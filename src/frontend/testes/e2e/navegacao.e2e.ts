import { expect, test } from '@playwright/test';
import { ID_DETALHE, detalheHttp } from '../suporte/detalhe';
import { BackendFalso, listaDe, resumo } from './suporte/backend-falso';

/** Cabeçalho, rotas e a conexão que sobrevive à navegação (RF-58, RNF-42). */
test.describe('navegação do painel', () => {
  let backend: BackendFalso;

  test.beforeEach(async ({ page }) => {
    backend = new BackendFalso();
    backend.listar = () => ({ corpo: listaDe([resumo({ id: ID_DETALHE })]) });
    backend.detalhe = (id) => ({ corpo: detalheHttp({ id }) });
    await backend.instalar(page);
  });

  const menu = (page: import('@playwright/test').Page) =>
    page.getByRole('navigation', { name: 'Seções do painel' });

  test('o cabeçalho mostra o título, o estado da conexão e as seções', async ({ page }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Micromouse Dashboard', level: 1 }),
    ).toBeVisible();
    await expect(page.locator('[role="status"][data-estado]')).toHaveText('Conectado');
    await expect(menu(page).getByRole('link', { name: 'Ao vivo' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(menu(page).getByRole('link', { name: 'Histórico' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('alterna entre ao vivo, histórico e detalhe pelo menu e pelas linhas da tabela', async ({
    page,
  }) => {
    await page.goto('/');

    await menu(page).getByRole('link', { name: 'Histórico' }).click();
    await expect(page).toHaveURL('/historico');
    await expect(page.getByRole('heading', { name: 'Histórico de tentativas' })).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Histórico' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.locator('tbody tr a').first().click();
    await expect(page).toHaveURL(`/historico/${ID_DETALHE}`);
    await expect(page.getByRole('heading', { name: 'Execução passada' })).toBeVisible();

    await menu(page).getByRole('link', { name: 'Ao vivo' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Acompanhamento ao vivo' })).toBeVisible();
  });

  test('o botão Histórico da tela ao vivo também abre o histórico', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Histórico', exact: true }).click();

    await expect(page).toHaveURL('/historico');
  });

  test('abre direto pelo endereço do histórico e do detalhe (rotas carregadas sob demanda)', async ({
    page,
  }) => {
    await page.goto('/historico');
    await expect(page.getByRole('heading', { name: 'Histórico de tentativas' })).toBeVisible();

    await page.goto(`/historico/${ID_DETALHE}`);
    await expect(page.getByRole('heading', { name: 'Execução passada' })).toBeVisible();
    await expect(page.getByTestId('painel-execucao')).toBeVisible();
  });

  test('os botões voltar e avançar do navegador percorrem as telas', async ({ page }) => {
    await page.goto('/');
    await menu(page).getByRole('link', { name: 'Histórico' }).click();
    await expect(page).toHaveURL('/historico');

    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Acompanhamento ao vivo' })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL('/historico');
    await expect(page.getByRole('heading', { name: 'Histórico de tentativas' })).toBeVisible();
  });

  test('navegar entre as telas não derruba nem reabre a conexão com o backend', async ({
    page,
  }) => {
    await page.goto('/');
    await backend.aguardarConexao();

    await menu(page).getByRole('link', { name: 'Histórico' }).click();
    await expect(page.getByRole('heading', { name: 'Histórico de tentativas' })).toBeVisible();
    await page.locator('tbody tr a').first().click();
    await expect(page.getByRole('heading', { name: 'Execução passada' })).toBeVisible();
    await menu(page).getByRole('link', { name: 'Ao vivo' }).click();
    await expect(page.getByRole('heading', { name: 'Acompanhamento ao vivo' })).toBeVisible();

    await expect(page.locator('[role="status"][data-estado]')).toHaveText('Conectado');
    expect(backend.conexoes).toBe(1);
  });

  test('o indicador de conexão está em todas as telas', async ({ page }) => {
    for (const caminho of ['/', '/historico', `/historico/${ID_DETALHE}`]) {
      await page.goto(caminho);
      await expect(page.locator('[role="status"][data-estado]'), caminho).toHaveText('Conectado');
    }
  });
});
