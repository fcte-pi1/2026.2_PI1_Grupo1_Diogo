import type { FiltroTipoLabirinto } from '../../dominio';
import type { OpcaoFiltro } from '../../view-model';
import estilos from './FiltroLabirinto.module.css';

interface Props {
  opcoes: readonly OpcaoFiltro[];
  selecionado: FiltroTipoLabirinto;
  aoSelecionar: (valor: FiltroTipoLabirinto) => void;
}

/** Filtro por tipo de labirinto (4x4, 8x4, 12x4 e Todos); a seleção fica sempre visível. */
export function FiltroLabirinto({ opcoes, selecionado, aoSelecionar }: Props) {
  return (
    <div className={estilos.grupo} role="group" aria-label="Filtrar por labirinto">
      {opcoes.map(({ valor, rotulo }) => (
        <button
          key={valor}
          type="button"
          className={estilos.botao}
          aria-pressed={valor === selecionado}
          onClick={() => aoSelecionar(valor)}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}
