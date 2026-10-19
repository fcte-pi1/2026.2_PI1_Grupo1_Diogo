import { EventEmitter } from 'node:events';
import type { MapaEventos, PublicadorEventos } from '../aplicacao/eventos.js';
import type { RegistroLog } from '../aplicacao/portas.js';

/** Barramento de eventos em memória entre os módulos (arquitetura do backend, §2.2). */
export class BarramentoEventos implements PublicadorEventos {
  private readonly emissor = new EventEmitter();

  constructor(private readonly log?: RegistroLog) {}

  publicar<K extends keyof MapaEventos>(evento: K, dados: MapaEventos[K]): void {
    this.emissor.emit(evento, dados);
  }

  /**
   * A publicação é síncrona e acontece dentro da gravação das mensagens. Por isso cada
   * ouvinte é isolado: um erro na distribuição, que é de melhor esforço, é registrado e não
   * chega a quem publicou. Sem isso, a ingestão trataria a mensagem já gravada como falha
   * de gravação e deixaria de confirmá-la (RNF-50).
   */
  assinar<K extends keyof MapaEventos>(evento: K, ouvinte: (dados: MapaEventos[K]) => void): void {
    this.emissor.on(evento, (dados: MapaEventos[K]) => {
      try {
        ouvinte(dados);
      } catch (erro) {
        this.log?.error({ erro, evento }, 'falha num ouvinte do barramento');
      }
    });
  }
}
