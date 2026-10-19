import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AvisosExecucao, ItemAlerta, PainelExecucao } from '../../componentes';
import { rotuloStatus } from '../../formatacao';
import {
  useAlertasAoVivo,
  useCronometroTentativa,
  useExecucaoAoVivo,
  useSaudeBackend,
  useTelemetria,
} from '../../view-model';
import estilos from './PaginaAoVivo.module.css';

type ModoVisualizacao = 'ao-vivo' | 'depuracao';

function HistoricoVazio() {
  return <div className={estilos.historicoVazio}>Nenhuma execução armazenada disponível.</div>;
}

export function PaginaAoVivo() {
  const navegar = useNavigate();
  const [modo, definirModo] = useState<ModoVisualizacao>('ao-vivo');
  const saude = useSaudeBackend();
  const execucao = useExecucaoAoVivo();
  const tempoExibido = useCronometroTentativa();
  const telemetria = useTelemetria();
  const avisos = useAlertasAoVivo();
  const status = rotuloStatus(execucao.status);

  return (
    <section className={estilos.pagina} aria-labelledby="titulo-ao-vivo">
      <div className={estilos.tituloLinha}>
        <h2 id="titulo-ao-vivo">Acompanhamento ao vivo</h2>
        <div className={estilos.modos} role="tablist" aria-label="Modo do painel">
          <button
            className={modo === 'ao-vivo' ? estilos.modoAtivo : estilos.modo}
            onClick={() => definirModo('ao-vivo')}
          >
            Ao vivo
          </button>
          <button className={estilos.modo} onClick={() => navegar('/historico')}>
            Histórico
          </button>
          <button
            className={modo === 'depuracao' ? estilos.modoAtivo : estilos.modo}
            onClick={() => definirModo('depuracao')}
          >
            Depuração
          </button>
        </div>
      </div>
      {modo === 'depuracao' && (
        <pre
          className={estilos.console}
          aria-label="Console de depuração"
        >{`// Micromouse Debug Console\nmensagens=${telemetria.mensagensRecebidas}\nstatus=${status}\nbackend=${saude.backend}`}</pre>
      )}
      <AvisosExecucao
        status={execucao.status}
        falha={avisos.falha}
        semSinal={avisos.semSinal}
        sinalRetomado={avisos.sinalRetomado}
      />
      <PainelExecucao
        modo="ao-vivo"
        execucao={execucao}
        tempoMs={tempoExibido}
        alertas={
          <>
            <ItemAlerta
              tom="aviso"
              titulo={saude.backend === 'ok' ? 'Conexão estável' : 'Backend indisponível'}
              descricao={
                telemetria.ultimaMensagemEm === null
                  ? 'Aguardando telemetria'
                  : 'Atualização recebida'
              }
            />
            <ItemAlerta tom="ok" titulo="Banco de dados" descricao={saude.banco} />
          </>
        }
      >
        <article className={estilos.painelHistorico}>
          <div className={estilos.cabecalhoPainel}>
            <h3>Histórico de Tentativas</h3>
            <div className={estilos.filtros}>
              <button className={estilos.filtroAtivo}>Todos</button>
              <button className={estilos.filtro}>4×4</button>
              <button className={estilos.filtro}>8×4</button>
              <button className={estilos.filtro}>12×4</button>
            </div>
          </div>
          <div className={estilos.tabelaCabecalho}>
            <span>Tentativa</span>
            <span>Data e hora</span>
            <span>Labirinto</span>
            <span>Duração</span>
            <span>Resultado</span>
          </div>
          <HistoricoVazio />
        </article>
      </PainelExecucao>
    </section>
  );
}
