/** Distância de um sensor ToF; `null` (ausente ou inválida) vira "—", nunca "0 mm". */
export function formatarDistanciaMm(valor: number | null): string {
  return valor === null ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm`;
}

export function formatarAngulo(valor: number | null): string {
  return valor === null ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}°`;
}

export function formatarContagem(valor: number | null): string {
  return valor === null ? '—' : valor.toLocaleString('pt-BR');
}
