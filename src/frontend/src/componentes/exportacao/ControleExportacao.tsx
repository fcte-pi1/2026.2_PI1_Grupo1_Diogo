import type { DadosExecucao } from '../../dominio';
import { FORMATOS_EXPORTACAO } from '../../dominio';
import { useExportacao } from '../../view-model';
import estilos from './ControleExportacao.module.css';

interface Props {
  dados: DadosExecucao;
  /** Início da execução, ISO 8601. */
  iniciadaEm: string | null;
}

/** Botões de exportação da execução aberta no detalhe, em CSV ou JSON (HU-FE-15). */
export function ControleExportacao({ dados, iniciadaEm }: Props) {
  const { exportar, erro } = useExportacao(dados, iniciadaEm);

  return (
    <div className={estilos.controle} data-testid="controle-exportacao">
      <div className={estilos.botoes}>
        <span className={estilos.rotulo}>Exportar execução</span>
        {FORMATOS_EXPORTACAO.map((formato) => (
          <button
            key={formato}
            type="button"
            className={estilos.botao}
            data-testid={`exportar-${formato.toLowerCase()}`}
            onClick={() => exportar(formato)}
          >
            Exportar {formato}
          </button>
        ))}
      </div>
      {erro && (
        <p className={estilos.erro} role="alert" data-testid="exportacao-erro">
          {erro}
        </p>
      )}
    </div>
  );
}
