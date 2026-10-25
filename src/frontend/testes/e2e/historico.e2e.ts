import { expect, test } from '@playwright/test';
import { ID_DETALHE, detalheHttp } from '../suporte/detalhe';
import { BackendFalso, corridasGeradas, idCorrida, listaDe, resumo } from './suporte/backend-falso';

/** Histórico de execuções (HU-FE-09 e HU-FE-10, caso de uso 9). */
test.describe('histórico de execuções', () => {
  let backend: BackendFalso;

  test.beforeEach(async ({ page }) => {
    backend = new BackendFalso();
    await backend.instalar(page);
  });

  test('lista as execuções com data e hora local, labirinto, tempo e resultado', async ({
    page,
  }) => {
    backend.listar = () => ({
      corpo: listaDe([
        resumo({ id: idCorrida(1) }),
        resumo({
          id: idCorrida(2),
          iniciada_em: '2026-10-17T15:00:00.000Z',
          tipo_labirinto: '4x4',
          status: 'FALHOU',
          motivo_termino: 'FALHA_REPORTADA',
          tempo_conclusao_ms: null,
        }),
        resumo({
          id: idCorrida(3),
          tipo_labirinto: '12x4',
          status: 'INTERROMPIDA',
          motivo_termino: 'SEM_SINAL',
          tempo_conclusao_ms: null,
        }),
      ]),
    });

    await page.goto('/historico');

    await expect(page.getByRole('heading', { name: 'Histórico de tentativas' })).toBeVisible();
    const linhas = page.locator('tbody tr');
    await expect(linhas).toHaveCount(3);
    // 14:30:05 UTC é 11:30:05 em Brasília (o fuso do teste).
    await expect(linhas.nth(0)).toContainText('17/10/2026 11:30:05');
    await expect(linhas.nth(0)).toContainText('8x4');
    await expect(linhas.nth(0)).toContainText('01:34.5');
    await expect(linhas.nth(0)).toContainText('Concluída');
    await expect(linhas.nth(1)).toContainText('4x4');
    await expect(linhas.nth(1)).toContainText('—');
    await expect(linhas.nth(1)).toContainText('Falhou');
    await expect(linhas.nth(2)).toContainText('Interrompida');
  });

  test('a primeira consulta pede a página 1, 20 itens e todos os labirintos', async ({ page }) => {
    await page.goto('/historico');

    await expect(page.getByText('Nenhuma execução registrada.')).toBeVisible();
    const consulta = backend.requisicoes.find((r) => r.caminho === '/api/corridas')!.consulta;
    expect(consulta.get('pagina')).toBe('1');
    expect(consulta.get('tamanho')).toBe('20');
    expect(consulta.has('tipo')).toBe(false);
    await expect(page.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('mostra o carregamento e não deixa dados antigos como se fossem os atuais', async ({
    page,
  }) => {
    backend.listar = () => ({ corpo: listaDe([resumo()]), atrasoMs: 800 });

    await page.goto('/historico');

    await expect(page.getByText('Carregando histórico…')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.getByText('Carregando histórico…')).toBeHidden();
  });

  test('sem execuções, explica que o histórico está vazio', async ({ page }) => {
    await page.goto('/historico');

    await expect(page.getByText('Nenhuma execução registrada.')).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('um erro do servidor mostra o aviso e permite tentar de novo', async ({ page }) => {
    let falhar = true;
    backend.listar = () =>
      falhar
        ? { status: 500, corpo: { statusCode: 500, error: 'Internal Server Error' } }
        : { corpo: listaDe([resumo()]) };

    await page.goto('/historico');

    const alerta = page.getByRole('alert');
    await expect(alerta).toContainText(
      'O servidor não conseguiu retornar o histórico de execuções.',
    );
    await expect(page.locator('table')).toHaveCount(0);

    falhar = false;
    await alerta.getByRole('button', { name: 'Tentar novamente' }).click();

    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('sem rede, diz que não conseguiu conectar ao servidor', async ({ page }) => {
    let falhar = true;
    backend.listar = () => (falhar ? { abortar: true } : { corpo: listaDe([resumo()]) });

    await page.goto('/historico');

    await expect(page.getByRole('alert')).toContainText(
      'Não foi possível conectar ao servidor para carregar o histórico.',
    );

    falhar = false;
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('o filtro troca a lista e continua visível, também quando não há resultado', async ({
    page,
  }) => {
    backend.listar = (consulta) => {
      const tipo = consulta.get('tipo');
      if (tipo === '12x4') return { corpo: listaDe([]) };
      const todas = [
        resumo({ id: idCorrida(1), tipo_labirinto: '4x4' }),
        resumo({ id: idCorrida(2), tipo_labirinto: '8x4' }),
      ];
      return { corpo: listaDe(tipo ? todas.filter((c) => c.tipo_labirinto === tipo) : todas) };
    };
    await page.goto('/historico');
    await expect(page.locator('tbody tr')).toHaveCount(2);

    await page.getByRole('button', { name: '8x4', exact: true }).click();

    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('8x4');
    await expect(page.getByRole('button', { name: '8x4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(backend.requisicoes.at(-1)!.consulta.get('tipo')).toBe('8x4');

    await page.getByRole('button', { name: '12x4', exact: true }).click();

    await expect(page.getByText('Nenhuma execução registrada no labirinto 12x4.')).toBeVisible();
    await expect(page.getByRole('button', { name: '12x4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: 'Todos', exact: true }).click();

    await expect(page.locator('tbody tr')).toHaveCount(2);
    expect(backend.requisicoes.at(-1)!.consulta.has('tipo')).toBe(false);
  });

  test('pagina de 20 em 20, e trocar o filtro volta para a primeira página', async ({ page }) => {
    backend.listar = (consulta) => {
      const total = consulta.get('tipo') ? 5 : 45;
      const pagina = Number(consulta.get('pagina'));
      const tamanho = Number(consulta.get('tamanho'));
      const primeira = (pagina - 1) * tamanho + 1;
      const ultima = Math.min(total, pagina * tamanho);
      return { corpo: listaDe(corridasGeradas(primeira, ultima), total, pagina, tamanho) };
    };
    await page.goto('/historico');
    const navegacao = page.getByRole('navigation', { name: 'Paginação do histórico' });
    const anterior = navegacao.getByRole('button', { name: 'Anterior' });
    const proxima = navegacao.getByRole('button', { name: 'Próxima' });

    await expect(navegacao).toContainText('Página 1 de 3');
    await expect(page.locator('tbody tr')).toHaveCount(20);
    await expect(anterior).toBeDisabled();

    await proxima.click();
    await expect(navegacao).toContainText('Página 2 de 3');
    expect(backend.requisicoes.at(-1)!.consulta.get('pagina')).toBe('2');
    await expect(page.locator('tbody tr')).toHaveCount(20);

    await proxima.click();
    await expect(navegacao).toContainText('Página 3 de 3');
    await expect(page.locator('tbody tr')).toHaveCount(5);
    await expect(proxima).toBeDisabled();

    await anterior.click();
    await expect(navegacao).toContainText('Página 2 de 3');

    // 5 corridas no 4x4 cabem numa página: a paginação some, e a consulta volta à página 1.
    await page.getByRole('button', { name: '4x4', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(5);
    await expect(navegacao).toHaveCount(0);
    const ultima = backend.requisicoes.at(-1)!.consulta;
    expect(ultima.get('tipo')).toBe('4x4');
    expect(ultima.get('pagina')).toBe('1');
  });

  test('cada linha abre o detalhe da execução', async ({ page }) => {
    backend.listar = () => ({ corpo: listaDe([resumo({ id: ID_DETALHE })]) });
    backend.detalhe = (id) => ({ corpo: detalheHttp({ id }) });
    await page.goto('/historico');

    await page.getByRole('link', { name: '17/10/2026 11:30:05' }).click();

    await expect(page).toHaveURL(`/historico/${ID_DETALHE}`);
    await expect(page.getByRole('heading', { name: 'Execução passada' })).toBeVisible();
    await expect
      .poll(() => backend.requisicoes.some((r) => r.caminho === `/api/corridas/${ID_DETALHE}`))
      .toBe(true);
  });

  test('ao voltar para a tela, nada da visita anterior aparece antes da nova consulta', async ({
    page,
  }) => {
    let consultas = 0;
    backend.listar = () => {
      consultas += 1;
      return consultas === 1
        ? { corpo: listaDe([resumo({ id: idCorrida(1) })]) }
        : { corpo: listaDe([resumo({ id: idCorrida(2) })]), atrasoMs: 600 };
    };
    await page.goto('/historico');
    await expect(page.locator('tbody tr')).toHaveCount(1);

    await page
      .getByRole('navigation', { name: 'Seções do painel' })
      .getByRole('link', { name: 'Ao vivo' })
      .click();
    await page
      .getByRole('navigation', { name: 'Seções do painel' })
      .getByRole('link', { name: 'Histórico' })
      .click();

    await expect(page.getByText('Carregando histórico…')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });
});
