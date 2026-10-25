import { expect, type Page, type Route, type WebSocketRoute } from '@playwright/test';
import type {
  AoVivoPainel,
  CorridaResumo,
  MensagemPainelEntrada,
  MensagemPainelSaida,
  RespostaListaCorridas,
  SnapshotPainel,
} from '../../../src/protocolo';

/**
 * O backend simulado na rede do navegador. O painel roda de verdade; só as respostas HTTP
 * (`/health`, `/api/corridas`, `/api/corridas/:id`) e o WebSocket `/ws/painel` são nossos.
 * Cada teste ajusta os campos públicos (`listar`, `detalhe`, `saude`...) antes de navegar.
 */
export interface RespostaHttp {
  status?: number;
  corpo?: unknown;
  /** Demora a responder, para ver os estados de carregamento. */
  atrasoMs?: number;
  /** A requisição falha na rede, sem resposta HTTP. */
  abortar?: boolean;
}

export const ERRO_404 = {
  statusCode: 404,
  code: 'CORRIDA_NAO_ENCONTRADA',
  error: 'Not Found',
  message: 'corrida não encontrada',
};

const esperarMs = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

export class BackendFalso {
  /** Consultas HTTP recebidas, na ordem. */
  readonly requisicoes: { caminho: string; consulta: URLSearchParams }[] = [];
  /** O que o painel enviou pelo WebSocket, de todas as conexões. */
  readonly recebidasDoPainel: MensagemPainelEntrada[] = [];
  /** Quantas conexões WebSocket o painel abriu. */
  conexoes = 0;

  saude: () => RespostaHttp = () => ({ corpo: { status: 'ok', banco: 'ok' } });
  listar: (consulta: URLSearchParams) => RespostaHttp = () => ({ corpo: listaDe([]) });
  detalhe: (id: string) => RespostaHttp = () => ({ status: 404, corpo: ERRO_404 });
  /** Corridas anunciadas assim que o painel se inscreve no canal `ao_vivo`. */
  emAndamento: AoVivoPainel[] = [];
  /** Snapshot devolvido quando o painel se inscreve numa corrida. */
  snapshotDe: (corrida: string) => SnapshotPainel | null = () => null;

  private socket: WebSocketRoute | null = null;

  async instalar(page: Page): Promise<void> {
    await page.route(
      (url) => url.pathname === '/health',
      (route) => this.responder(route, this.saude()),
    );
    await page.route(
      (url) => url.pathname === '/api/corridas',
      (route) => {
        const consulta = new URL(route.request().url()).searchParams;
        this.requisicoes.push({ caminho: '/api/corridas', consulta });
        return this.responder(route, this.listar(consulta));
      },
    );
    await page.route(
      (url) => url.pathname.startsWith('/api/corridas/'),
      (route) => {
        const { pathname } = new URL(route.request().url());
        this.requisicoes.push({ caminho: pathname, consulta: new URLSearchParams() });
        const id = decodeURIComponent(pathname.slice('/api/corridas/'.length));
        return this.responder(route, this.detalhe(id));
      },
    );
    await page.routeWebSocket(/\/ws\/painel$/, (ws) => {
      this.conexoes += 1;
      this.socket = ws;
      ws.onMessage((dado) => {
        const mensagem = JSON.parse(String(dado)) as MensagemPainelEntrada;
        this.recebidasDoPainel.push(mensagem);
        if (mensagem.tipo !== 'inscrever') return;
        if ('canal' in mensagem) {
          for (const anuncio of this.emAndamento) ws.send(JSON.stringify(anuncio));
          return;
        }
        const snapshot = this.snapshotDe(mensagem.corrida);
        if (snapshot) ws.send(JSON.stringify(snapshot));
      });
      ws.onClose(() => {
        if (this.socket === ws) this.socket = null;
      });
    });
  }

  private async responder(route: Route, resposta: RespostaHttp): Promise<void> {
    try {
      if (resposta.atrasoMs) await esperarMs(resposta.atrasoMs);
      if (resposta.abortar) return await route.abort('failed');
      await route.fulfill({
        status: resposta.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(resposta.corpo ?? {}),
      });
    } catch {
      // A página já foi fechada (fim do teste) enquanto a resposta esperava.
    }
  }

  /** Espera o painel abrir o WebSocket. */
  async aguardarConexao(): Promise<void> {
    await expect.poll(() => this.socket !== null, { message: 'o painel não conectou' }).toBe(true);
  }

  /** Envia mensagens do backend para o painel, pela conexão aberta. */
  enviar(...mensagens: MensagemPainelSaida[]): void {
    if (!this.socket) throw new Error('O painel não está conectado ao WebSocket falso');
    for (const mensagem of mensagens) this.socket.send(JSON.stringify(mensagem));
  }

  /** Fecha a conexão pelo lado do backend, como uma queda de rede ou um reinício. */
  derrubar(codigo = 1011): void {
    this.socket?.close({ code: codigo, reason: 'e2e' });
  }

  /** Mensagens `inscrever` e `cancelar` de corrida enviadas pelo painel. */
  mensagensDeCorrida(tipo: 'inscrever' | 'cancelar'): string[] {
    return this.recebidasDoPainel.flatMap((m) =>
      m.tipo === tipo && 'corrida' in m ? [m.corrida] : [],
    );
  }
}

/** UUID previsível para a `n`-ésima corrida de um teste. */
export const idCorrida = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function resumo(parcial: Partial<CorridaResumo> = {}): CorridaResumo {
  return {
    id: idCorrida(1),
    iniciada_em: '2026-10-17T14:30:05.000Z',
    tipo_labirinto: '8x4',
    numero_tentativa: null,
    status: 'CONCLUIDA',
    motivo_termino: 'SUCESSO',
    tempo_conclusao_ms: 94500,
    anulada: false,
    ...parcial,
  };
}

export function listaDe(
  itens: CorridaResumo[],
  total = itens.length,
  pagina = 1,
  tamanho = 20,
): RespostaListaCorridas {
  return { itens, total, pagina, tamanho };
}

/** Corridas de `de` a `ate` (inclusive), com ids sequenciais. */
export function corridasGeradas(
  de: number,
  ate: number,
  parcial: Partial<CorridaResumo> = {},
): CorridaResumo[] {
  return Array.from({ length: ate - de + 1 }, (_, i) =>
    resumo({ id: idCorrida(de + i), ...parcial }),
  );
}
