// Web Serial (Chrome/Edge). Protocolo de texto por líneas, UTF-8,
// 115200 baudios — ver README. El firmware aún no lo implementa;
// este módulo se desarrolló contra MockDeviceLink y la misma spec.

import { DeviceEvent, DeviceLink, EventEmitter, FileInfo } from "./DeviceLink";

interface Pending {
  resolve: (lines: string[]) => void;
  reject: (err: Error) => void;
  /** Cuántas líneas espera la respuesta; -1 = payload con tamaño (DATA). */
  collector: (lines: string[]) => boolean; // true cuando la respuesta está completa
}

/** Un pad sano responde en milisegundos; 5 s es holgura de sobra. */
const COMMAND_TIMEOUT_MS = 5000;

/**
 * Traza del trafico en la consola. Se enciende con
 * `localStorage.setItem("macropad-debug-serial", "1")` y recargando:
 * es la forma de ver que esta pasando en el cable sin ocupar el puerto
 * con un monitor serie, que es exclusivo.
 */
const DEBUG_SERIAL = (() => {
  try {
    return localStorage.getItem("macropad-debug-serial") === "1";
  } catch {
    return false;
  }
})();

export function serialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export class SerialDeviceLink implements DeviceLink {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private emitter = new EventEmitter();
  private _connected = false;
  private buffer = "";
  private queue: Pending[] = [];
  private readAbort: AbortController | null = null;

  get connected() {
    return this._connected;
  }

  async connect() {
    if (!serialSupported()) throw new Error("Web Serial not supported");
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable!.getWriter();
    this._connected = true;
    this.readLoop();
  }

  async disconnect() {
    this._connected = false;
    this.readAbort?.abort();
    try {
      this.writer?.releaseLock();
      await this.port?.close();
    } catch {
      /* puerto ya cerrado */
    }
    this.port = null;
    this.writer = null;
    this.emitter.emit({ type: "disconnected" });
  }

  async ping() {
    const [line] = await this.command("PING", firstLine());
    const m = line.match(/^PONG\s+(\S+)\s+(\d+)/);
    if (!m) throw new Error(`Unexpected: ${line}`);
    return { fwVersion: m[1], schemaVersion: parseInt(m[2], 10) };
  }

  async list(): Promise<FileInfo[]> {
    const lines = await this.command("LIST", (ls) => {
      if (ls.length === 0) return false;
      const m = ls[0].match(/^FILES\s+(\d+)/);
      if (!m) throw new Error(`Unexpected: ${ls[0]}`);
      return ls.length >= 1 + parseInt(m[1], 10);
    });
    return lines.slice(1).map((l) => {
      const [name, size] = l.split("\t");
      return { name, size: parseInt(size, 10) || 0 };
    });
  }

  async get(name: string): Promise<string> {
    // DATA <bytes>\n<contenido>: el contenido puede tener \n internos,
    // así que acumulamos líneas hasta cubrir el tamaño anunciado.
    let expected = -1;
    const lines = await this.command(`GET ${name}`, (ls) => {
      if (ls.length === 0) return false;
      if (expected < 0) {
        if (ls[0].startsWith("ERR")) throw new Error(ls[0]);
        const m = ls[0].match(/^DATA\s+(\d+)/);
        if (!m) throw new Error(`Unexpected: ${ls[0]}`);
        expected = parseInt(m[1], 10);
      }
      const payload = ls.slice(1).join("\n");
      return new TextEncoder().encode(payload).length >= expected;
    });
    return lines.slice(1).join("\n");
  }

  async put(name: string, content: string): Promise<void> {
    const bytes = new TextEncoder().encode(content).length;
    const [line] = await this.command(`PUT ${name} ${bytes}\n${content}`, firstLine());
    if (!line.startsWith("OK")) throw new Error(line);
  }

  async del(name: string): Promise<void> {
    const [line] = await this.command(`DEL ${name}`, firstLine());
    if (!line.startsWith("OK")) throw new Error(line);
  }

  async reload(): Promise<void> {
    const [line] = await this.command("RELOAD", firstLine());
    if (!line.startsWith("OK")) throw new Error(line);
  }

  async setLive(on: boolean): Promise<void> {
    const [line] = await this.command(`LIVE ${on ? "ON" : "OFF"}`, firstLine());
    if (!line.startsWith("OK")) throw new Error(line);
  }

  onEvent(cb: (ev: DeviceEvent) => void): () => void {
    return this.emitter.on(cb);
  }

  // ---------- interno ----------

  /**
   * Sin timeout, una respuesta perdida deja la promesa colgada para
   * siempre Y bloquea la cola: todo comando posterior espera detrás de
   * ella y el enlace queda muerto sin avisar a nadie.
   */
  private async command(
    cmd: string,
    collector: (lines: string[]) => boolean,
    timeoutMs = COMMAND_TIMEOUT_MS,
  ): Promise<string[]> {
    if (!this._connected || !this.writer) throw new Error("Not connected");

    let entry: Pending;
    const promise = new Promise<string[]>((resolve, reject) => {
      entry = { resolve, reject, collector };
      this.queue.push(entry);
    });

    const timer = setTimeout(() => {
      const i = this.queue.indexOf(entry);
      if (i < 0) return; // ya respondió
      this.queue.splice(i, 1);
      if (i === 0) this.pendingLines = [];
      entry.reject(new Error(`Timeout waiting for a reply to "${cmd.split("\n")[0]}"`));
    }, timeoutMs);

    void promise.catch(() => {}).finally(() => clearTimeout(timer));

    if (DEBUG_SERIAL) console.debug("[serial] >", cmd.split("\n")[0]);
    await this.writer.write(new TextEncoder().encode(cmd + "\n"));
    return promise;
  }

  private async readLoop() {
    if (!this.port?.readable) return;
    this.readAbort = new AbortController();
    const reader = this.port.readable.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = this.buffer.indexOf("\n")) >= 0) {
          const line = this.buffer.slice(0, nl).replace(/\r$/, "");
          this.buffer = this.buffer.slice(nl + 1);
          this.handleLine(line);
        }
      }
    } catch {
      /* lectura abortada o puerto desconectado */
    } finally {
      reader.releaseLock();
      if (this._connected) {
        this._connected = false;
        this.emitter.emit({ type: "disconnected" });
      }
    }
  }

  private pendingLines: string[] = [];

  private handleLine(line: string) {
    if (DEBUG_SERIAL) console.debug("[serial] <", line);

    // Eventos asíncronos: pueden intercalarse con respuestas
    let m;
    if ((m = line.match(/^EV\s+PRESS\s+(\d+)/))) {
      this.emitter.emit({ type: "press", idx: parseInt(m[1], 10) });
      return;
    }
    if ((m = line.match(/^EV\s+RELEASE\s+(\d+)/))) {
      this.emitter.emit({ type: "release", idx: parseInt(m[1], 10) });
      return;
    }
    if ((m = line.match(/^EV\s+TOOL\s+(\S+)/))) {
      this.emitter.emit({ type: "tool", toolId: m[1] });
      return;
    }

    const pending = this.queue[0];
    if (!pending) return; // línea huérfana: ignorar
    this.pendingLines.push(line);
    try {
      if (pending.collector(this.pendingLines)) {
        this.queue.shift();
        const lines = this.pendingLines;
        this.pendingLines = [];
        pending.resolve(lines);
      }
    } catch (err) {
      this.queue.shift();
      this.pendingLines = [];
      pending.reject(err as Error);
    }
  }
}

const firstLine = () => (lines: string[]) => lines.length >= 1;
