import type { CampoDepuracao } from '../../view-model';
import { useDepuracao } from '../../view-model';
import estilos from './PainelDepuracao.module.css';

function Grupo({ titulo, campos }: { titulo: string; campos: readonly CampoDepuracao[] }) {
  return (
    <div className={estilos.grupo}>
      <h4>{titulo}</h4>
      <dl>
        {campos.map((campo) => (
          <div key={campo.id} className={estilos.linha}>
            <dt>{campo.rotulo}</dt>
            <dd data-testid={`depuracao-${campo.id}`}>{campo.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Dados brutos dos sensores e atuadores, em área secundária (HU-FE-14). */
export function PainelDepuracao() {
  const d = useDepuracao();

  return (
    <section
      className={estilos.painel}
      aria-label="Dados brutos dos sensores"
      data-testid="painel-depuracao"
    >
      {d.semLeitura && (
        <p className={estilos.aguardando} data-testid="depuracao-aguardando">
          Aguardando leituras de depuração…
        </p>
      )}
      <div className={estilos.grupos}>
        <Grupo titulo="Sensores ToF" campos={d.sensoresTof} />
        <Grupo titulo="Inércia" campos={[d.mpu]} />
        <Grupo titulo="Encoders" campos={d.encoders} />
      </div>
    </section>
  );
}
