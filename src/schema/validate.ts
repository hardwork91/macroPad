// Validación del contrato v1. ÚNICA fuente de verdad: la usan la
// importación, la edición en vivo y el gate de sincronización.
// Estructura con zod + pasada semántica propia (referencias cruzadas,
// sugerencias de typos, acoplamiento tool<->device).

import { z } from "zod";
import {
  DeviceConfig,
  KeyDef,
  KeySnippet,
  NUM_KEYS,
  CTRL_KEY_INDEX,
  SCHEMA_VERSION,
  KnownKeyDef,
  ToolFile,
  implicitVarsFor,
  isKnownKeyType,
} from "./types";

export interface Issue {
  level: "error" | "warning";
  /** Ruta legible, p.ej. "keys[3]" o "vars.octave". */
  path: string;
  /** Clave i18n del mensaje. */
  msgKey: string;
  params?: Record<string, string | number>;
}

export interface ToolValidation {
  issues: Issue[];
  /** Tool normalizada si la estructura es utilizable (aunque haya warnings). */
  tool: ToolFile | null;
}
export interface DeviceValidation {
  issues: Issue[];
  device: DeviceConfig | null;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === "error");

// ---------- esquemas zod (estructura) ----------

const hexColor = z.string().regex(/^[0-9A-Fa-f]{6}$/);
const midiVal = z.number().int().min(0).max(127);

const varDefSchema = z
  .object({
    init: z.number().int(),
    min: z.number().int(),
    max: z.number().int().optional(),
    wrap: z.boolean().optional(),
    maxVar: z.string().optional(),
    maxOffset: z.number().int().optional(),
  })
  .passthrough();

const indicateSchema = z.object({
  var: z.string(),
  color: hexColor,
  holdMs: z.number().int().min(0).optional(),
});

const setterSchema = z.object({
  var: z.string(),
  delta: z.number().int().optional(),
  value: z.number().int().optional(),
});

const keySchemas: Record<string, z.ZodTypeAny> = {
  none: z.object({ type: z.literal("none") }).passthrough(),
  note: z.object({ type: z.literal("note"), note: midiVal, color: hexColor }).passthrough(),
  scale_note: z
    .object({ type: z.literal("scale_note"), degree: z.number().int().min(0).max(13), color: hexColor })
    .passthrough(),
  chord: z
    .object({ type: z.literal("chord"), degree: z.number().int().min(0).max(13), color: hexColor })
    .passthrough(),
  cc: z
    .object({
      type: z.literal("cc"),
      cc: midiVal,
      behavior: z.enum(["momentary", "toggle"]),
      pressValue: midiVal.optional(),
      releaseValue: midiVal.optional(),
      onValue: midiVal.optional(),
      offValue: midiVal.optional(),
      color: hexColor,
    })
    .passthrough(),
  param: z
    .object({
      type: z.literal("param"),
      set: z.array(setterSchema).min(1),
      indicate: indicateSchema.optional(),
      flash: hexColor.optional(),
      limitFlash: hexColor.optional(),
    })
    .passthrough(),
};

const toolShapeSchema = z
  .object({
    schemaVersion: z.number(),
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string().min(1),
    author: z.string().optional(),
    color: hexColor,
    onEnter: z.object({ indicate: indicateSchema }).optional(),
    vars: z.record(varDefSchema).optional(),
    keys: z.array(z.unknown()),
  })
  .passthrough();

const deviceShapeSchema = z
  .object({
    schemaVersion: z.number(),
    midiChannel: z.number().int().min(1).max(16),
    velocity: z.number().int().min(1).max(127),
    brightness: z.number().int().min(0).max(255),
    toolOrder: z.array(z.string()),
    slots: z.array(z.string().nullable()).optional(),
    toolSwitch: z
      .object({ keys: z.array(z.number().int().min(0).max(15)).length(2), holdMs: z.number().int().min(100) })
      .optional(),
    scaleOrder: z.array(z.string()).min(1),
    scales: z.record(z.array(z.number().int().min(0).max(24)).length(7)),
  })
  .passthrough();

// ---------- utilidades ----------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return d[m][n];
}

