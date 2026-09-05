// Simulador del pad: responde al mismo protocolo que el hardware y
// emite eventos de tecla falsos. Permite desarrollar y demostrar la
// app completa sin dispositivo.

import { DeviceEvent, DeviceLink, EventEmitter, FileInfo } from "./DeviceLink";

export class MockDeviceLink implements DeviceLink {
  private files = new Map<string, string>();
  private emitter = new EventEmitter();
  private _connected = false;
  private live = false;
  private demoTimer: ReturnType<typeof setInterval> | null = null;
  private heldDemoKey = -1;

  constructor(seedFiles?: Record<string, string>) {
    if (seedFiles) for (const [k, v] of Object.entries(seedFiles)) this.files.set(k, v);
  }

  get connected() {
    return this._connected;
  }

  async connect() {
    await delay(300); // que se sienta como abrir un puerto
    this._connected = true;
  }

  async disconnect() {
    this.stopDemo();
    this._connected = false;
    this.live = false;
    this.emitter.emit({ type: "disconnected" });
  }

  async ping() {
    this.assertConnected();
    return { fwVersion: "mock-0.1", schemaVersion: 1 };
  }

  async list(): Promise<FileInfo[]> {
    this.assertConnected();
    return [...this.files.entries()].map(([name, content]) => ({ name, size: content.length }));
  }

  async get(name: string): Promise<string> {
    this.assertConnected();
    const f = this.files.get(name);
    if (f === undefined) throw new Error(`ERR file not found: ${name}`);
    return f;
  }

  async put(name: string, content: string): Promise<void> {
    this.assertConnected();
    await delay(120); // simular escritura en flash
    this.files.set(name, content);
  }

  async del(name: string): Promise<void> {
    this.assertConnected();
    this.files.delete(name);
  }

  async reload(): Promise<void> {
    this.assertConnected();
    await delay(150);
  }

  async setLive(on: boolean): Promise<void> {
    this.assertConnected();
    this.live = on;
    if (!on) this.stopDemo();
  }

  onEvent(cb: (ev: DeviceEvent) => void): () => void {
    return this.emitter.on(cb);
  }

  // ---- API extra solo del simulador ----

  /** La vista En vivo inyecta pulsaciones clickeando el grid. */
  injectKey(idx: number, pressed: boolean) {
    if (!this._connected || !this.live) return;
    this.emitter.emit({ type: pressed ? "press" : "release", idx });
  }

  /** Demo: toca un patrón aleatorio sobre las 8 teclas superiores. */
  startDemo() {
    if (this.demoTimer) return;
    this.demoTimer = setInterval(() => {
      if (!this.live) return;
      if (this.heldDemoKey >= 0) {
        this.emitter.emit({ type: "release", idx: this.heldDemoKey });
        this.heldDemoKey = -1;
      } else {
        this.heldDemoKey = Math.floor(Math.random() * 8);
        this.emitter.emit({ type: "press", idx: this.heldDemoKey });
      }
    }, 350);
  }

  stopDemo() {
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.demoTimer = null;
    if (this.heldDemoKey >= 0) {
      this.emitter.emit({ type: "release", idx: this.heldDemoKey });
      this.heldDemoKey = -1;
    }
  }

  get demoRunning() {
    return this.demoTimer !== null;
  }

  private assertConnected() {
    if (!this._connected) throw new Error("ERR not connected");
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
