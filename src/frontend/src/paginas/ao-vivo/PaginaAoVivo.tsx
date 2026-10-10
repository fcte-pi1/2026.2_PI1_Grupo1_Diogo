import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  formatarNumero,
  formatarTempo,
  rotuloStatus,
  useCronometroTentativa,
  useExecucaoAoVivo,
  useSaudeBackend,
  useTelemetria,
} from '../../view-model';
import estilos from './PaginaAoVivo.module.css';

type ModoVisualizacao = 'ao-vivo' | 'depuracao';
type Execucao = ReturnType<typeof useExecucaoAoVivo>;

function StatusBadge({ status }: { status: Execucao['status'] }) {
  const classe =
    status === 'CONCLUIDA'
      ? estilos.statusOk
      : status === 'FALHOU'
        ? estilos.statusErro
        : status === 'INTERROMPIDA'
          ? estilos.statusAlerta
          : estilos.statusAndamento;
  return <span className={`${estilos.status} ${classe}`}>{rotuloStatus(status)}</span>;
}

function MazeView({ trajeto }: { trajeto: Execucao['trajeto'] }) {
  const cellSize = 82;
  const size = cellSize * 4;
  const pontos = trajeto.map(({ x, y }) => ({
    x: Math.max(0, Math.min(3, x)) * cellSize + cellSize / 2,
    y: (3 - Math.max(0, Math.min(3, y))) * cellSize + cellSize / 2,
  }));
  const path = pontos.map(({ x, y }, indice) => `${indice === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const atual = pontos.at(-1);

  return (
    <div className={estilos.labirintoArea}>
      <svg
        className={estilos.labirinto}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Mapa do labirinto"
      >
        {Array.from({ length: 16 }, (_, indice) => {
          const linha = Math.floor(indice / 4);
          const coluna = indice % 4;
          return (
            <rect
              key={`celula-${indice}`}
              x={coluna * cellSize}
              y={linha * cellSize}
              width={cellSize}
              height={cellSize}
              className={indice === 15 ? estilos.celulaInicio : estilos.celula}
            />
          );
        })}
        {Array.from({ length: 5 }, (_, indice) => (
          <g key={`grade-${indice}`}>
            <line
              x1={indice * cellSize}
              y1="0"
              x2={indice * cellSize}
              y2={size}
              className={estilos.linhaLabirinto}
            />
            <line
              x1="0"
              y1={indice * cellSize}
              x2={size}
              y2={indice * cellSize}
              className={estilos.linhaLabirinto}
            />
          </g>
        ))}
        <rect
          x={3 * cellSize + 4}
          y="4"
          width={cellSize - 8}
          height={cellSize - 8}
          className={estilos.objetivo}
        />
        <text x={3 * cellSize + 8} y="18" className={estilos.rotuloMapa}>
          OBJETIVO
        </text>
        <rect
          x="4"
          y={3 * cellSize + 4}
          width={cellSize - 8}
          height={cellSize - 8}
          className={estilos.inicio}
        />
        <text x="8" y={3 * cellSize + 18} className={estilos.rotuloMapaInicio}>
          INÍCIO
        </text>
        {path && <path d={path} className={estilos.trajetoria} />}
        {atual && <circle cx={atual.x} cy={atual.y} r="12" className={estilos.robo} />}
      </svg>
      <div className={estilos.legenda}>
        <span>
          <i className={estilos.legendaLinha} /> Trajetória
        </span>
        <span>
          <i className={estilos.legendaVisitada}>3</i> Visitada
        </span>
        <span>
          <i className={estilos.legendaParede} /> Parede presente
        </span>
        <span>
          <i className={estilos.legendaDesconhecida} /> Desconhecida
        </span>
        <span>
          <i className={estilos.legendaInicio} /> Início
        </span>
        <span>
          <i className={estilos.legendaObjetivo} /> Objetivo
        </span>
        <span>
          <i className={estilos.legendaRobo}>●</i> Robô
        </span>
      </div>
    </div>
  );
}

function HistoricoVazio() {
  return <div className={estilos.historicoVazio}>Nenhuma execução armazenada disponível.</div>;
}

function GraficoEnergia({ amostras }: { amostras: Execucao['energia'] }) {
  const largura = 240;
  const altura = 82;
  const margem = 16;

  function pontos(chave: 'tensaoV' | 'correnteA' | 'potenciaW') {
    if (amostras.length < 2) return '';
    const valores = amostras.map((amostra) => amostra[chave]);
    let minimo = valores[0]!;
    let maximo = valores[0]!;
    valores.forEach((valor) => {
      minimo = Math.min(minimo, valor);
      maximo = Math.max(maximo, valor);
    });
    const intervalo = maximo - minimo || 1;
    return valores
      .map((valor, indice) => {
        const x = margem + (indice / (valores.length - 1)) * (largura - margem * 2);
        const y = altura - margem - ((valor - minimo) / intervalo) * (altura - margem * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  return (
    <div className={estilos.graficoEnergia} aria-label="Gráfico de consumo">
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        role="img"
        aria-label="Tensão, corrente e potência ao longo da tentativa"
      >
        {Array.from({ length: 4 }, (_, indice) => {
          const y = margem + indice * ((altura - margem * 2) / 3);
          return (
            <line
              key={`horizontal-${indice}`}
              x1={margem}
              y1={y}
              x2={largura - margem}
              y2={y}
              className={estilos.linhaGrafico}
            />
          );
        })}
        <line
          x1={margem}
          y1={margem}
          x2={margem}
          y2={altura - margem}
          className={estilos.eixoGrafico}
        />
        <line
          x1={margem}
          y1={altura - margem}
          x2={largura - margem}
          y2={altura - margem}
          className={estilos.eixoGrafico}
        />
        <polyline points={pontos('tensaoV')} className={estilos.linhaTensao} />
        <polyline points={pontos('correnteA')} className={estilos.linhaCorrente} />
        <polyline points={pontos('potenciaW')} className={estilos.linhaPotencia} />
        {amostras.length === 0 && (
          <text x={largura / 2} y={altura / 2} textAnchor="middle" className={estilos.semAmostras}>
            Aguardando amostras
          </text>
        )}
      </svg>
      <div className={estilos.graficoLegenda}>
        <span className={estilos.valorCorrente}>━ I (A)</span>
        <span className={estilos.valorPotencia}>━ P (W)</span>
        <span className={estilos.valorTensao}>━ V (V)</span>
      </div>
    </div>
  );
}

export function PaginaAoVivo() {
  const navegar = useNavigate();
  const [modo, definirModo] = useState<ModoVisualizacao>('ao-vivo');
  const saude = useSaudeBackend();
  const execucao = useExecucaoAoVivo();
  const tempoExibido = useCronometroTentativa();
  const telemetria = useTelemetria();
  const status = rotuloStatus(execucao.status);
  const tensao = formatarNumero(execucao.tensaoV, 'V');
  const corrente = formatarNumero(execucao.correnteA, 'A');
  const potencia = formatarNumero(execucao.potenciaW, 'W');

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
      <main className={estilos.conteudoPainel}>
        <div className={estilos.colunaPrincipal}>
          <article className={estilos.painel}>
            <div className={estilos.cabecalhoPainel}>
              <span>LABIRINTO</span>
              <strong>{execucao.tipoLabirinto ?? '—'}</strong>
            </div>
            <MazeView trajeto={execucao.trajeto} />
          </article>
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
        </div>
        <aside className={estilos.painelLateral}>
          <article className={estilos.painelPequeno}>
            <span className={estilos.rotuloSecao}>TENTATIVA ATUAL</span>
            <div className={estilos.duasColunas}>
              <div>
                <small>Labirinto</small>
                <strong>{execucao.tipoLabirinto ?? '—'}</strong>
              </div>
              <div>
                <small>Status</small>
                <StatusBadge status={execucao.status} />
              </div>
            </div>
          </article>
          <article className={`${estilos.painelPequeno} ${estilos.painelCronometro}`}>
            <span className={estilos.rotuloSecao}>CRONÔMETRO</span>
            <strong className={estilos.cronometro} data-testid="tempo">
              {formatarTempo(tempoExibido)}
            </strong>
            <small>mm:ss.d — tentativa em tempo real</small>
          </article>
          <article className={estilos.painelPequeno}>
            <span className={estilos.rotuloSecao}>NAVEGAÇÃO</span>
            <div className={estilos.metricas}>
              <div>
                <small>Velocidade média</small>
                <strong>{formatarNumero(execucao.velocidadeMediaMps, 'm/s')}</strong>
              </div>
              <div>
                <small>Células percorridas</small>
                <strong>{execucao.trajeto.length || '—'}</strong>
              </div>
              <div>
                <small>Distância total</small>
                <strong>—</strong>
              </div>
              <div>
                <small>Acelerações</small>
                <strong>—</strong>
              </div>
            </div>
          </article>
          <article className={estilos.painelPequeno}>
            <span className={estilos.rotuloSecao}>ELÉTRICO</span>
            <div className={estilos.eletrico}>
              <div>
                <small>Tensão</small>
                <strong className={estilos.valorTensao}>{tensao}</strong>
              </div>
              <div>
                <small>Corrente</small>
                <strong className={estilos.valorCorrente}>{corrente}</strong>
              </div>
              <div>
                <small>Potência</small>
                <strong className={estilos.valorPotencia}>{potencia}</strong>
              </div>
            </div>
            <div className={estilos.bateria}>
              <span className={estilos.iconeBateria} aria-hidden="true" />
              <div className={estilos.bateriaCorpo}>
                <div className={estilos.bateriaRotulo}>
                  <span>Carga estimada</span>
                  <strong>{execucao.cargaPct === null ? '—' : `${execucao.cargaPct}%`}</strong>
                </div>
                <div className={estilos.bateriaTrilho}>
                  <span
                    style={{ width: `${Math.max(0, Math.min(100, execucao.cargaPct ?? 0))}%` }}
                  />
                </div>
              </div>
            </div>
            <GraficoEnergia amostras={execucao.energia} />
          </article>
          <article className={estilos.painelPequeno}>
            <span className={estilos.rotuloSecao}>ALERTAS</span>
            <div className={estilos.alerta}>
              <strong>{saude.backend === 'ok' ? 'Conexão estável' : 'Backend indisponível'}</strong>
              <small>
                {telemetria.ultimaMensagemEm === null
                  ? 'Aguardando telemetria'
                  : 'Atualização recebida'}
              </small>
            </div>
            <div className={estilos.alertaOk}>
              <strong>Banco de dados</strong>
              <small>{saude.banco}</small>
            </div>
          </article>
        </aside>
      </main>
    </section>
  );
}
