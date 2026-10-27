import { FiltroLabirinto, Paginacao, TabelaHistorico } from '../../componentes';
import { useHistorico } from '../../view-model';
import estilos from './PaginaHistorico.module.css';

/** Histórico de execuções com filtro por labirinto (HU-FE-09, HU-FE-10). */
export function PaginaHistorico() {
  const h = useHistorico();

  return (
    <section className={estilos.cartao} aria-labelledby="titulo-historico">
      <div className={estilos.cabecalho}>
        <h2 id="titulo-historico" className={estilos.titulo}>
          Histórico de tentativas
        </h2>
        <FiltroLabirinto
          opcoes={h.opcoesFiltro}
          selecionado={h.filtro}
          aoSelecionar={h.mudarFiltro}
        />
      </div>

      {h.situacao === 'carregando' && (
        <p className={estilos.mensagem} role="status">
          <span className={estilos.spinner} aria-hidden="true" />
          Carregando histórico…
        </p>
      )}

      {h.situacao === 'erro' && (
        <div className={estilos.erro} role="alert">
          <p>{h.mensagemErro}</p>
          <button type="button" onClick={h.tentarNovamente}>
            Tentar novamente
          </button>
        </div>
      )}

      {h.situacao === 'vazio' && (
        <p className={estilos.mensagem} role="status">
          {h.mensagemVazio}
        </p>
      )}

      {h.situacao === 'pronto' && <TabelaHistorico linhas={h.linhas} />}

      <Paginacao
        pagina={h.pagina}
        totalPaginas={h.totalPaginas}
        desabilitada={h.situacao === 'carregando'}
        aoMudar={h.irParaPagina}
      />
    </section>
  );
}
