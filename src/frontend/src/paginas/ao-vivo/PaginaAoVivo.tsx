import { formatarNumero, formatarTempo, rotuloStatus, useExecucaoAoVivo, useSaudeBackend } from '../../view-model';
import estilos from './PaginaAoVivo.module.css';

/**
 * Acompanhamento ao vivo (HU-FE-01 a HU-FE-08).
 * Esqueleto: mostra a saúde do backend e do banco para validar o ambiente.
 */
export function PaginaAoVivo() {
  const saude = useSaudeBackend();
  const execucao = useExecucaoAoVivo();
  const trajeto = execucao.trajeto.length > 0
    ? execucao.trajeto.map(({ x, y }) => `(${x}, ${y})`).join(' → ')
    : '—';

  return (
    <section className={estilos.pagina} aria-labelledby="titulo-ao-vivo">
      <h2 id="titulo-ao-vivo">Acompanhamento ao vivo</h2>
      <div className={estilos.grade}>
        <article className={estilos.cartao}>
          <span>Labirinto</span>
          <strong data-testid="tipo-labirinto">{execucao.tipoLabirinto ?? '—'}</strong>
        </article>
        <article className={estilos.cartao}>
          <span>Trajeto</span>
          <strong data-testid="trajeto">{trajeto}</strong>
        </article>
        <article className={estilos.cartao}>
          <span>Velocidade média</span>
          <strong data-testid="velocidade-media">{formatarNumero(execucao.velocidadeMediaMps, 'm/s')}</strong>
        </article>
        <article className={estilos.cartao}>
          <span>Tempo</span>
          <strong data-testid="tempo">{formatarTempo(execucao.tempoMs)}</strong>
        </article>
        <article className={estilos.cartao}>
          <span>Status do desafio</span>
          <strong data-testid="status-desafio">{rotuloStatus(execucao.status)}</strong>
        </article>
        <article className={estilos.cartao}>
          <span>Tensão</span>
          <strong data-testid="tensao">{formatarNumero(execucao.tensaoV, 'V')}</strong>
        </article>
        <article className={estilos.cartao}>
          <span>Corrente</span>
          <strong data-testid="corrente">{formatarNumero(execucao.correnteA, 'A')}</strong>
        </article>
        <article className={estilos.cartao}>
          <span>Potência</span>
          <strong data-testid="potencia">{formatarNumero(execucao.potenciaW, 'W')}</strong>
        </article>
      </div>
      <dl>
        <dt>Backend</dt>
        <dd data-testid="saude-backend">{saude.backend}</dd>
        <dt>Banco de dados</dt>
        <dd data-testid="saude-banco">{saude.banco}</dd>
      </dl>
    </section>
  );
}
