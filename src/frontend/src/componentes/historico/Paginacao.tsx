import estilos from './Paginacao.module.css';

interface Props {
  pagina: number;
  totalPaginas: number;
  /** Desabilita os botões enquanto uma página é carregada. */
  desabilitada?: boolean;
  aoMudar: (pagina: number) => void;
}

/** Navegação entre páginas da listagem. Não renderiza nada com uma página ou menos. */
export function Paginacao({ pagina, totalPaginas, desabilitada = false, aoMudar }: Props) {
  if (totalPaginas <= 1) return null;

  return (
    <nav className={estilos.paginacao} aria-label="Paginação do histórico">
      <button
        type="button"
        disabled={desabilitada || pagina <= 1}
        onClick={() => aoMudar(pagina - 1)}
      >
        Anterior
      </button>
      <span className={estilos.posicao} aria-current="page">
        Página {pagina} de {totalPaginas}
      </span>
      <button
        type="button"
        disabled={desabilitada || pagina >= totalPaginas}
        onClick={() => aoMudar(pagina + 1)}
      >
        Próxima
      </button>
    </nav>
  );
}
