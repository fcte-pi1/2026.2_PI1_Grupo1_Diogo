import { useParams } from 'react-router';

/** Detalhe de uma execução passada, na mesma visualização do ao vivo (HU-FE-11). */
export function PaginaDetalhe() {
  const { id } = useParams();
  return (
    <section>
      <h2>Execução {id}</h2>
    </section>
  );
}
