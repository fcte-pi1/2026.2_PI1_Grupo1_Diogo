/**
 * ServicoConsulta — consultas da API HTTP (RF-93 a RF-95). Só leitura: nada aqui altera
 * uma corrida.
 */
import type { DetalheCorrida } from '../../protocolo/tipos.js';
import type { RepositorioConsulta } from './portas.js';

export class ServicoConsulta {
  constructor(private readonly consulta: RepositorioConsulta) {}

  /**
   * Detalhe da corrida: métricas, trajeto e série de energia (RF-84, RF-85). Também serve
   * a uma corrida em andamento, para o painel completar o snapshot ao reconectar.
   */
  detalheCorrida(corridaId: string): Promise<DetalheCorrida | null> {
    return this.consulta.detalheCorrida(corridaId);
  }
}
