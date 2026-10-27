import { dimensoesLabirinto, estadoParede } from '../../dominio';
import type { DadosExecucao, DirecaoParede, EstadoParede } from '../../dominio';
import estilos from './MapaLabirinto.module.css';

/**
 * Mapa do labirinto com paredes, trajeto e robô. Usado tanto no acompanhamento ao vivo quanto
 * no detalhe de uma execução passada: a mesma visualização para os dois modos (HU-FE-11).
 */
export function MapaLabirinto({
  trajeto,
  mapa,
  posicao,
  tipo,
  tipoInvalido,
}: {
  trajeto: DadosExecucao['trajeto'];
  mapa: DadosExecucao['mapa'];
  posicao: DadosExecucao['posicao'];
  tipo: DadosExecucao['tipoLabirinto'];
  tipoInvalido: DadosExecucao['tipoInvalido'];
}) {
  if (tipo === null) {
    return (
      <div className={estilos.labirintoPendente} role="status" data-testid="labirinto-pendente">
        {tipoInvalido ? 'Tipo de labirinto inválido' : 'Aguardando tipo de labirinto'}
      </div>
    );
  }
  const cellSize = 82;
  const { colunas: largura, linhas: altura } = dimensoesLabirinto(tipo);
  const sizeX = cellSize * largura;
  const sizeY = cellSize * altura;
  // Convenção do protocolo: x cresce para o Leste e y cresce para o Sul (y = 0 é a borda Norte).
  // O SVG usa a mesma orientação, então não há inversão de eixo.
  const centro = (x: number, y: number) => ({
    x: Math.max(0, Math.min(largura - 1, x)) * cellSize + cellSize / 2,
    y: Math.max(0, Math.min(altura - 1, y)) * cellSize + cellSize / 2,
  });
  const pontos = trajeto.map(({ x, y }) => centro(x, y));
  const path = pontos.map(({ x, y }, indice) => `${indice === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const atual = posicao ? centro(posicao.x, posicao.y) : pontos.at(-1);
  const visitas = new Map<string, number[]>();
  trajeto.forEach(({ x, y, seq }) => {
    const chave = `${x}:${y}`;
    visitas.set(chave, [...(visitas.get(chave) ?? []), seq]);
  });
  const classeParede: Record<EstadoParede, string> = {
    PRESENTE: estilos.paredePresente!,
    AUSENTE: estilos.paredeAusente!,
    DESCONHECIDA: estilos.paredeDesconhecida!,
  };

  return (
    <div className={estilos.labirintoArea}>
      <svg
        className={estilos.labirinto}
        viewBox={`0 0 ${sizeX} ${sizeY}`}
        role="img"
        aria-label="Mapa do labirinto"
        data-testid="labirinto"
        data-colunas={largura}
        data-linhas={altura}
      >
        {Array.from({ length: largura * altura }, (_, indice) => {
          const linha = Math.floor(indice / largura);
          const coluna = indice % largura;
          const visitada = visitas.has(`${coluna}:${linha}`);
          return (
            <rect
              key={`celula-${indice}`}
              data-celula={`${coluna}:${linha}`}
              x={coluna * cellSize}
              y={linha * cellSize}
              width={cellSize}
              height={cellSize}
              className={
                coluna === 0 && linha === altura - 1
                  ? estilos.celulaInicio
                  : visitada
                    ? estilos.celulaVisitada
                    : estilos.celula
              }
            />
          );
        })}
        {Array.from(visitas.entries()).map(([chave, sequencias]) => {
          const coordenadas = chave.split(':').map(Number);
          const x = coordenadas[0];
          const y = coordenadas[1];
          if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y))
            return null;
          const c = centro(x, y);
          if (atual?.x === c.x && atual?.y === c.y) return null;
          return (
            <text
              key={`visita-${chave}`}
              data-testid={`visita-${x}-${y}`}
              x={c.x}
              y={c.y + 4}
              textAnchor="middle"
              className={estilos.numeroVisita}
            >
              {sequencias.join('/')}
            </text>
          );
        })}
        {Array.from({ length: largura * altura }, (_, indice) => {
          const y = Math.floor(indice / largura);
          const x = indice % largura;
          const topo = y * cellSize;
          const esquerda = x * cellSize;
          const arestas: Record<DirecaoParede, [number, number, number, number]> = {
            norte: [esquerda, topo, esquerda + cellSize, topo],
            sul: [esquerda, topo + cellSize, esquerda + cellSize, topo + cellSize],
            oeste: [esquerda, topo, esquerda, topo + cellSize],
            leste: [esquerda + cellSize, topo, esquerda + cellSize, topo + cellSize],
          };
          return (
            <g key={`paredes-${x}-${y}`}>
              {(['norte', 'leste', 'sul', 'oeste'] as const).map((direcao) => {
                const estado = estadoParede(mapa, tipo, x, y, direcao);
                const [x1, y1, x2, y2] = arestas[direcao];
                return (
                  <line
                    key={direcao}
                    data-parede={`${x}:${y}:${direcao}`}
                    data-estado={estado}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    className={classeParede[estado]}
                  />
                );
              })}
            </g>
          );
        })}
        <rect
          x={(largura - 1) * cellSize + 4}
          y="4"
          width={cellSize - 8}
          height={cellSize - 8}
          className={estilos.objetivo}
        />
        <text x={(largura - 1) * cellSize + 8} y="18" className={estilos.rotuloMapa}>
          OBJETIVO
        </text>
        <rect
          x="4"
          y={sizeY - cellSize + 4}
          width={cellSize - 8}
          height={cellSize - 8}
          className={estilos.inicio}
        />
        <text x="8" y={sizeY - cellSize + 18} className={estilos.rotuloMapaInicio}>
          INÍCIO
        </text>
        {path && <path d={path} className={estilos.trajetoria} data-testid="trajetoria" />}
        {atual && (
          <circle cx={atual.x} cy={atual.y} r="12" className={estilos.robo} data-testid="robo" />
        )}
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
