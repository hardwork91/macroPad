// Contrato de datos — espejo de lo que interpreta el firmware.
// Única fuente de verdad de tipos.
//
// v1: primitivas reactivas (pulsar/soltar). Sigue siendo válido.
// v2: añade noción de tiempo (reloj esclavo), secuenciador de frase
//     generativa, vars con listas de valores discretos y el patrón
//     de interacción "mantener modificador + tecla elige valor".

export const SCHEMA_VERSION = 2;
export const SUPPORTED_SCHEMA_VERSIONS = [1, 2] as const;
export const NUM_KEYS = 16;
export const CTRL_KEY_INDEX = 15; // tecla 16 = Ctrl (selector de tools)
export const GRID_ROWS = 2;
export const GRID_COLS = 8;

/** Tope de pasos de una frase generativa (GENERATIVE_MAX_STEPS del firmware). */
export const MAX_SEQ_STEPS = 8;

/** Color hex RRGGBB sin '#', como lo consume el firmware. */
export type HexColor = string;

// ---------------------------------------------------------------- vars

export interface VarDef {
  /** Con `values`, es el índice inicial dentro de la lista. Si no, el valor. */
  init: number;
  min?: number;
  max?: number;
  wrap?: boolean;
  /** Máximo dinámico: valor(maxVar) + maxOffset. */
  maxVar?: string;
  maxOffset?: number;
  /**
   * v2 — lista de valores discretos. La variable guarda el ÍNDICE (0..n-1),
   * así un delta de ±1 avanza por la lista. Quien la lee obtiene values[idx].
   * Excluyente con min/max/maxVar.
   */
  values?: (number | string)[];
}

export const isListVar = (def: VarDef): boolean => Array.isArray(def.values);

/** Valor efectivo de una var: resuelve la indirección de `values`. */
export function resolveVarValue(def: VarDef, raw: number): number | string {
  if (!def.values) return raw;
  const i = Math.min(Math.max(raw, 0), def.values.length - 1);
  return def.values[i];
}

// ---------------------------------------------------------------- reloj

/** Duraciones musicales admitidas, en pulsos de reloj MIDI (24 PPQN). */
export const RATE_CLOCKS: Record<string, number> = {
  "1/1": 96,
  "1/2": 48,
  "1/4": 24,
  "1/8": 12,
  "1/16": 6,
  "1/32": 3,
};
export const RATE_NAMES = Object.keys(RATE_CLOCKS);

export interface ClockConfig {
  /** external = esclavo de los 0xF8 entrantes; internal = reloj propio. */
  source: "external" | "internal";
  /** Sólo con source "internal". */
  bpm?: number;
  /** Reemitir el reloj por las salidas. */
  sendClock?: boolean;
}

// ---------------------------------------------------------------- primitivas

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
export interface ParamSetter {
  var: string;
  delta?: number;
  value?: number;
}
export interface IndicateSpec {
  var: string;
  color: HexColor;
  holdMs?: number;
}
export interface KeyParam {
  type: "param";
  set: ParamSetter[];
  indicate?: IndicateSpec;
  flash?: HexColor;
  limitFlash?: HexColor;
}

// ---- v2 ----

/** Tecla que representa un paso de la frase del secuenciador. */
export interface KeySeqStep {
  type: "seq_step";
  step: number;
  color: HexColor;
  /** Color cuando el cabezal de reproducción pasa por este paso. */
  playheadColor?: HexColor;
}

/** Acción sobre el secuenciador. */
export interface KeySeqAction {
  type: "seq_action";
  action: "regenerate" | "start" | "stop" | "toggle";
  color: HexColor;
}

/**
 * Modificador: mientras se mantiene pulsada, las primeras N teclas
 * (N = nº de valores de la var) eligen el valor de `var`.
 * Es el patrón "Hold Button 11 + 1-5" del sketch original.
 */
export interface KeyHoldSelect {
  type: "hold_select";
  var: string;
  color: HexColor;
  /** Color de la tecla que representa el valor activo. */
  selectedColor?: HexColor;
}

/**
 * Modificador: mientras se mantiene, las teclas de paso asignan o
 * quitan un adorno a ese paso (los ratchets de 12 y 8 golpes).
 */
export interface KeyHoldAssign {
  type: "hold_assign";
  target: "ratchet";
  /** Valor a asignar: nº de golpes del ratchet. */
  value: number;
  color: HexColor;
}

/** Primitiva de un firmware más nuevo: se conserva, se avisa, no se rompe. */
export interface KeyUnknown {
  type: string;
  [k: string]: unknown;
}

export type KnownKeyDef =
  | KeyNone
  | KeyNote
  | KeyScaleNote
  | KeyChord
  | KeyCC
  | KeyParam
  | KeySeqStep
  | KeySeqAction
  | KeyHoldSelect
  | KeyHoldAssign;
