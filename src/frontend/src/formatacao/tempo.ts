/** Tempo de corrida em `mm:ss,d` (décimo de segundo); `null` vira "—". */
export function formatarTempoCorrida(tempoMs: number | null): string {
  if (tempoMs === null || !Number.isFinite(tempoMs) || tempoMs < 0) return '—';
  const decimos = Math.round(tempoMs / 100);
  const minutos = Math.floor(decimos / 600);
  const segundos = Math.floor((decimos % 600) / 10);
  const decimo = decimos % 10;
  return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')},${decimo}`;
}

/** Data e hora locais em `dd/mm/aaaa hh:mm:ss`; valor ausente ou inválido vira "—". */
export function formatarDataHora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  const dois = (n: number) => String(n).padStart(2, '0');
  const dia = `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()}`;
  const hora = `${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}`;
  return `${dia} ${hora}`;
}
