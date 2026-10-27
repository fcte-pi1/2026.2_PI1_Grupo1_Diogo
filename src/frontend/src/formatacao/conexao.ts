import type { EstadoConexao, SinalRobo } from '../dominio';

/** Rótulo do IndicadorConexao (tabela da arquitetura do frontend, §3.4). */
export function rotuloConexao(conexao: EstadoConexao, sinal: SinalRobo): string {
  switch (conexao) {
    case 'CONECTANDO':
      return 'Conectando…';
    case 'RECONECTANDO':
      return 'Reconectando';
    case 'DESCONECTADO':
      return 'Desconectado';
    case 'CONECTADO':
      return sinal === 'PERDIDO' ? 'Sem sinal do robô' : 'Conectado';
  }
}
