import { execucaoInicial } from '../../src/dominio';
import { detalheInicial, usePainel } from '../../src/estado';

/** Volta a store ao estado de uma aba recém-aberta (os testes compartilham o singleton). */
export function reiniciarStore(): void {
  usePainel.setState({
    aoVivo: execucaoInicial,
    telemetria: { mensagensRecebidas: 0, ultimaMensagemEm: null },
    conexao: {
      estado: 'CONECTANDO',
      sinal: 'DESCONHECIDO',
      saude: { backend: 'desconhecido', banco: 'desconhecido' },
    },
    detalhe: detalheInicial,
    alertas: { retomadaEm: null },
    depuracao: null,
  });
}
