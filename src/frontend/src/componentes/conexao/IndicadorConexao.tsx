import { useConexao } from '../../view-model';
import estilos from './IndicadorConexao.module.css';

/** Estado da conexão com o backend e do sinal do robô (HU-FE-03). */
export function IndicadorConexao() {
  const { estado, sinal, rotulo } = useConexao();
  const estadoVisual =
    estado === 'CONECTADO' && sinal !== 'PERDIDO'
      ? 'conectado'
      : estado === 'DESCONECTADO' || sinal === 'PERDIDO'
        ? 'desconectado'
        : 'reconectando';

  return (
    <div className={estilos.indicador} data-estado={estadoVisual} role="status" aria-live="polite">
      <span className={estilos.ponto} aria-hidden="true" />
      {rotulo}
    </div>
  );
}
