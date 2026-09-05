// Contrato de datos v1 — espejo de lo que interpreta el firmware
// (tool_interpreter_esp32s3.ino). Única fuente de verdad de tipos.

export const SCHEMA_VERSION = 1;
export const NUM_KEYS = 16;
export const CTRL_KEY_INDEX = 15; // tecla 16 = Ctrl (selector de tools)
export const GRID_ROWS = 2;
export const GRID_COLS = 8;

/** Color hex RRGGBB sin '#', como lo consume el firmware. */
export type HexColor = string;

export interface VarDef {
  init: number;
  min: number;
  max?: number;
  wrap?: boolean;
  /** Máximo dinámico: valor(maxVar) + maxOffset. */
  maxVar?: string;
  maxOffset?: number;
}

export interface IndicateSpec {
  var: string;
  color: HexColor;
  holdMs?: number;
}

export interface ParamSetter {
  var: string;
  delta?: number;
  value?: number;
}

export interface KeyNone {
  type: "none";
}
export interface KeyNote {
  type: "note";
  note: number;
  color: HexColor;
}
export interface KeyScaleNote {
  type: "scale_note";
  degree: number;
  color: HexColor;
}
export interface KeyChord {
  type: "chord";
  degree: number;
  color: HexColor;
}
export interface KeyCC {
  type: "cc";
  cc: number;
  behavior: "momentary" | "toggle";
  pressValue?: number;
  releaseValue?: number;
  onValue?: number;
  offValue?: number;
  color: HexColor;
}
export interface KeyParam {
  type: "param";
  set: ParamSetter[];
  indicate?: IndicateSpec;
  flash?: HexColor;
  limitFlash?: HexColor;
}
/** Primitiva de un firmware más nuevo: se conserva, se avisa, no se rompe. */
export interface KeyUnknown {
  type: string;
  [k: string]: unknown;
}

export type KnownKeyDef = KeyNone | KeyNote | KeyScaleNote | KeyChord | KeyCC | KeyParam;
export type KeyDef = KnownKeyDef | KeyUnknown;

export const KNOWN_KEY_TYPES = ["none", "note", "scale_note", "chord", "cc", "param"] as const;
export type KnownKeyType = (typeof KNOWN_KEY_TYPES)[number];

export function isKnownKeyType(t: string): t is KnownKeyType {
  return (KNOWN_KEY_TYPES as readonly string[]).includes(t);
}

export interface ToolFile {
  schemaVersion: number;
  id: string;
  name: string;
  author?: string;
  color: HexColor;
  onEnter?: { indicate: IndicateSpec };
  vars: Record<string, VarDef>;
  keys: KeyDef[];
}

export interface DeviceConfig {
  schemaVersion: number;
  midiChannel: number;
  velocity: number;
  brightness: number;
  /** Legado: orden de ciclado del firmware actual. La web lo sincroniza con slots. */
  toolOrder: string[];
  /** Modelo destino: asignación Ctrl+tecla -> tool. 16 entradas, la 15 siempre null. */
  slots?: (string | null)[];
  toolSwitch?: { keys: number[]; holdMs: number };
  scaleOrder: string[];
  scales: Record<string, number[]>;
}

export interface KeySnippet {
  schemaVersion: number;
  keySnippet: true;
  key: KeyDef;
  requiredVars: Record<string, VarDef>;
}

/** Vars con significado reservado que las primitivas leen implícitamente. */
export const RESERVED_VARS = ["octave", "root", "scale", "degree", "voices", "inversion"] as const;

/** Vars que cada primitiva lee implícitamente (para snippets y validación). */
export function implicitVarsFor(type: string): string[] {
  switch (type) {
    case "note":
      return ["octave"];
    case "scale_note":
      return ["root", "scale", "octave"];
    case "chord":
      return ["root", "scale", "octave", "degree", "voices", "inversion"];
    default:
      return [];
  }
}

/** Todas las vars que una tecla referencia (explícitas + implícitas + cadena maxVar). */
export function referencedVars(key: KeyDef, vars: Record<string, VarDef>): string[] {
  const out = new Set<string>(implicitVarsFor(key.type));
  if (key.type === "param") {
    const p = key as KeyParam;
    for (const s of p.set ?? []) if (s.var) out.add(s.var);
    if (p.indicate?.var) out.add(p.indicate.var);
  }
  // Cierre transitivo de maxVar (p.ej. inversion depende de voices)
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of [...out]) {
      const mv = vars[name]?.maxVar;
      if (mv && !out.has(mv)) {
        out.add(mv);
        grew = true;
      }
    }
  }
  return [...out];
}

export function emptyTool(id: string, name: string): ToolFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    author: "",
    color: "7C8CF8",
    vars: {},
    keys: Array.from({ length: NUM_KEYS }, () => ({ type: "none" }) as KeyDef),
  };
}
