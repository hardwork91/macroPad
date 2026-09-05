// Intérprete de tools en TypeScript: espejo exacto de la semántica del
// firmware (tool_interpreter_esp32s3.ino). Lo usa la vista "En vivo"
// para traducir eventos de tecla en mensajes MIDI legibles.

import { DeviceConfig, KeyCC, KeyChord, KeyNote, KeyParam, KeyScaleNote, ToolFile, VarDef } from "../schema/types";

export interface MidiEvent {
  kind: "noteOn" | "noteOff" | "cc";
  note?: number;
  cc?: number;
  value?: number;
  channel: number;
}

export interface LogEntry {
  /** Clave i18n de la etiqueta ("live.chord", "live.note"...). */
  labelKey: string;
  /** Texto ya formateado ("C4 · E4 · G4", "CC 20 = 127"...). */
  text: string;
  keyIndex: number;
  color?: string;
}

export interface LiveState {
  vars: Record<string, number>;
  toggles: boolean[];
  activeNotes: number[][];
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function noteName(n: number): string {
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

export function initLiveState(tool: ToolFile): LiveState {
  const vars: Record<string, number> = {};
  for (const [name, def] of Object.entries(tool.vars)) vars[name] = def.init;
  return {
    vars,
    toggles: Array(16).fill(false),
    activeNotes: Array.from({ length: 16 }, () => []),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function scaleInterval(device: DeviceConfig, scaleIdx: number, degree: number): number {
  const order = device.scaleOrder;
  const idx = scaleIdx >= 0 && scaleIdx < order.length ? scaleIdx : 0;
  const table = device.scales[order[idx]] ?? [0, 2, 4, 5, 7, 9, 11];
  const octave = Math.floor(degree / 7);
  return table[degree % 7] + 12 * octave;
}

function effectiveMax(def: VarDef, vars: Record<string, number>): number {
  if (def.maxVar !== undefined) return (vars[def.maxVar] ?? 0) + (def.maxOffset ?? 0);
  return def.max ?? 127;
}

function revalidateVars(tool: ToolFile, vars: Record<string, number>) {
  for (const [name, def] of Object.entries(tool.vars)) {
    if (def.maxVar === undefined) continue;
    const v = vars[name] ?? 0;
    if (v > effectiveMax(def, vars) || v < def.min) vars[name] = def.min;
  }
}

/** Aplica un setter; devuelve true si chocó con un límite (flash rojo). */
function applyVarChange(tool: ToolFile, vars: Record<string, number>, name: string, setter: { delta?: number; value?: number }): boolean {
  const def = tool.vars[name];
  if (!def) return true;
  let v = vars[name] ?? 0;
  const mn = def.min;
  const mx = effectiveMax(def, vars);
  let hitLimit = false;

  if (setter.value !== undefined) v = setter.value;
  else v += setter.delta ?? 0;

  if (v > mx) {
    if (def.wrap) v = mn;
    else {
      v = mx;
      hitLimit = true;
    }
  }
  if (v < mn) {
    if (def.wrap) v = mx;
    else {
      v = mn;
      hitLimit = true;
    }
  }
  vars[name] = v;
  revalidateVars(tool, vars);
  return hitLimit;
}

const getVar = (st: LiveState, name: string, fallback: number) => st.vars[name] ?? fallback;

export interface PressResult {
  events: MidiEvent[];
  log: LogEntry | null;
  /** Color LED que la tecla enciende mientras está presionada (hex o null). */
  ledColor: string | null;
}

export function pressKey(tool: ToolFile, device: DeviceConfig, st: LiveState, i: number): PressResult {
  const key = tool.keys[i];
  const ch = device.midiChannel;
  const vel = device.velocity;
  if (!key) return { events: [], log: null, ledColor: null };

  switch (key.type) {
    case "note": {
      const k = key as KeyNote;
      const n = clamp(k.note + 12 * getVar(st, "octave", 0), 0, 127);
      st.activeNotes[i] = [n];
      return {
        events: [{ kind: "noteOn", note: n, value: vel, channel: ch }],
        log: { labelKey: "live.note", text: `${noteName(n)} (${n})`, keyIndex: i, color: k.color },
        ledColor: k.color,
      };
    }
    case "scale_note": {
      const k = key as KeyScaleNote;
      const n = clamp(
        getVar(st, "root", 60) + scaleInterval(device, getVar(st, "scale", 0), k.degree) + 12 * getVar(st, "octave", 0),
        0,
        127,
      );
      st.activeNotes[i] = [n];
      return {
        events: [{ kind: "noteOn", note: n, value: vel, channel: ch }],
        log: { labelKey: "live.note", text: `${noteName(n)} (${n})`, keyIndex: i, color: k.color },
        ledColor: k.color,
      };
    }
    case "chord": {
      const k = key as KeyChord;
      const baseDegree = getVar(st, "degree", 0) + k.degree;
      const voices = Math.min(getVar(st, "voices", 3), 6);
      const inversion = getVar(st, "inversion", 0);
      const root = getVar(st, "root", 60);
      const octave = getVar(st, "octave", 0);
      const scaleIdx = getVar(st, "scale", 0);

      const notes: number[] = [];
      for (let v = 0; v < voices; v++) {
        let n = root + scaleInterval(device, scaleIdx, baseDegree + v * 2) + 12 * octave;
        if (v < inversion) n += 12;
        notes.push(clamp(n, 0, 127));
      }
      st.activeNotes[i] = notes;
      return {
        events: notes.map((n) => ({ kind: "noteOn" as const, note: n, value: vel, channel: ch })),
        log: { labelKey: "live.chord", text: notes.map(noteName).join(" · "), keyIndex: i, color: k.color },
        ledColor: k.color,
      };
    }
    case "cc": {
      const k = key as KeyCC;
      if (k.behavior === "toggle") {
        const on = !st.toggles[i];
        st.toggles[i] = on;
        const value = on ? (k.onValue ?? 127) : (k.offValue ?? 0);
        return {
          events: [{ kind: "cc", cc: k.cc, value, channel: ch }],
          log: { labelKey: on ? "live.ccOn" : "live.ccOff", text: `CC ${k.cc} = ${value}`, keyIndex: i, color: k.color },
          ledColor: on ? k.color : null,
        };
      }
      const value = k.pressValue ?? 127;
      return {
        events: [{ kind: "cc", cc: k.cc, value, channel: ch }],
        log: { labelKey: "live.cc", text: `CC ${k.cc} = ${value}`, keyIndex: i, color: k.color },
        ledColor: k.color,
      };
    }
    case "param": {
      const k = key as KeyParam;
      let hitLimit = false;
      for (const s of k.set) hitLimit = applyVarChange(tool, st.vars, s.var, s) || hitLimit;
      const text = k.set.map((s) => `${s.var} = ${st.vars[s.var] ?? "?"}`).join(", ");
      return {
        events: [],
        log: { labelKey: hitLimit ? "live.paramLimit" : "live.param", text, keyIndex: i, color: k.flash },
        ledColor: null,
      };
    }
    default:
      return { events: [], log: null, ledColor: null };
  }
}

export function releaseKey(tool: ToolFile, device: DeviceConfig, st: LiveState, i: number): MidiEvent[] {
  const key = tool.keys[i];
  const ch = device.midiChannel;
  if (!key) return [];

  if (key.type === "cc") {
    const k = key as KeyCC;
    if (k.behavior === "momentary") {
      return [{ kind: "cc", cc: k.cc, value: k.releaseValue ?? 0, channel: ch }];
    }
    return [];
  }

  const notes = st.activeNotes[i];
  st.activeNotes[i] = [];
  return notes.map((n) => ({ kind: "noteOff" as const, note: n, value: 0, channel: ch }));
}
