import { useMemo } from 'react';
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
    const lidos: CampoDepuracao[] = (leitura?.tof ?? []).map((distancia, i) => ({
      id: `tof-${i + 1}`,
      rotulo: `ToF ${i + 1}`,
      valor: formatarDistanciaMm(distancia),
    }));
    // Sem leitura, ainda não se sabe quantos sensores virão: uma linha só, indisponível.
    const sensoresTof: CampoDepuracao[] =
      lidos.length > 0 ? lidos : [{ id: 'tof', rotulo: 'Sensores ToF', valor: '—' }];
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
