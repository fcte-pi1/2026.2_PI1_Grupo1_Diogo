import type { CelulaMapa, DirecaoParede, TipoLabirinto } from './execucao';

export const TIPOS_LABIRINTO: readonly TipoLabirinto[] = ['4x4', '8x4', '12x4'];

export function ehTipoLabirinto(valor: unknown): valor is TipoLabirinto {
  return typeof valor === 'string' && (TIPOS_LABIRINTO as readonly string[]).includes(valor);
}

/** Tipo `CxL`: C colunas × L linhas (protocolo v1, "Coordenadas"). */
export function dimensoesLabirinto(tipo: TipoLabirinto): { colunas: number; linhas: number } {
  const [colunas, linhas] = tipo.split('x').map(Number);
  return { colunas: colunas!, linhas: linhas! };
}

export type EstadoParede = 'PRESENTE' | 'AUSENTE' | 'DESCONHECIDA';

const VIZINHO: Record<DirecaoParede, { dx: number; dy: number; oposta: DirecaoParede }> = {
  norte: { dx: 0, dy: -1, oposta: 'sul' },
  sul: { dx: 0, dy: 1, oposta: 'norte' },
  leste: { dx: 1, dy: 0, oposta: 'oeste' },
  oeste: { dx: -1, dy: 0, oposta: 'leste' },
};

/**
 * Estado de uma aresta, na convenção do protocolo: x = coluna (cresce para Leste),
 * y = linha (cresce para Sul, y = 0 é a borda Norte).
 * Ordem de decisão: a própria célula, a aresta compartilhada com a vizinha, o perímetro
 * (sempre presente) e, por fim, desconhecida.
 */
export function estadoParede(
  mapa: readonly CelulaMapa[],
  tipo: TipoLabirinto,
  x: number,
  y: number,
  direcao: DirecaoParede,
): EstadoParede {
  const propria = mapa.find((c) => c.x === x && c.y === y);
  if (propria) return propria.paredes[direcao] ? 'PRESENTE' : 'AUSENTE';

  const { dx, dy, oposta } = VIZINHO[direcao];
  const vx = x + dx;
  const vy = y + dy;
  const { colunas, linhas } = dimensoesLabirinto(tipo);
  if (vx < 0 || vy < 0 || vx >= colunas || vy >= linhas) return 'PRESENTE';

  const vizinha = mapa.find((c) => c.x === vx && c.y === vy);
  if (vizinha) return vizinha.paredes[oposta] ? 'PRESENTE' : 'AUSENTE';
  return 'DESCONHECIDA';
}
