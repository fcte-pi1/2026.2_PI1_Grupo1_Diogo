import { useConexao } from '../../view-model';
import estilos from './IndicadorConexao.module.css';

/** Estado da conexão com o backend e do sinal do robô (HU-FE-03). */
export function IndicadorConexao() {
  const { estado, rotulo } = useConexao();
  return (
    <span className={estilos.indicador} role="status" aria-live="polite">
      <span className={estilos.ponto} data-estado={estado} aria-hidden="true" />
      {rotulo}
    </span>
  );
}
