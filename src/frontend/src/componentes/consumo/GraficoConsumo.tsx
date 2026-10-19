import { useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import type { AmostraEnergia } from '../../dominio';
import { formatarNumero } from '../../formatacao';
import estilos from './GraficoConsumo.module.css';

const LARGURA = 320;
const ALTURA = 150;
const MARGEM = { esquerda: 30, direita: 8, topo: 8, base: 20 } as const;
const DIVISOES = 4;

type Serie = 'tensaoV' | 'correnteA' | 'potenciaW';

const SERIES: readonly { chave: Serie; rotulo: string; unidade: string; classe: string }[] = [
  { chave: 'tensaoV', rotulo: 'V', unidade: 'V', classe: 'linhaTensao' },
  { chave: 'correnteA', rotulo: 'I', unidade: 'A', classe: 'linhaCorrente' },
  { chave: 'potenciaW', rotulo: 'P', unidade: 'W', classe: 'linhaPotencia' },
];

interface Props {
  /** Todas as amostras da tentativa, na ordem de chegada: nenhuma é descartada ao desenhar. */
  amostras: readonly AmostraEnergia[];
}

/**
 * Eixo x em segundos desde a primeira amostra. Sem `tempoMs` em alguma amostra, cai para a
 * posição na série (10 Hz, ou seja, 100 ms por amostra).
 */
function tempos(amostras: readonly AmostraEnergia[]): number[] {
  const base = amostras[0]?.tempoMs ?? null;
  const completo = base !== null && amostras.every((a) => a.tempoMs !== null);
  return amostras.map((a, indice) =>
    completo ? (a.tempoMs! - base) / 1000 : (indice * 100) / 1000,
  );
}

function indiceMaisProximo(xs: readonly number[], alvo: number): number {
  let baixo = 0;
  let alto = xs.length - 1;
  while (alto - baixo > 1) {
    const meio = (baixo + alto) >> 1;
    if (xs[meio]! < alvo) baixo = meio;
    else alto = meio;
  }
  return Math.abs(xs[baixo]! - alvo) <= Math.abs(xs[alto]! - alvo) ? baixo : alto;
}

/** Tensão, corrente e potência ao longo da tentativa (HU-FE-12). */
export function GraficoConsumo({ amostras }: Props) {
  const [foco, definirFoco] = useState<number | null>(null);

  const modelo = useMemo(() => {
    if (amostras.length === 0) return null;
    const xs = tempos(amostras);
    const xMax = Math.max(xs.at(-1) ?? 0, 0.1);
    let minimo = Infinity;
    let maximo = -Infinity;
    for (const amostra of amostras) {
      for (const { chave } of SERIES) {
        minimo = Math.min(minimo, amostra[chave]);
        maximo = Math.max(maximo, amostra[chave]);
      }
    }
    const folga = (maximo - minimo || 1) * 0.08;
    const yMin = Math.max(0, minimo - folga);
    const yMax = maximo + folga;
    const largura = LARGURA - MARGEM.esquerda - MARGEM.direita;
    const altura = ALTURA - MARGEM.topo - MARGEM.base;
    const px = (x: number) => MARGEM.esquerda + (x / xMax) * largura;
    const py = (y: number) => MARGEM.topo + altura - ((y - yMin) / (yMax - yMin)) * altura;
    const linhas = SERIES.map(({ chave }) =>
      amostras.map((a, i) => `${px(xs[i]!).toFixed(1)},${py(a[chave]).toFixed(1)}`).join(' '),
    );
    return { xs, xMax, yMin, yMax, px, py, linhas };
  }, [amostras]);

  function aoMover(evento: PointerEvent<SVGSVGElement>) {
    if (!modelo) return;
    const caixa = evento.currentTarget.getBoundingClientRect();
    if (caixa.width === 0) return;
    const xSvg = ((evento.clientX - caixa.left) / caixa.width) * LARGURA;
    const fracao = (xSvg - MARGEM.esquerda) / (LARGURA - MARGEM.esquerda - MARGEM.direita);
    const alvo = Math.min(Math.max(fracao, 0), 1) * modelo.xMax;
    definirFoco(indiceMaisProximo(modelo.xs, alvo));
  }

  // A série pode encolher (nova tentativa) com o cursor parado sobre ela.
  const amostraFoco = foco !== null ? (amostras[foco] ?? null) : null;
  const ultima = amostras.at(-1) ?? null;
  const exibida = amostraFoco ?? ultima;
  const xExibido = modelo && amostraFoco ? modelo.xs[foco!]! : null;

  return (
    <div className={estilos.grafico} data-testid="grafico-consumo" data-amostras={amostras.length}>
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label="Tensão, corrente e potência ao longo da tentativa"
        onPointerMove={aoMover}
        onPointerLeave={() => definirFoco(null)}
      >
        {Array.from({ length: DIVISOES + 1 }, (_, indice) => {
          const y = MARGEM.topo + (indice * (ALTURA - MARGEM.topo - MARGEM.base)) / DIVISOES;
          const valor = modelo
            ? modelo.yMax - (indice * (modelo.yMax - modelo.yMin)) / DIVISOES
            : null;
          return (
            <g key={`grade-${indice}`}>
              <line
                x1={MARGEM.esquerda}
                y1={y}
                x2={LARGURA - MARGEM.direita}
                y2={y}
                className={estilos.grade}
              />
              {valor !== null && (
                <text
                  x={MARGEM.esquerda - 4}
                  y={y + 2.5}
                  textAnchor="end"
                  className={estilos.rotuloEixo}
                >
                  {valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={MARGEM.esquerda}
          y1={ALTURA - MARGEM.base}
          x2={LARGURA - MARGEM.direita}
          y2={ALTURA - MARGEM.base}
          className={estilos.eixo}
        />
        {modelo && (
          <>
            <text x={MARGEM.esquerda} y={ALTURA - 6} className={estilos.rotuloEixo}>
              0 s
            </text>
            <text
              x={LARGURA - MARGEM.direita}
              y={ALTURA - 6}
              textAnchor="end"
              className={estilos.rotuloEixo}
            >
              {modelo.xMax.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s
            </text>
            {SERIES.map(({ chave, classe }, indice) => (
              <polyline key={chave} points={modelo.linhas[indice]} className={estilos[classe]} />
            ))}
            {amostraFoco && xExibido !== null && (
              <line
                x1={modelo.px(xExibido)}
                y1={MARGEM.topo}
                x2={modelo.px(xExibido)}
                y2={ALTURA - MARGEM.base}
                className={estilos.cursor}
              />
            )}
          </>
        )}
        {!modelo && (
          <text x={LARGURA / 2} y={ALTURA / 2} textAnchor="middle" className={estilos.semAmostras}>
            Aguardando amostras
          </text>
        )}
      </svg>
      <div className={estilos.legenda} data-testid="legenda-consumo">
        {SERIES.map(({ chave, rotulo, unidade, classe }) => (
          <span key={chave} className={estilos[`${classe}Texto`]}>
            ━ {rotulo}: {formatarNumero(exibida ? exibida[chave] : null, unidade)}
          </span>
        ))}
        <span className={estilos.instante}>
          {xExibido !== null
            ? `t = ${xExibido.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`
            : ''}
        </span>
      </div>
    </div>
  );
}
