import { EventEmitter } from 'node:events';
import type { MapaEventos, PublicadorEventos } from '../aplicacao/eventos.js';

/** Barramento de eventos em memória entre os módulos (arquitetura do backend, §2.2). */
export class BarramentoEventos implements PublicadorEventos {
  private readonly emissor = new EventEmitter();

  publicar<K extends keyof MapaEventos>(evento: K, dados: MapaEventos[K]): void {
    this.emissor.emit(evento, dados);
  }

  assinar<K extends keyof MapaEventos>(evento: K, ouvinte: (dados: MapaEventos[K]) => void): void {
    this.emissor.on(evento, ouvinte);
  }
}
