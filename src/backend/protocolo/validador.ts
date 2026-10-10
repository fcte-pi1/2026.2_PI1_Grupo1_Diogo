/**
 * Validação das mensagens do protocolo v1 contra os esquemas JSON publicados em `v1/` (RF-75).
 * Os esquemas são compilados uma única vez, na criação do validador (RNF-49).
 *
 * Valida apenas a FORMA da mensagem. Regras de domínio, como coordenada dentro do
 * labirinto, tensão entre 5 e 9 V e `t` não decrescente, ficam no domínio (RF-76).
 *
 * Usado pelo backend e pelo simulador. Não é importado pelo frontend.
 */
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import celula from './v1/celula.schema.json' with { type: 'json' };
import comum from './v1/comum.schema.json' with { type: 'json' };
import energia from './v1/energia.schema.json' with { type: 'json' };
import estado from './v1/estado.schema.json' with { type: 'json' };
import fimCorrida from './v1/fim_corrida.schema.json' with { type: 'json' };
import hello from './v1/hello.schema.json' with { type: 'json' };
import inicioCorrida from './v1/inicio_corrida.schema.json' with { type: 'json' };
import painelEntrada from './v1/painel-entrada.schema.json' with { type: 'json' };
import posicao from './v1/posicao.schema.json' with { type: 'json' };
import {
  VERSOES_SUPORTADAS,
  type Hello,
  type MensagemCorrida,
  type MensagemPainelEntrada,
  type TipoMensagemRobo,
} from './tipos.js';

/** Motivo da rejeição, gravado em `mensagem_rejeitada.motivo_codigo`. */
export type CodigoRejeicao =
  'JSON_INVALIDO' | 'TIPO_DESCONHECIDO' | 'VERSAO_NAO_SUPORTADA' | 'ESQUEMA_INVALIDO';

export type Resultado<T> =
  { ok: true; mensagem: T } | { ok: false; codigo: CodigoRejeicao; detalhe: string };

export interface ValidadorProtocolo {
  /** Valida a primeira mensagem da conexão do robô. */
  hello(bruto: unknown): Resultado<Hello>;
  /** Valida uma mensagem de corrida do robô (qualquer tipo exceto `hello`). */
  corrida(bruto: unknown): Resultado<MensagemCorrida>;
  /** Valida uma mensagem do painel (`inscrever` / `cancelar`). */
  painel(bruto: unknown): Resultado<MensagemPainelEntrada>;
}

/**
 * Converte o texto recebido do WebSocket em objeto. A mensagem só é validada depois,
 * para que um texto inválido também possa ser registrado como rejeição.
 */
export function interpretarJson(texto: string): Resultado<unknown> {
  try {
    return { ok: true, mensagem: JSON.parse(texto) as unknown };
  } catch (erro) {
    return { ok: false, codigo: 'JSON_INVALIDO', detalhe: (erro as Error).message };
  }
}

export function criarValidadorProtocolo(): ValidadorProtocolo {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addSchema(comum);

  const validadorHello = ajv.compile<Hello>(hello);
  const validadorPainel = ajv.compile<MensagemPainelEntrada>(painelEntrada);
  const porTipo: Record<TipoMensagemRobo, ValidateFunction<MensagemCorrida>> = {
    inicio_corrida: ajv.compile(inicioCorrida),
    celula: ajv.compile(celula),
    posicao: ajv.compile(posicao),
    energia: ajv.compile(energia),
    estado: ajv.compile(estado),
    fim_corrida: ajv.compile(fimCorrida),
  };

  function aplicar<T>(validar: ValidateFunction<T>, bruto: unknown): Resultado<T> {
    const versao = (bruto as { versao?: unknown } | null)?.versao;
    if (typeof versao === 'number' && !VERSOES_SUPORTADAS.includes(versao)) {
      return { ok: false, codigo: 'VERSAO_NAO_SUPORTADA', detalhe: `versão ${versao}` };
    }
    if (validar(bruto)) return { ok: true, mensagem: bruto };
    return { ok: false, codigo: 'ESQUEMA_INVALIDO', detalhe: descreverErros(validar.errors) };
  }

  return {
    hello: (bruto) => aplicar(validadorHello, bruto),
    painel: (bruto) => aplicar(validadorPainel, bruto),
    corrida(bruto) {
      const tipo = (bruto as { tipo?: unknown } | null)?.tipo;
      const validar =
        typeof tipo === 'string' && Object.hasOwn(porTipo, tipo)
          ? porTipo[tipo as TipoMensagemRobo]
          : undefined;
      if (!validar) {
        return { ok: false, codigo: 'TIPO_DESCONHECIDO', detalhe: `tipo ${JSON.stringify(tipo)}` };
      }
      return aplicar(validar, bruto);
    },
  };
}

function descreverErros(erros: ErrorObject[] | null | undefined): string {
  return (erros ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'inválido'}`).join('; ');
}
