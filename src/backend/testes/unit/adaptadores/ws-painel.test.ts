import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { criarValidadorProtocolo } from '../../../protocolo/validador.js';
import { ServicoConsulta } from '../../../src/aplicacao/index.js';
import { construirApp } from '../../../src/app.js';
import { AmbienteEmMemoria } from '../../apoio/ingestao-em-memoria.js';
import { linhaDoTempoVazia } from '../../apoio/linha-do-tempo-vazia.js';

describe('WS /ws/painel', () => {
  let app: FastifyInstance;
  afterEach(() => app.close());

  async function montar(amb: AmbienteEmMemoria) {
    app = await construirApp({
      linhaDoTempo: linhaDoTempoVazia(),
      verificarBanco: async () => true,
      contadores: amb.contadores,
      ingestao: amb.servico,
      distribuicao: amb.distribuicao,
      validador: criarValidadorProtocolo(),
      consulta: new ServicoConsulta({
        detalheCorrida: async () => null,
        leaderboard: async () => [],
        listarCorridas: async () => ({ itens: [], total: 0 }),
      }),
    });
    await app.ready();
  }

  it('um erro ao tratar a mensagem do painel não derruba a conexão nem o servidor', async () => {
    const amb = new AmbienteEmMemoria();
    const receber = vi.spyOn(amb.distribuicao, 'receber').mockImplementationOnce(() => {
      throw new Error('defeito na distribuição');
    });
    await montar(amb);

    const ws = await app.injectWS('/ws/painel');
    const recebidas: { tipo: string }[] = [];
    ws.on('message', (dados) => recebidas.push(JSON.parse(dados.toString())));
    ws.send(JSON.stringify({ tipo: 'inscrever', canal: 'ao_vivo' }));
    ws.send(JSON.stringify({ tipo: 'inscrever', canal: 'ao_vivo' }));
    await vi.waitFor(() => expect(receber).toHaveBeenCalledTimes(2));

    // A conexão segue aberta e o painel continua recebendo.
    amb.distribuicao.verificarPaineis();
    await vi.waitFor(() => expect(recebidas).toContainEqual({ tipo: 'keepalive' }));
    expect(ws.readyState).toBe(ws.OPEN);
    ws.terminate();
  });
});
