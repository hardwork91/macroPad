// Abstracción de la comunicación con el pad. Todo el protocolo vive
// aquí; la UI solo conoce esta interfaz. El firmware implementará el
// mismo protocolo por Web Serial (ver README / PROMPT §4.3).

export type DeviceEvent =
  | { type: "press"; idx: number }
  | { type: "release"; idx: number }
  | { type: "tool"; toolId: string }
  | { type: "disconnected" };

export interface FileInfo {
  name: string;
  size: number;
}

export interface DeviceLink {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readonly connected: boolean;
  ping(): Promise<{ fwVersion: string; schemaVersion: number }>;
  list(): Promise<FileInfo[]>;
  get(name: string): Promise<string>;
  put(name: string, content: string): Promise<void>;
  del(name: string): Promise<void>;
  reload(): Promise<void>;
  setLive(on: boolean): Promise<void>;
  /** Suscripción a eventos asíncronos; devuelve el unsubscribe. */
  onEvent(cb: (ev: DeviceEvent) => void): () => void;
}

export class EventEmitter {
  private listeners = new Set<(ev: DeviceEvent) => void>();
  emit(ev: DeviceEvent) {
    for (const l of this.listeners) l(ev);
  }
  on(cb: (ev: DeviceEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
