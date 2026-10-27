import type { ReactNode } from 'react';
import type { DadosExecucao } from '../../dominio';
import { formatarNumero, formatarTempo, rotuloDesafio, rotuloStatus } from '../../formatacao';
import { GraficoConsumo } from '../consumo/GraficoConsumo';
import { MapaLabirinto } from './MapaLabirinto';
import estilos from './PainelExecucao.module.css';

/** `ao-vivo` recebe mensagens do robô; `historico` mostra uma execução já gravada (HU-FE-11 CA2). */
export type ModoPainel = 'ao-vivo' | 'historico';

interface Props {
  modo: ModoPainel;
  execucao: DadosExecucao;
  /** Tempo a exibir no cronômetro: contínuo no ao vivo, o tempo gravado no histórico. */
  tempoMs: number | null;
  /** Abaixo do mapa (ex.: tabela do histórico na tela ao vivo). */
  children?: ReactNode;
  /** Conteúdo do cartão ALERTAS, específico de cada modo. */
  alertas: ReactNode;
}

function StatusBadge({ status }: { status: DadosExecucao['status'] }) {
  const classe =
    status === 'CONCLUIDA'
      ? estilos.statusOk
      : status === 'FALHOU'
        ? estilos.statusErro
        : status === 'INTERROMPIDA'
          ? estilos.statusAlerta
          : estilos.statusAndamento;
  return (
    <span className={`${estilos.status} ${classe}`} data-testid="status-desafio">
      {rotuloStatus(status)}
    </span>
  );
}

/** Linha do cartão ALERTAS; o chamador escolhe o tom (`aviso` âmbar, `ok` verde). */
export function ItemAlerta({
  tom,
  titulo,
  descricao,
}: {
  tom: 'aviso' | 'ok';
  titulo: string;
  descricao: string;
}) {
  return (
    <div className={tom === 'ok' ? estilos.alertaOk : estilos.alerta}>
      <strong>{titulo}</strong>
      <small>{descricao}</small>
    </div>
  );
}

/**
 * Visualização da execução — mapa, trajeto, métricas, consumo e resultado. É a mesma para o
 * acompanhamento ao vivo e para o detalhe de uma execução do histórico; só o `modo` muda.
 */
export function PainelExecucao({ modo, execucao, tempoMs, children, alertas }: Props) {
  const historico = modo === 'historico';
  const tensao = formatarNumero(execucao.tensaoV, 'V');
  const corrente = formatarNumero(execucao.correnteA, 'A');
  const potencia = formatarNumero(execucao.potenciaW, 'W');

  return (
    <div className={estilos.conteudoPainel} data-modo={modo} data-testid="painel-execucao">
      <div className={estilos.colunaPrincipal}>
        <article className={estilos.painel}>
          <div className={estilos.cabecalhoPainel}>
            <span>LABIRINTO</span>
            <strong>{execucao.tipoLabirinto ?? '—'}</strong>
            <span className={estilos.etiquetaModo} data-modo={modo} data-testid="etiqueta-modo">
              {historico ? 'MODO HISTÓRICO' : 'AO VIVO'}
            </span>
          </div>
          <MapaLabirinto
            trajeto={execucao.trajeto}
            mapa={execucao.mapa}
            posicao={execucao.posicao}
            tipo={execucao.tipoLabirinto}
            tipoInvalido={execucao.tipoInvalido}
          />
        </article>
        {children}
      </div>
      <aside className={estilos.painelLateral}>
        <article className={estilos.painelPequeno}>
          <span className={estilos.rotuloSecao}>{historico ? 'EXECUÇÃO' : 'TENTATIVA ATUAL'}</span>
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
        <article className={estilos.painelPequeno}>
          <span className={estilos.rotuloSecao}>DESAFIO</span>
          <strong data-testid="desafio">{rotuloDesafio(execucao.status)}</strong>
        </article>
        <article className={`${estilos.painelPequeno} ${estilos.painelCronometro}`}>
          <span className={estilos.rotuloSecao}>{historico ? 'TEMPO' : 'CRONÔMETRO'}</span>
          <strong className={estilos.cronometro} data-testid="tempo">
            {formatarTempo(tempoMs)}
          </strong>
          <small>
            {historico ? 'mm:ss.d — tempo registrado' : 'mm:ss.d — tentativa em tempo real'}
          </small>
        </article>
        <article className={estilos.painelPequeno}>
          <span className={estilos.rotuloSecao}>NAVEGAÇÃO</span>
          <div className={estilos.metricas}>
            <div>
              <small>Velocidade média</small>
              <strong data-testid="velocidade-media">
                {formatarNumero(execucao.velocidadeMediaMps, 'm/s')}
              </strong>
            </div>
            <div>
              <small>Células percorridas</small>
              <strong data-testid="celulas-percorridas">
                {execucao.celulasPercorridas ?? '—'}
              </strong>
            </div>
            <div>
              <small>Distância total</small>
              <strong data-testid="distancia-total">
                {formatarNumero(execucao.distanciaM, 'm')}
              </strong>
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
                <strong data-testid="carga-estimada">
                  {execucao.cargaPct === null ? '—' : `${execucao.cargaPct}%`}
                </strong>
              </div>
              <div className={estilos.bateriaTrilho}>
                <span style={{ width: `${Math.max(0, Math.min(100, execucao.cargaPct ?? 0))}%` }} />
              </div>
            </div>
          </div>
          <div className={estilos.variacaoTensao}>
            <small>Variação de tensão</small>
            <strong data-testid="variacao-tensao">{formatarNumero(execucao.deltaV, 'V')}</strong>
          </div>
          <GraficoConsumo amostras={execucao.energia} />
        </article>
        <article className={estilos.painelPequeno}>
          <span className={estilos.rotuloSecao}>ALERTAS</span>
          {alertas}
        </article>
      </aside>
    </div>
  );
}
