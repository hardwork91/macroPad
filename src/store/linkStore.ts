// Conexión con el dispositivo (real o simulado) + sesión "en vivo":
// eventos de tecla -> intérprete local -> log MIDI legible.

import { create } from "zustand";
import { DeviceLink } from "../device/DeviceLink";
import { MockDeviceLink } from "../device/MockDeviceLink";
import { SerialDeviceLink, serialSupported } from "../device/SerialDeviceLink";
import { initLiveState, LiveState, LogEntry, MidiEvent, pressKey, releaseKey } from "../live/engine";
import { DeviceConfig, ToolFile } from "../schema/types";
import { useAppStore } from "./appStore";

export type LinkKind = "mock" | "serial";
export type ConnState = "disconnected" | "connecting" | "connected";

export interface LiveLogItem {
  id: number;
  entry: LogEntry;
  events: MidiEvent[];
  at: number;
}

interface LinkStoreState {
  kind: LinkKind;
  conn: ConnState;
  fwVersion: string | null;
  live: boolean;
  demoRunning: boolean;
  pressed: boolean[];
  activeToolId: string | null;
  liveState: LiveState | null;
  log: LiveLogItem[];
  syncing: boolean;

  setKind: (k: LinkKind) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setLive: (on: boolean) => Promise<void>;
  toggleDemo: () => void;
  injectKey: (idx: number, pressed: boolean) => void;
  setActiveTool: (toolId: string | null) => void;
  clearLog: () => void;
  sync: (device: DeviceConfig, tools: ToolFile[]) => Promise<void>;
}

let link: DeviceLink | null = null;
let unsub: (() => void) | null = null;
let logSeq = 1;

export function getLink(): DeviceLink | null {
  return link;
}

export const useLinkStore = create<LinkStoreState>((set, get) => {
  function currentTool(): ToolFile | null {
    const { activeToolId } = get();
    if (!activeToolId) return null;
    return useAppStore.getState().tools[activeToolId] ?? null;
  }

  function handleEvent(ev: { type: string; idx?: number; toolId?: string }) {
    const st = get();
    if (ev.type === "disconnected") {
      set({ conn: "disconnected", live: false, demoRunning: false, pressed: Array(16).fill(false) });
      return;
    }
    if (ev.type === "tool" && ev.toolId) {
      st.setActiveTool(ev.toolId);
      return;
    }
    const idx = ev.idx ?? -1;
    if (idx < 0 || idx > 15) return;

    const tool = currentTool();
    const device = useAppStore.getState().device;
    const liveState = st.liveState;
    const pressed = [...st.pressed];
    pressed[idx] = ev.type === "press";

    if (!tool || !liveState) {
      set({ pressed });
      return;
    }

    if (ev.type === "press") {
      const res = pressKey(tool, device, liveState, idx);
      const log = res.log
        ? [{ id: logSeq++, entry: res.log, events: res.events, at: Date.now() }, ...st.log].slice(0, 200)
        : st.log;
      set({ pressed, liveState: { ...liveState }, log });
    } else {
      const events = releaseKey(tool, device, liveState, idx);
      void events; // el log muestra solo presses; los NoteOff van implícitos
      set({ pressed, liveState: { ...liveState } });
    }
  }

  return {
    // El aparato real es el caso normal; el simulador solo cuando no hay
    // Web Serial (Firefox, Safari) o cuando se quiere probar sin hardware.
    kind: serialSupported() ? "serial" : "mock",
    conn: "disconnected",
    fwVersion: null,
    live: false,
    demoRunning: false,
    pressed: Array(16).fill(false),
    activeToolId: null,
    liveState: null,
    log: [],
    syncing: false,

    setKind: (kind) => {
      if (get().conn !== "disconnected") return;
      set({ kind });
    },

    connect: async () => {
      const { kind, conn } = get();
      if (conn !== "disconnected") return;
      if (kind === "serial" && !serialSupported()) throw new Error("serial-unsupported");

      set({ conn: "connecting" });
      try {
        link = kind === "mock" ? new MockDeviceLink() : new SerialDeviceLink();
        await link.connect();
        unsub = link.onEvent(handleEvent);
        const pong = await link.ping();
        set({ conn: "connected", fwVersion: pong.fwVersion });

        // Tool activa inicial: primer slot ocupado
        const { device, tools } = useAppStore.getState();
        const first = (device.slots ?? []).find((s) => s != null && tools[s]) ?? null;
        get().setActiveTool(first);
      } catch (err) {
        link = null;
        set({ conn: "disconnected" });
        throw err;
      }
    },

    disconnect: async () => {
      unsub?.();
      unsub = null;
      await link?.disconnect().catch(() => {});
      link = null;
      set({
        conn: "disconnected",
        fwVersion: null,
        live: false,
        demoRunning: false,
        pressed: Array(16).fill(false),
      });
    },

    setLive: async (on) => {
      if (!link) return;
      await link.setLive(on);
      if (!on && link instanceof MockDeviceLink) link.stopDemo();
      set({ live: on, demoRunning: on ? get().demoRunning : false, pressed: Array(16).fill(false) });
    },

    toggleDemo: () => {
      if (!(link instanceof MockDeviceLink) || !get().live) return;
      if (link.demoRunning) link.stopDemo();
      else link.startDemo();
      set({ demoRunning: link.demoRunning });
    },

    injectKey: (idx, pressed) => {
      if (link instanceof MockDeviceLink) link.injectKey(idx, pressed);
    },

    setActiveTool: (toolId) => {
      const tool = toolId ? useAppStore.getState().tools[toolId] : null;
      set({
        activeToolId: toolId,
        liveState: tool ? initLiveState(tool) : null,
        pressed: Array(16).fill(false),
      });
    },

    clearLog: () => set({ log: [] }),

    sync: async (device, tools) => {
      if (!link || get().syncing) return;
      set({ syncing: true });
      try {
        await link.put("device.json", JSON.stringify(device, null, 2));
        for (const t of tools) {
          await link.put(`${t.id}.json`, JSON.stringify(t, null, 2));
        }
        await link.reload();
      } finally {
        set({ syncing: false });
      }
    },
  };
});
