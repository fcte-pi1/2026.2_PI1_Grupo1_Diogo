import { execucaoInicial } from '../../src/dominio';
import { usePainel } from '../../src/estado';

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
  });
}
