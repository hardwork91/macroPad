// Estado de la app: biblioteca de tools + device.json + UI.
// Persistencia en IndexedDB (idb-keyval); las 4 tools de ejemplo se
// precargan la primera vez.

import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";
import {
  CTRL_KEY_INDEX,
  DeviceConfig,
  KeySnippet,
  NUM_KEYS,
  ToolFile,
  emptyTool,
} from "../schema/types";

import deviceExample from "../examples/device.json";
import ccBasic from "../examples/cc_basic.json";
import chromatic from "../examples/chromatic.json";
import scalePlay from "../examples/scale_play.json";
import chordPlay from "../examples/chord_play.json";

const DB_KEY = "macropad-editor-v1";

export type View = "slots" | "editor" | "library" | "live";

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  text: string;
}

interface AppState {
  ready: boolean;
  tools: Record<string, ToolFile>;
  device: DeviceConfig;
  view: View;
  selectedToolId: string | null;
  selectedKey: number;
  clipboardKey: KeySnippet | null;
  toasts: Toast[];

  init: () => Promise<void>;
  setView: (v: View) => void;
  selectTool: (id: string | null) => void;
  selectKey: (i: number) => void;
  setClipboardKey: (s: KeySnippet | null) => void;

  updateTool: (id: string, updater: (t: ToolFile) => ToolFile) => void;
  renameToolId: (oldId: string, newId: string) => boolean;
  createTool: () => string;
  duplicateTool: (id: string) => string;
  deleteTool: (id: string) => void;
  importTool: (tool: ToolFile) => void;

  updateDevice: (updater: (d: DeviceConfig) => DeviceConfig) => void;
  setSlot: (slot: number, toolId: string | null) => void;

  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;
}

/** slots -> toolOrder (compatibilidad con el firmware actual). */
function syncToolOrder(device: DeviceConfig): DeviceConfig {
  const slots = device.slots ?? [];
  const order: string[] = [];
  for (const id of slots) if (id != null && !order.includes(id)) order.push(id);
  return { ...device, toolOrder: order };
}

function seedDevice(): DeviceConfig {
  const base = structuredClone(deviceExample) as DeviceConfig;
  const slots: (string | null)[] = Array(NUM_KEYS).fill(null);
  base.toolOrder.forEach((id, i) => {
    if (i < CTRL_KEY_INDEX) slots[i] = id;
  });
  return syncToolOrder({ ...base, slots });
}

function seedTools(): Record<string, ToolFile> {
  const list = [ccBasic, chromatic, scalePlay, chordPlay] as unknown as ToolFile[];
  const out: Record<string, ToolFile> = {};
  for (const t of list) out[t.id] = structuredClone(t);
  return out;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(get: () => AppState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { tools, device } = get();
    idbSet(DB_KEY, { tools, device }).catch(() => {
      /* persistencia no disponible (modo incógnito, etc.) */
    });
  }, 300);
}

let toastSeq = 1;

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  tools: {},
  device: seedDevice(),
  view: "slots",
  selectedToolId: null,
  selectedKey: 0,
  clipboardKey: null,
  toasts: [],

  init: async () => {
    let saved: { tools?: Record<string, ToolFile>; device?: DeviceConfig } | undefined;
    try {
      saved = await idbGet(DB_KEY);
    } catch {
      /* IndexedDB no disponible */
    }
    if (saved?.tools && saved?.device && Object.keys(saved.tools).length > 0) {
      set({ tools: saved.tools, device: syncToolOrder(saved.device), ready: true });
    } else {
      set({ tools: seedTools(), device: seedDevice(), ready: true });
      schedulePersist(get);
    }
  },

  setView: (view) => set({ view }),
  selectTool: (id) => set({ selectedToolId: id, selectedKey: 0 }),
  selectKey: (selectedKey) => set({ selectedKey }),
  setClipboardKey: (clipboardKey) => set({ clipboardKey }),

  updateTool: (id, updater) => {
    const tools = { ...get().tools };
    if (!tools[id]) return;
    tools[id] = updater(tools[id]);
    set({ tools });
    schedulePersist(get);
  },

  renameToolId: (oldId, newId) => {
    const st = get();
    if (oldId === newId) return true;
    if (st.tools[newId]) return false; // id ya en uso
    const tools = { ...st.tools };
    const tool = { ...tools[oldId], id: newId };
    delete tools[oldId];
    tools[newId] = tool;
    const device = syncToolOrder({
      ...st.device,
      slots: (st.device.slots ?? []).map((s) => (s === oldId ? newId : s)),
    });
    set({
      tools,
      device,
      selectedToolId: st.selectedToolId === oldId ? newId : st.selectedToolId,
    });
    schedulePersist(get);
    return true;
  },

  createTool: () => {
    const tools = { ...get().tools };
    let n = 1;
    let id = "new_tool";
    while (tools[id]) id = `new_tool_${++n}`;
    tools[id] = emptyTool(id, "New Tool");
    set({ tools, selectedToolId: id, selectedKey: 0, view: "editor" });
    schedulePersist(get);
    return id;
  },

  duplicateTool: (srcId) => {
    const tools = { ...get().tools };
    const src = tools[srcId];
    if (!src) return srcId;
    let n = 1;
    let id = `${srcId}_copy`;
    while (tools[id]) id = `${srcId}_copy${++n}`;
    tools[id] = { ...structuredClone(src), id, name: `${src.name} (copy)` };
    set({ tools });
    schedulePersist(get);
    return id;
  },

  deleteTool: (id) => {
    const st = get();
    const tools = { ...st.tools };
    delete tools[id];
    const device = syncToolOrder({
      ...st.device,
      slots: (st.device.slots ?? []).map((s) => (s === id ? null : s)),
    });
    set({
      tools,
      device,
      selectedToolId: st.selectedToolId === id ? null : st.selectedToolId,
    });
    schedulePersist(get);
  },

  importTool: (tool) => {
    const tools = { ...get().tools, [tool.id]: tool };
    set({ tools });
    schedulePersist(get);
  },

  updateDevice: (updater) => {
    set({ device: syncToolOrder(updater(get().device)) });
    schedulePersist(get);
  },

  setSlot: (slot, toolId) => {
    if (slot === CTRL_KEY_INDEX) return; // la Ctrl no es asignable
    const st = get();
    const slots = [...(st.device.slots ?? Array(NUM_KEYS).fill(null))];
    slots[slot] = toolId;
    set({ device: syncToolOrder({ ...st.device, slots }) });
    schedulePersist(get);
  },

  toast: (kind, text) => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => get().dismissToast(id), 4200);
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