/** Sugerencia "¿quisiste decir X?" para nombres con typo. */
export function suggestName(bad: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = 3; // solo sugerimos typos cercanos
  for (const c of candidates) {
    const dist = levenshtein(bad.toLowerCase(), c.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

function zodIssues(err: z.ZodError, basePath = ""): Issue[] {
  return err.issues.map((zi) => ({
    level: "error" as const,
    path: basePath + zi.path.map((p) => (typeof p === "number" ? `[${p}]` : (basePath || zi.path[0] !== p ? "." : "") + p)).join(""),
    msgKey: "val.structural",
    params: { detail: zi.message },
  }));
}

function missingVarIssue(path: string, name: string, candidates: string[]): Issue {
  const suggestion = suggestName(name, candidates);
  return suggestion
    ? { level: "error", path, msgKey: "val.varMissingSuggest", params: { name, suggestion } }
    : { level: "error", path, msgKey: "val.varMissing", params: { name } };
}

// ---------- validación de tool ----------

export function validateTool(json: unknown, device?: DeviceConfig | null): ToolValidation {
  const issues: Issue[] = [];

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { issues: [{ level: "error", path: "", msgKey: "val.notObject" }], tool: null };
  }

  const sv = (json as { schemaVersion?: unknown }).schemaVersion;
  if (sv !== SCHEMA_VERSION) {
    return {
      issues: [{ level: "error", path: "schemaVersion", msgKey: "val.badVersion", params: { version: String(sv ?? "?") } }],
      tool: null,
    };
  }

  const shape = toolShapeSchema.safeParse(json);
  if (!shape.success) {
    return { issues: zodIssues(shape.error), tool: null };
  }

  const tool = { vars: {}, ...shape.data } as ToolFile;
  const varNames = Object.keys(tool.vars);

  // --- vars ---
  for (const [name, def] of Object.entries(tool.vars)) {
    const path = `vars.${name}`;
    if (def.max === undefined && def.maxVar === undefined) {
      issues.push({ level: "error", path, msgKey: "val.varNeedsMax", params: { name } });
    }
    if (def.maxVar !== undefined) {
      if (!(def.maxVar in tool.vars)) {
        issues.push(missingVarIssue(`${path}.maxVar`, def.maxVar, varNames));
      } else if (def.maxVar === name) {
        issues.push({ level: "error", path: `${path}.maxVar`, msgKey: "val.maxVarSelf", params: { name } });
      }
    }
    if (def.max !== undefined && def.max < def.min) {
      issues.push({ level: "error", path, msgKey: "val.maxBelowMin", params: { name } });
    }
    if (def.max !== undefined && (def.init < def.min || def.init > def.max)) {
      issues.push({ level: "warning", path, msgKey: "val.initOutOfRange", params: { name } });
    }
  }

  // --- keys ---
  if (tool.keys.length !== NUM_KEYS) {
    issues.push({
      level: "error",
      path: "keys",
      msgKey: "val.keysLength",
      params: { count: tool.keys.length, expected: NUM_KEYS },
    });
  }

  const normalizedKeys: KeyDef[] = [];
  tool.keys.forEach((raw, i) => {
    const path = `keys[${i}]`;
    const keyNo = i + 1;
    if (typeof raw !== "object" || raw === null || typeof (raw as { type?: unknown }).type !== "string") {
      issues.push({ level: "error", path, msgKey: "val.keyNotObject", params: { key: keyNo } });
      normalizedKeys.push({ type: "none" });
      return;
    }
    const type = (raw as { type: string }).type;

    if (!isKnownKeyType(type)) {
      // Primitiva de un firmware más nuevo: advertir, conservar, no bloquear.
      issues.push({ level: "warning", path, msgKey: "val.unknownType", params: { key: keyNo, type } });
      normalizedKeys.push(raw as KeyDef);
      return;
    }

    const parsed = keySchemas[type].safeParse(raw);
    if (!parsed.success) {
      issues.push(...zodIssues(parsed.error, path).map((iss) => ({ ...iss, params: { ...iss.params, key: keyNo } })));
      normalizedKeys.push(raw as KeyDef);
      return;
    }
    const key = parsed.data as KnownKeyDef;
    normalizedKeys.push(key);

    // Referencias explícitas a vars
    if (key.type === "param") {
      key.set.forEach((s, j) => {
        if (!(s.var in tool.vars)) {
          issues.push(missingVarIssue(`${path}.set[${j}]`, s.var, varNames));
        }
        if (s.delta === undefined && s.value === undefined) {
          issues.push({ level: "error", path: `${path}.set[${j}]`, msgKey: "val.setterEmpty", params: { key: keyNo } });
        }
        if (s.delta !== undefined && s.value !== undefined) {
          issues.push({ level: "warning", path: `${path}.set[${j}]`, msgKey: "val.setterBoth", params: { key: keyNo } });
        }
      });
      if (key.indicate && !(key.indicate.var in tool.vars)) {
        issues.push(missingVarIssue(`${path}.indicate`, key.indicate.var, varNames));
      }
      if (key.indicate && key.flash) {
        issues.push({ level: "warning", path, msgKey: "val.paramBothFeedback", params: { key: keyNo } });
      }
    }

    // Vars implícitas de la primitiva (el firmware usa defaults si faltan)
    for (const v of implicitVarsFor(type)) {
      if (!(v in tool.vars)) {
        issues.push({ level: "warning", path, msgKey: "val.implicitVarMissing", params: { key: keyNo, name: v } });
      }
    }
  });
  tool.keys = normalizedKeys;

  // --- onEnter ---
  if (tool.onEnter && !(tool.onEnter.indicate.var in tool.vars)) {
    issues.push(missingVarIssue("onEnter.indicate", tool.onEnter.indicate.var, varNames));
  }

  // --- acoplamiento con device: la var 'scale' indexa scaleOrder ---
  if (device && tool.vars.scale) {
    const numScales = device.scaleOrder.length;
    const def = tool.vars.scale;
    if (def.max !== undefined && def.max > numScales - 1) {
      issues.push({
        level: "warning",
        path: "vars.scale",
        msgKey: "val.scaleRange",
        params: { max: def.max, numScales },
      });
    }
  }

  return { issues, tool };
}

// ---------- validación de device ----------

export function validateDevice(json: unknown, knownToolIds?: string[]): DeviceValidation {
  const issues: Issue[] = [];

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { issues: [{ level: "error", path: "", msgKey: "val.notObject" }], device: null };
  }
  const sv = (json as { schemaVersion?: unknown }).schemaVersion;
  if (sv !== SCHEMA_VERSION) {
    return {
      issues: [{ level: "error", path: "schemaVersion", msgKey: "val.badVersion", params: { version: String(sv ?? "?") } }],
      device: null,
    };
  }

  const shape = deviceShapeSchema.safeParse(json);
  if (!shape.success) {
    return { issues: zodIssues(shape.error), device: null };
  }
  const device = shape.data as DeviceConfig;

  for (const name of device.scaleOrder) {
    if (!(name in device.scales)) {
      const suggestion = suggestName(name, Object.keys(device.scales));
      issues.push(
        suggestion
          ? { level: "error", path: "scaleOrder", msgKey: "val.scaleMissingSuggest", params: { name, suggestion } }
          : { level: "error", path: "scaleOrder", msgKey: "val.scaleMissing", params: { name } },
      );
    }
  }

  if (device.slots) {
    if (device.slots.length !== NUM_KEYS) {
      issues.push({
        level: "error",
        path: "slots",
        msgKey: "val.slotsLength",
        params: { count: device.slots.length, expected: NUM_KEYS },
      });
    }
    if (device.slots[CTRL_KEY_INDEX] != null) {
      issues.push({ level: "warning", path: `slots[${CTRL_KEY_INDEX}]`, msgKey: "val.ctrlSlotReserved" });
    }
    if (knownToolIds) {
      device.slots.forEach((id, i) => {
        if (id != null && !knownToolIds.includes(id)) {
          issues.push({ level: "warning", path: `slots[${i}]`, msgKey: "val.slotUnknownTool", params: { id, slot: i + 1 } });
        }
      });
    }
  }

  if (knownToolIds) {
    for (const id of device.toolOrder) {
      if (!knownToolIds.includes(id)) {
        issues.push({ level: "warning", path: "toolOrder", msgKey: "val.slotUnknownTool", params: { id, slot: "-" } });
      }
    }
  }

  return { issues, device };
}

// ---------- snippets de tecla ----------

export function validateSnippet(json: unknown): { issues: Issue[]; snippet: KeySnippet | null } {
  const issues: Issue[] = [];
  if (typeof json !== "object" || json === null) {
    return { issues: [{ level: "error", path: "", msgKey: "val.notObject" }], snippet: null };
  }
  const o = json as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_VERSION || o.keySnippet !== true || typeof o.key !== "object" || o.key === null) {
    return { issues: [{ level: "error", path: "", msgKey: "val.notSnippet" }], snippet: null };
  }
  const key = o.key as KeyDef;
  if (typeof key.type !== "string") {
    return { issues: [{ level: "error", path: "key", msgKey: "val.keyNotObject", params: { key: "-" } }], snippet: null };
  }
  if (key.type !== "none" && isKnownKeyType(key.type)) {
    const parsed = keySchemas[key.type].safeParse(key);
    if (!parsed.success) return { issues: zodIssues(parsed.error, "key"), snippet: null };
  } else if (!isKnownKeyType(key.type)) {
    issues.push({ level: "warning", path: "key", msgKey: "val.unknownType", params: { key: "-", type: key.type } });
  }
  const requiredVars = (o.requiredVars ?? {}) as KeySnippet["requiredVars"];
  return { issues, snippet: { schemaVersion: SCHEMA_VERSION, keySnippet: true, key, requiredVars } };
}
