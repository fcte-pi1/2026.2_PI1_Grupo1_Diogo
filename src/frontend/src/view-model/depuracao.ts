import { useMemo } from 'react';
import { QUANTIDADE_SENSORES_TOF } from '../dominio';
import { usePainel } from '../estado';
import { formatarAngulo, formatarContagem, formatarDistanciaMm } from '../formatacao';

export interface CampoDepuracao {
  id: string;
  rotulo: string;
  valor: string;
}

/**
 * Leituras brutas do modo de depuração (HU-FE-14). Vêm de uma fatia própria da store:
 * atualizá-las não toca nos dados da tentativa (CA2). Sem leitura, todo campo mostra "—" (CA4).
 */
export function useDepuracao() {
  const leitura = usePainel((s) => s.depuracao);

  return useMemo(() => {
    const sensoresTof: CampoDepuracao[] = Array.from(
      { length: QUANTIDADE_SENSORES_TOF },
      (_, i) => ({
        id: `tof-${i + 1}`,
        rotulo: `ToF ${i + 1}`,
        valor: formatarDistanciaMm(leitura?.tof[i] ?? null),
      }),
    );
    const mpu: CampoDepuracao = {
      id: 'mpu-angulo',
      rotulo: 'MPU-6050 (ângulo)',
      valor: formatarAngulo(leitura?.anguloMpuGraus ?? null),
    };
    const encoders: CampoDepuracao[] = [
      {
        id: 'encoder-esquerdo',
        rotulo: 'Encoder esquerdo',
        valor: formatarContagem(leitura?.encoderEsquerdo ?? null),
      },
      {
        id: 'encoder-direito',
        rotulo: 'Encoder direito',
        valor: formatarContagem(leitura?.encoderDireito ?? null),
      },
    ];
    return { semLeitura: leitura === null, sensoresTof, mpu, encoders };
  }, [leitura]);
}
