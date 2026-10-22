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

  describe('casos de borda', () => {
    const detalhes = mensagens
      .filter((m) => m.bruto.tipo === 'fim_corrida' && m.bruto.detalhe !== undefined)
      .map((m) => m.bruto.detalhe as string);

    it('trunca um detalhe de 250 caracteres em 200', () => {
      expect(detalhes).toContain('x'.repeat(200));
      expect(detalhes.every((d) => [...d].length <= 200)).toBe(true);
    });

    it('escapa quebra de linha, tabulação, aspas, barra e caractere de controle', () => {
      expect(detalhes).toContain('linha 1\nlinha 2\t"aspas" \\ \u0001 fim');
    });

    it('corta o detalhe em 200 caracteres sem partir um caractere UTF-8 ao meio', () => {
      expect(detalhes).toContain('a'.repeat(199) + 'é');
      expect(detalhes.some((d) => d.includes('\uFFFD'))).toBe(false);
    });

    it('envia a velocidade média em m/s, e não em mm/s', () => {
      const velocidades = mensagens
        .filter((m) => m.bruto.tipo === 'posicao' && m.bruto.velocidade_media_mps !== undefined)
        .map((m) => m.bruto.velocidade_media_mps as number);
      expect(velocidades).toContain(0.25);
      expect(velocidades.every((v) => v < 5)).toBe(true);
    });
  });
});
