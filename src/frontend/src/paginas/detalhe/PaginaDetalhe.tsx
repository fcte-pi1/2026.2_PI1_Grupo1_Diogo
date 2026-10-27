import { Link, useParams } from 'react-router';
import { AvisosExecucao, ControleExportacao, ItemAlerta, PainelExecucao } from '../../componentes';
import { useDetalheExecucao } from '../../view-model';
import estilos from './PaginaDetalhe.module.css';

/**
 * Detalhe de uma execução passada, na mesma visualização do ao vivo (HU-FE-11).
 * Lê só a fatia `detalhe` da store: mensagens do WebSocket não alteram a execução exibida.
 */
export function PaginaDetalhe() {
  const { id } = useParams();
  const d = useDetalheExecucao(id);

  return (
    <section className={estilos.pagina} aria-labelledby="titulo-detalhe">
      <div className={estilos.tituloLinha}>
        <h2 id="titulo-detalhe">Execução passada</h2>
        <Link to="/historico" className={estilos.voltar}>
          ← Voltar ao histórico
        </Link>
      </div>

      {d.situacao === 'carregando' && (
        <p className={estilos.mensagem} role="status" data-testid="detalhe-carregando">
          <span className={estilos.spinner} aria-hidden="true" />
          Carregando execução…
        </p>
      )}

      {d.situacao === 'erro' && (
        <div className={estilos.erro} role="alert" data-testid="detalhe-erro">
          <p>{d.mensagemErro}</p>
          <div className={estilos.acoes}>
            {d.podeTentarNovamente && (
              <button type="button" onClick={d.tentarNovamente}>
                Tentar novamente
              </button>
            )}
            <Link to="/historico">Voltar ao histórico</Link>
          </div>
        </div>
      )}

      {d.situacao === 'pronto' && (
        <>
          <div className={estilos.aviso} role="status" data-testid="aviso-historico">
            <strong>Modo histórico</strong>
            <span>
              Execução gravada{d.iniciadaEm ? ` em ${d.iniciadaEm}` : ''}. Mensagens ao vivo não
              alteram estes dados.
            </span>
          </div>
          <ControleExportacao dados={d.execucao} iniciadaEm={d.iniciadaEmIso} />
          <AvisosExecucao status={d.execucao.status} falha={d.falha} />
          <PainelExecucao
            modo="historico"
            execucao={d.execucao}
            tempoMs={d.execucao.tempoMs}
            alertas={
              d.falha ? (
                <ItemAlerta tom="aviso" titulo={d.falha.titulo} descricao={d.falha.motivo} />
              ) : (
                <ItemAlerta tom="ok" titulo="Sem falhas registradas" descricao="Execução gravada" />
              )
            }
          />
        </>
      )}
    </section>
  );
}
