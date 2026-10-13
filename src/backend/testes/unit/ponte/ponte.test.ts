import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ponte, type SocketPonte } from '../../../ponte/ponte.js';

class SocketFalso implements SocketPonte {
  readyState = 0;
  enviadas: string[] = [];
  fechadoCom: number | null = null;
  private ouvintes: Record<string, ((evento: never) => void)[]> = {};

  send(dados: string): void {
    this.enviadas.push(dados);
  }
  close(codigo?: number): void {
    this.fechadoCom = codigo ?? 1005;
    this.readyState = 3;
  }
  addEventListener(tipo: string, ouvinte: (evento: never) => void): void {
    (this.ouvintes[tipo] ??= []).push(ouvinte);
  }
  private emitir(tipo: string, evento: unknown = {}): void {
    for (const ouvinte of this.ouvintes[tipo] ?? []) ouvinte(evento as never);
  }
  abrir(): void {
    this.readyState = 1;
    this.emitir('open');
  }
  cair(codigo = 1006): void {
    this.readyState = 3;
    this.emitir('close', { code: codigo });
  }
  receber(dados: string): void {
    this.emitir('message', { data: dados });
  }
}

const HELLO = '{"tipo":"hello","versao":1,"dispositivo":"rato-01","token":"T","boot":"b1"}';
const msg = (sequencia: number) =>
  `{"versao":1,"tipo":"posicao","corrida":"c1","sequencia":${sequencia},"tempo_ms":${sequencia * 100}}`;

describe('Ponte', () => {
  let sockets: SocketFalso[];
  let ponte: Ponte;
  const registro = { info: vi.fn(), aviso: vi.fn(), erro: vi.fn() };
  const ultimo = () => sockets.at(-1)!;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sockets = [];
    ponte = new Ponte({
      registro,
      capacidadeBuffer: 3,
      criarSocket: () => {
        const socket = new SocketFalso();
        sockets.push(socket);
        return socket;
      },
    });
  });
  afterEach(() => vi.useRealTimers());

  it('só conecta ao backend depois do hello e repassa as linhas sem alterar', () => {
    ponte.iniciarSessao();
    expect(sockets).toHaveLength(0);

    ponte.linha(HELLO);
    ultimo().abrir();
    ponte.linha(msg(1));
    ponte.linha(msg(2));

    expect(ultimo().enviadas).toEqual([HELLO, msg(1), msg(2)]);
    expect(ponte.contadores).toMatchObject({ linhasRecebidas: 3, linhasEnviadas: 2 });
  });

  it('descarta o que chega antes do hello', () => {
    ponte.iniciarSessao();
    ponte.linha(msg(1));
    ponte.linha(HELLO);
    ultimo().abrir();

    expect(ultimo().enviadas).toEqual([HELLO]);
    expect(ponte.contadores.linhasSemHello).toBe(1);
  });

  it('guarda as linhas enquanto o backend não abre e as envia depois do hello', () => {
    ponte.iniciarSessao();
    ponte.linha(HELLO);
    ponte.linha(msg(1));
    ponte.linha(msg(2));
    expect(ultimo().enviadas).toEqual([]);

    ultimo().abrir();
    expect(ultimo().enviadas).toEqual([HELLO, msg(1), msg(2)]);
  });

  it('reconecta com backoff e reenvia o hello quando o backend cai', () => {
    ponte.iniciarSessao();
    ponte.linha(HELLO);
    ultimo().abrir();
    ultimo().cair();

    ponte.linha(msg(5));
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(250);
    expect(sockets).toHaveLength(2);

    ultimo().abrir();
    expect(ultimo().enviadas).toEqual([HELLO, msg(5)]);
  });

  it('espera 0,25 → 0,5 → 1 → 2 s entre as tentativas, com teto de 2 s', () => {
    ponte.iniciarSessao();
    ponte.linha(HELLO);
    for (const atraso of [250, 500, 1000, 2000, 2000]) {
      const antes = sockets.length;
      ultimo().cair();
      vi.advanceTimersByTime(atraso - 1);
      expect(sockets).toHaveLength(antes);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(antes + 1);
    }
  });

  it('perde as linhas mais antigas quando o buffer enche e conta a perda', () => {
    ponte.iniciarSessao();
    ponte.linha(HELLO);
    for (let i = 1; i <= 5; i++) ponte.linha(msg(i));
    ultimo().abrir();

    expect(ultimo().enviadas).toEqual([HELLO, msg(3), msg(4), msg(5)]);
    expect(ponte.contadores.linhasPerdidas).toBe(2);
  });

  it.each([
    [4001, 'token inválido'],
    [4002, 'não suportada'],
  ])('não insiste quando o backend recusa o hello com %i', (codigo, trecho) => {
    ponte.iniciarSessao();
    ponte.linha(HELLO);
    ultimo().abrir();
    ultimo().cair(codigo);
    ponte.linha(msg(1));
    vi.advanceTimersByTime(10_000);

    expect(sockets).toHaveLength(1);
    expect(registro.erro).toHaveBeenCalledWith(expect.stringContaining(trecho));
  });

  it('fecha a conexão com o backend quando o Bluetooth cai (perda de sinal imediata)', () => {
    ponte.iniciarSessao();
    ponte.linha(HELLO);
    ultimo().abrir();
    const socket = ultimo();

    ponte.encerrarSessao();
    expect(socket.fechadoCom).toBe(1000);

    ponte.linha(msg(1));
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(1);
    expect(socket.enviadas).toEqual([HELLO]);
  });

  it('exige novo hello em cada sessão Bluetooth', () => {
    ponte.iniciarSessao();
    ponte.linha(HELLO);
    ultimo().abrir();
    ponte.encerrarSessao();

    ponte.iniciarSessao();
    ponte.linha(msg(7));
    expect(sockets).toHaveLength(1);

    ponte.linha(HELLO);
    ultimo().abrir();
    ponte.linha(msg(8));
    expect(ultimo().enviadas).toEqual([HELLO, msg(8)]);
  });

  it('abre nova conexão quando o robô reinicia e manda outro hello na mesma sessão', () => {
    const helloNovo = HELLO.replace('b1', 'b2');
    ponte.iniciarSessao();
    ponte.linha(HELLO);
    ultimo().abrir();
    const primeiro = ultimo();

    ponte.linha(helloNovo);
    expect(primeiro.fechadoCom).toBe(1000);
    ultimo().abrir();
    expect(ultimo().enviadas).toEqual([helloNovo]);
  });

  it('conta os acks do backend sem repassar nada ao robô', () => {
    ponte.iniciarSessao();
    ponte.linha(HELLO);
    ultimo().abrir();
    ultimo().receber('{"tipo":"ack","corrida":"c1","sequencia":1}');

    expect(ponte.contadores.acksRecebidos).toBe(1);
  });
});
