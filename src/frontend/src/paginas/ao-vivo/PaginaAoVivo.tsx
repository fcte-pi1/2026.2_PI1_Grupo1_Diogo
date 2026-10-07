import { useSaudeBackend } from '../../view-model';

/**
 * Acompanhamento ao vivo (HU-FE-01 a HU-FE-08).
 * Esqueleto: mostra a saúde do backend e do banco para validar o ambiente.
 */
export function PaginaAoVivo() {
  const saude = useSaudeBackend();
  return (
    <section>
      <h2>Ao vivo</h2>
      <p>Aguardando uma corrida…</p>
      <dl>
        <dt>Backend</dt>
        <dd data-testid="saude-backend">{saude.backend}</dd>
        <dt>Banco de dados</dt>
        <dd data-testid="saude-banco">{saude.banco}</dd>
      </dl>
    </section>
  );
}