export type KeyDef = KnownKeyDef | KeyUnknown;

export const KEY_TYPES_V1 = ["none", "note", "scale_note", "chord", "cc", "param"] as const;
export const KEY_TYPES_V2 = ["seq_step", "seq_action", "hold_select", "hold_assign"] as const;
export const KNOWN_KEY_TYPES = [...KEY_TYPES_V1, ...KEY_TYPES_V2] as const;

export type KnownKeyType = (typeof KNOWN_KEY_TYPES)[number];

export function isKnownKeyType(t: string): t is KnownKeyType {
  return (KNOWN_KEY_TYPES as readonly string[]).includes(t);
}

/** Una primitiva que sólo existe a partir de v2. */
export function keyTypeMinVersion(t: string): number {
  return (KEY_TYPES_V2 as readonly string[]).includes(t) ? 2 : 1;
}

// ---------------------------------------------------------------- secuenciador

/** Referencia a escala: fija por nombre, o elegida por una var. */
export type ScaleRef = { name: string } | { var: string };
/** Raíz: pitch class fijo (0-11), o elegido por una var. */
export type RootRef = { pitchClass: number } | { var: string };

export interface SequencerSpec {
  /** Única forma en v2: frase de notas crudas cuantizadas a escala. */
  type: "phrase";
  /** Tope de pasos que la tool puede usar (<= MAX_SEQ_STEPS). */
  maxSteps: number;
  /** Rango de notas crudas de las que se genera la frase. */
  noteRange: [number, number];
  /** Var que fija la longitud viva de la frase. */
  steps: string;
  /** Var (tipo lista, valores de RATE_NAMES) que fija la velocidad. */
  rate: string;
  /** Var (tipo lista) con la transposición en semitonos. */
  transpose?: string;
  scale: ScaleRef;
  root: RootRef;
  /** Porcentaje del slot que suena la nota, o var tipo lista con duraciones. */
  gate: { percent: number } | { var: string };
  /** Var (tipo lista) con la probabilidad 0-100 de mutar una nota por ciclo. */
  mutation?: string;
  /** Var (tipo lista) con la probabilidad 0-100 de sostener/silenciar pasos. */
  hold?: string;
  /** Adorno de repetición rápida por paso. */
  ratchet?: {
    /** Nº de golpes disponibles para asignar (p. ej. [12, 8]). */
    hits: number[];
    /** Rampa lineal de velocity a lo largo de la ráfaga. */
    velocityRamp: [number, number];
  };
}

// ---------------------------------------------------------------- ficheros

export interface ToolFile {
  schemaVersion: number;
  id: string;
  name: string;
  author?: string;
  color: HexColor;
  onEnter?: { indicate: IndicateSpec };
  onExit?: { allNotesOff?: boolean };
  vars: Record<string, VarDef>;
  keys: KeyDef[];
  /** v2 — presente sólo en tools con secuenciador. */
  sequencer?: SequencerSpec;
}

export interface DeviceConfig {
  schemaVersion: number;
  midiChannel: number;
  velocity: number;
  brightness: number;
  /** Legado: orden de ciclado del firmware antiguo. La web lo sincroniza. */
  toolOrder: string[];
  /** Asignación Ctrl+tecla -> tool. 16 entradas, la 15 siempre null. */
  slots?: (string | null)[];
  toolSwitch?: { keys: number[]; holdMs: number };
  scaleOrder: string[];
  /** v2: longitud variable (5-12). v1 exigía exactamente 7. */
  scales: Record<string, number[]>;
  /** v2 — configuración de reloj y transporte. */
  clock?: ClockConfig;
  /** v2 — a qué salidas va el MIDI generado. */
  midiOut?: { usb?: boolean; trs?: boolean };
}

export interface KeySnippet {
  schemaVersion: number;
  keySnippet: true;
  key: KeyDef;
  requiredVars: Record<string, VarDef>;
}

// ---------------------------------------------------------------- vars implícitas

/** Vars con significado reservado que las primitivas leen implícitamente. */
export const RESERVED_VARS = ["octave", "root", "scale", "degree", "voices", "inversion"] as const;

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
  if (key.type === "hold_select") {
    const h = key as KeyHoldSelect;
    if (h.var) out.add(h.var);
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

/** Vars que el bloque `sequencer` referencia. */
export function sequencerVars(seq: SequencerSpec | undefined): string[] {
  if (!seq) return [];
  const out: string[] = [seq.steps, seq.rate];
  if (seq.transpose) out.push(seq.transpose);
  if (seq.mutation) out.push(seq.mutation);
  if (seq.hold) out.push(seq.hold);
  if ("var" in seq.scale) out.push(seq.scale.var);
  if ("var" in seq.root) out.push(seq.root.var);
  if ("var" in seq.gate) out.push(seq.gate.var);
  return out.filter(Boolean);
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
