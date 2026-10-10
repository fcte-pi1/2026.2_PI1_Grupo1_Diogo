import { describe, expect, it } from 'vitest';
import type {
  Celula,
  Energia,
  Estado,
  FimCorrida,
  Hello,
  InicioCorrida,
  MensagemCorrida,
  MensagemPainelEntrada,
  Posicao,
} from '../../../protocolo/tipos.js';
import { criarValidadorProtocolo, interpretarJson } from '../../../protocolo/validador.js';

const validador = criarValidadorProtocolo();
const env = { versao: 1, corrida: 'c-1', sequencia: 1, tempo_ms: 1000 } as const;

// Exemplos tipados: se tipos.ts e os esquemas divergirem, estes testes falham.
const hello: Hello = {
  tipo: 'hello',
  versao: 1,
  dispositivo: 'sim-01',
  token: 'T-VALIDO',
  boot: 'b1',
};
const exemplos: MensagemCorrida[] = [
  { ...env, tipo: 'inicio_corrida', labirinto: '8x4' } satisfies InicioCorrida,
  {
    ...env,
    tipo: 'celula',
    x: 3,
    y: 1,
    paredes: { norte: true, leste: false, sul: false, oeste: true },
  } satisfies Celula,
  { ...env, tipo: 'posicao', x: 3, y: 1, orientacao: 'LESTE', celulas: 7 } satisfies Posicao,
  {
    ...env,
    tipo: 'posicao',
    x: 0,
    y: 0,
    orientacao: 'NORTE',
    celulas: 0,
    velocidade_media_mps: 0.12,
  } satisfies Posicao,
  { ...env, tipo: 'energia', tensao_v: 7.8, corrente_a: 0.42, potencia_w: 3.3 } satisfies Energia,
  { ...env, tipo: 'estado', estado: 'MAPEANDO' } satisfies Estado,
  { ...env, tipo: 'fim_corrida', resultado: 'sucesso' } satisfies FimCorrida,
  {
    ...env,
    tipo: 'fim_corrida',
    resultado: 'falha',
    detalhe: 'Erro: sensor ToF 3',
  } satisfies FimCorrida,
];

