import { EventEmitter } from 'node:events';

/**
 * Barramento de eventos em memória entre os módulos (arquitetura do backend, §2.2).
 * Os eventos do domínio serão declarados em `MapaEventos` conforme os módulos forem implementados.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MapaEventos {}

export class BarramentoEventos {
  private readonly emissor = new EventEmitter();

  publicar<K extends keyof MapaEventos>(evento: K, dados: MapaEventos[K]): void {
    this.emissor.emit(evento as string, dados);
  }

  assinar<K extends keyof MapaEventos>(evento: K, ouvinte: (dados: MapaEventos[K]) => void): void {
    this.emissor.on(evento as string, ouvinte);
  }
}
