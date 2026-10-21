import { Link } from 'react-router';
import type { LinhaHistorico } from '../../view-model';
import estilos from './TabelaHistorico.module.css';

interface Props {
  linhas: readonly LinhaHistorico[];
}

/** Execuções armazenadas; cada linha abre `/historico/:id`. */
export function TabelaHistorico({ linhas }: Props) {
  return (
    <div className={estilos.rolagem}>
      <table className={estilos.tabela}>
        <thead>
          <tr>
            <th scope="col">Data e hora</th>
            <th scope="col">Labirinto</th>
            <th scope="col">Tempo</th>
            <th scope="col">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.id} className={estilos.linha}>
              <td className={estilos.mono}>
                <Link to={linha.rota} className={estilos.link}>
                  {linha.dataHora}
                </Link>
              </td>
              <td>
                <span className={estilos.labirinto}>{linha.labirinto ?? '—'}</span>
              </td>
              <td className={estilos.mono}>{linha.tempo}</td>
              <td>
                <span className={estilos.status} data-status={linha.status}>
                  {linha.rotuloStatus}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
