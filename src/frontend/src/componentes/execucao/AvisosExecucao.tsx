import type { StatusCorrida } from '../../dominio';
import type { FalhaExecucao } from '../../view-model';
import estilos from './AvisosExecucao.module.css';

interface Props {
  status: StatusCorrida | null;
  /** Falha ou interrupção, com o motivo recebido (HU-FE-13 CA2). */
  falha: FalhaExecucao | null;
  /** O robô perdeu a comunicação com o backend (HU-FE-13 CA1). */
  semSinal?: boolean;
  /** A comunicação voltou; não significa que a execução terminou (HU-FE-13 CA3). */
  sinalRetomado?: boolean;
}

/**
 * Avisos acima do painel. Cada situação tem texto, cor e `data-testid` próprios: falha,
 * sem sinal, comunicação retomada e desafio cumprido nunca se confundem.
 */
export function AvisosExecucao({ status, falha, semSinal = false, sinalRetomado = false }: Props) {
  return (
    <>
      {falha && (
        <div className={estilos.falha} role="alert" data-testid="alerta-falha">
          <strong>✖ {falha.titulo}</strong>
          <span data-testid="alerta-falha-motivo">Motivo: {falha.motivo}</span>
          {falha.detalhe && <span data-testid="alerta-falha-detalhe">{falha.detalhe}</span>}
        </div>
      )}
      {semSinal && (
        <div className={estilos.semSinal} role="alert" data-testid="alerta-sem-sinal">
          <strong>⚠ Sem sinal do robô</strong>
          <span>A execução está sem comunicação. Aguardando o robô voltar a responder.</span>
        </div>
      )}
      {sinalRetomado && (
        <div className={estilos.retomado} role="status" data-testid="sinal-retomado">
          <strong>↻ Comunicação retomada</strong>
          <span>O robô voltou a se comunicar. Isto não indica que a execução terminou.</span>
        </div>
      )}
      {status === 'CONCLUIDA' && (
        <div className={estilos.desafioCumprido} role="status" data-testid="desafio-cumprido">
          ✔ Desafio cumprido
        </div>
      )}
    </>
  );
}