describe('validador do protocolo v1', () => {
  describe('hello', () => {
    it('aceita um hello válido', () => {
      expect(validador.hello(hello)).toEqual({ ok: true, mensagem: hello });
    });

    it('recusa versão não suportada (fechamento 4002, CT-BE-02)', () => {
      expect(validador.hello({ ...hello, versao: 99 })).toMatchObject({
        ok: false,
        codigo: 'VERSAO_NAO_SUPORTADA',
      });
    });

    it.each([
      ['sem token', { ...hello, token: undefined }],
      ['sem boot', { ...hello, boot: undefined }],
      ['token vazio', { ...hello, token: '' }],
      ['campo extra', { ...hello, admin: true }],
      ['mensagem de corrida no lugar do hello', exemplos[1]],
    ])('recusa hello %s', (_caso, bruto) => {
      expect(validador.hello(JSON.parse(JSON.stringify(bruto)))).toMatchObject({
        ok: false,
        codigo: 'ESQUEMA_INVALIDO',
      });
    });
  });

  describe('mensagens de corrida', () => {
    it.each(exemplos.map((m) => [m.tipo, m] as const))('aceita %s válida', (_tipo, mensagem) => {
      expect(validador.corrida(mensagem)).toEqual({ ok: true, mensagem });
    });

    it('recusa celula sem paredes (CT-BE-05, passo 1)', () => {
      const { paredes, ...semParedes } = exemplos[1] as Celula;
      const resultado = validador.corrida(semParedes);
      expect(resultado).toMatchObject({ ok: false, codigo: 'ESQUEMA_INVALIDO' });
      expect(!resultado.ok && resultado.detalhe).toContain('paredes');
    });

    it('recusa tipo desconhecido (CT-BE-05, passo 3)', () => {
      expect(validador.corrida({ ...env, tipo: 'teleporte' })).toMatchObject({
        ok: false,
        codigo: 'TIPO_DESCONHECIDO',
      });
    });

    it.each(['constructor', 'toString', '__proto__', 'hello'])(
      'recusa tipo %s sem consultar o protótipo',
      (tipo) => {
        expect(validador.corrida({ ...env, tipo })).toMatchObject({
          ok: false,
          codigo: 'TIPO_DESCONHECIDO',
        });
      },
    );

    it.each([
      ['sequencia zero', { sequencia: 0 }],
      ['sequencia não inteira', { sequencia: 1.5 }],
      ['tempo_ms negativo', { tempo_ms: -1 }],
      ['corrida vazia', { corrida: '' }],
      ['corrida com espaço', { corrida: 'c 1' }],
      ['labirinto inválido (CT-BE-07)', { labirinto: '5x5' }],
      ['campo extra', { extra: 1 }],
    ])('recusa inicio_corrida com %s', (_caso, alteracao) => {
      expect(validador.corrida({ ...exemplos[0], ...alteracao })).toMatchObject({
        ok: false,
        codigo: 'ESQUEMA_INVALIDO',
      });
    });

    it('recusa versão não suportada', () => {
      expect(validador.corrida({ ...exemplos[0], versao: 2 })).toMatchObject({
        ok: false,
        codigo: 'VERSAO_NAO_SUPORTADA',
      });
    });

    it('deixa a faixa de tensão para o domínio (RF-76)', () => {
      expect(validador.corrida({ ...exemplos[4], tensao_v: 4.9 }).ok).toBe(true);
    });

    it.each([
      ['v', { v: 1, versao: undefined }],
      ['seq', { seq: 1, sequencia: undefined }],
      ['t', { t: 1000, tempo_ms: undefined }],
    ])('recusa a chave abreviada %s no lugar da chave por extenso', (_chave, alteracao) => {
      const mensagem = JSON.parse(JSON.stringify({ ...exemplos[0], ...alteracao }));
      expect(validador.corrida(mensagem)).toMatchObject({ ok: false, codigo: 'ESQUEMA_INVALIDO' });
    });

    it('recusa paredes e orientação abreviadas', () => {
      const paredes = { n: true, l: false, s: false, o: true };
      expect(validador.corrida({ ...exemplos[1], paredes }).ok).toBe(false);
      expect(validador.corrida({ ...exemplos[2], orientacao: 'L' }).ok).toBe(false);
    });

    it('recusa estado com acento ou em minúsculas', () => {
      expect(validador.corrida({ ...env, tipo: 'estado', estado: 'Concluído' }).ok).toBe(false);
    });
  });

  describe('painel', () => {
    const uuid = '0b6f7c0e-3a52-4c8e-9a51-1f0f5c1f2a33';

    it.each([
      [{ tipo: 'inscrever', canal: 'ao_vivo' }],
      [{ tipo: 'inscrever', corrida: uuid }],
      [{ tipo: 'cancelar', corrida: uuid }],
    ] satisfies [MensagemPainelEntrada][])('aceita %j', (mensagem) => {
      expect(validador.painel(mensagem).ok).toBe(true);
    });

    it.each([
      [{ tipo: 'inscrever' }],
      [{ tipo: 'inscrever', corrida: uuid, canal: 'ao_vivo' }],
      [{ tipo: 'inscrever', corrida: 'nao-e-uuid' }],
      [{ tipo: 'anular', corrida: uuid }],
    ])('recusa %j', (mensagem) => {
      expect(validador.painel(mensagem).ok).toBe(false);
    });
  });

  describe('interpretarJson', () => {
    it('recusa texto que não é JSON (CT-BE-05, passo 2)', () => {
      expect(interpretarJson('não sou json')).toMatchObject({ ok: false, codigo: 'JSON_INVALIDO' });
    });

    it('interpreta JSON válido', () => {
      expect(interpretarJson('{"a":1}')).toEqual({ ok: true, mensagem: { a: 1 } });
    });
  });
});
