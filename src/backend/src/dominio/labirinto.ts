/** Tipos de labirinto aceitos (arquitetura do backend, §7.2 — enum tipo_labirinto). */
export const TIPOS_LABIRINTO = ['4x4', '8x4', '12x4'] as const;

export type TipoLabirinto = (typeof TIPOS_LABIRINTO)[number];

export function ehTipoLabirinto(valor: unknown): valor is TipoLabirinto {
  return typeof valor === 'string' && (TIPOS_LABIRINTO as readonly string[]).includes(valor);
}
