import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TIPOS_MENSAGEM_ROBO } from '../../protocolo/tipos.js';
import { criarValidadorProtocolo } from '../../protocolo/validador.js';

const caminho = process.env.CONTRACT_DUMP;
if (!caminho) {
  throw new Error('Defina CONTRACT_DUMP com o caminho do executável contract_dump.');
}
if (!existsSync(caminho)) {
  throw new Error(`Executável contract_dump não encontrado em: ${caminho}`);
}

const validador = criarValidadorProtocolo();
const linhas = execFileSync(caminho, { encoding: 'utf8' }).split('\n').filter(Boolean);
const mensagens = linhas.map((linha) => ({ linha, bruto: JSON.parse(linha) }));

describe('contrato firmware → backend', () => {
  it('cobre todos os tipos de mensagem do robô', () => {
    const tipos = new Set(mensagens.map((m) => m.bruto.tipo));
    expect([...tipos].sort()).toEqual(['hello', ...TIPOS_MENSAGEM_ROBO].sort());
  });

  it.each(mensagens.map((m) => [m.bruto.tipo, m] as const))('aceita %s', (_tipo, m) => {
    const r = m.bruto.tipo === 'hello' ? validador.hello(m.bruto) : validador.corrida(m.bruto);
    expect(r.ok, r.ok ? '' : `${r.detalhe} :: ${m.linha}`).toBe(true);
  });
});
