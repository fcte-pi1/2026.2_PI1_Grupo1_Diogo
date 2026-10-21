/** Tipos de labirinto aceitos (arquitetura do backend, §7.2 — enum tipo_labirinto). */
export const TIPOS_LABIRINTO = ['4x4', '8x4', '12x4'] as const;

export type TipoLabirinto = (typeof TIPOS_LABIRINTO)[number];

export function ehTipoLabirinto(valor: unknown): valor is TipoLabirinto {
  return typeof valor === 'string' && (TIPOS_LABIRINTO as readonly string[]).includes(valor);
}

export interface DimensoesLabirinto {
  colunas: number;
  linhas: number;
}

/** A largura é sempre de 4 células; o comprimento depende do tipo. */
export const LINHAS_LABIRINTO = 4;

/** `CxL`: C colunas (eixo x) por L linhas (eixo y). */
export function dimensoesLabirinto(tipo: TipoLabirinto): DimensoesLabirinto {
  const colunas = { '4x4': 4, '8x4': 8, '12x4': 12 }[tipo];
  return { colunas, linhas: LINHAS_LABIRINTO };
}

/**
 * Verifica se a célula existe no labirinto. Com o tipo ainda desconhecido (corrida criada
 * por uma mensagem que chegou antes do `inicio_corrida`), só a linha pode ser conferida.
 */
export function celulaDentroDoLabirinto(tipo: TipoLabirinto | null, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return false;
  if (y >= LINHAS_LABIRINTO) return false;
  return tipo === null || x < dimensoesLabirinto(tipo).colunas;
}
