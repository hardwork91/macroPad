// Validación del contrato. ÚNICA fuente de verdad: la usan la
// importación, la edición en vivo y el gate de sincronización.
// Estructura con zod + pasada semántica propia (referencias cruzadas,
// sugerencias de typos, acoplamiento tool<->device, coherencia de versión).

import { z } from "zod";
import {
  CTRL_KEY_INDEX,
  DeviceConfig,
  GRID_COLS,
  KeyDef,
  KeyHoldSelect,
  KeyParam,
  KeySeqStep,
  KeySnippet,
  KnownKeyDef,
  MAX_SEQ_STEPS,
  NUM_KEYS,
  RATE_NAMES,
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  SequencerSpec,
  ToolFile,
  implicitVarsFor,
  isKnownKeyType,
  keyTypeMinVersion,
  sequencerVars,
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
const probability = z.number().int().min(0).max(100);

const varDefSchema = z
  .object({
    init: z.number().int(),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
    wrap: z.boolean().optional(),
    maxVar: z.string().optional(),
    maxOffset: z.number().int().optional(),
    values: z.array(z.union([z.number(), z.string()])).min(1).optional(),
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
  // ---- v2 ----
  seq_step: z
    .object({
      type: z.literal("seq_step"),
      step: z.number().int().min(0).max(MAX_SEQ_STEPS - 1),
      color: hexColor,
      playheadColor: hexColor.optional(),
    })
    .passthrough(),
  seq_action: z
    .object({
      type: z.literal("seq_action"),
      action: z.enum(["regenerate", "start", "stop", "toggle"]),
      color: hexColor,
    })
    .passthrough(),
  hold_select: z
    .object({
      type: z.literal("hold_select"),
      var: z.string(),
      color: hexColor,
      selectedColor: hexColor.optional(),
    })
    .passthrough(),
  hold_assign: z
    .object({
      type: z.literal("hold_assign"),
      target: z.literal("ratchet"),
      value: z.number().int().min(1).max(32),
      color: hexColor,
    })
    .passthrough(),
};

const scaleRefSchema = z.union([z.object({ name: z.string() }), z.object({ var: z.string() })]);
const rootRefSchema = z.union([
  z.object({ pitchClass: z.number().int().min(0).max(11) }),
  z.object({ var: z.string() }),
]);

const sequencerSchema = z
  .object({
    type: z.literal("phrase"),
    maxSteps: z.number().int().min(1).max(MAX_SEQ_STEPS),
    noteRange: z.tuple([midiVal, midiVal]),
    steps: z.string(),
    rate: z.string(),
    transpose: z.string().optional(),
    scale: scaleRefSchema,
    root: rootRefSchema,
    gate: z.union([z.object({ percent: probability }), z.object({ var: z.string() })]),
    mutation: z.string().optional(),
    hold: z.string().optional(),
    ratchet: z
      .object({
        hits: z.array(z.number().int().min(1).max(32)).min(1),
        velocityRamp: z.tuple([midiVal, midiVal]),
      })
      .optional(),
  })
  .passthrough();

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
    sequencer: sequencerSchema.optional(),
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
    scales: z.record(z.array(z.number().int().min(0).max(24)).min(5).max(12)),
    clock: z
      .object({
        source: z.enum(["external", "internal"]),
        bpm: z.number().int().min(20).max(400).optional(),
        sendClock: z.boolean().optional(),
      })
      .optional(),
    midiOut: z.object({ usb: z.boolean().optional(), trs: z.boolean().optional() }).optional(),
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
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

export function suggestName(bad: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = 3;
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
    path:
      basePath +
      zi.path
        .map((p) => (typeof p === "number" ? `[${p}]` : (basePath || zi.path[0] !== p ? "." : "") + p))
        .join(""),
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
  if (typeof sv !== "number" || !(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(sv)) {
    return {
      issues: [
        {
          level: "error",
          path: "schemaVersion",
          msgKey: "val.badVersion",
          params: { version: String(sv ?? "?"), supported: SUPPORTED_SCHEMA_VERSIONS.join(", ") },
        },
      ],
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

    if (def.values) {
      // Var de lista: el valor es un índice dentro de values.
      if (def.min !== undefined || def.max !== undefined || def.maxVar !== undefined) {
        issues.push({ level: "error", path, msgKey: "val.varValuesAndRange", params: { name } });
      }
      if (def.init < 0 || def.init >= def.values.length) {
        issues.push({ level: "error", path, msgKey: "val.varInitOutOfList", params: { name, n: def.values.length } });
      }
      if (tool.schemaVersion < 2) {
        issues.push({ level: "error", path, msgKey: "val.varValuesNeedsV2", params: { name } });
      }
      continue;
    }

    if (def.min === undefined) {
      issues.push({ level: "error", path, msgKey: "val.varNeedsMin", params: { name } });
    }
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
    if (def.max !== undefined && def.min !== undefined && def.max < def.min) {
      issues.push({ level: "error", path, msgKey: "val.maxBelowMin", params: { name } });
    }
    if (def.max !== undefined && def.min !== undefined && (def.init < def.min || def.init > def.max)) {
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
  let usesSequencerKeys = false;

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
      issues.push({ level: "warning", path, msgKey: "val.unknownType", params: { key: keyNo, type } });
      normalizedKeys.push(raw as KeyDef);
      return;
    }

    if (keyTypeMinVersion(type) > tool.schemaVersion) {
      issues.push({
        level: "error",
        path,
        msgKey: "val.keyNeedsNewerSchema",
        params: { key: keyNo, type, version: keyTypeMinVersion(type) },
      });
    }

    const parsed = keySchemas[type].safeParse(raw);
    if (!parsed.success) {
      issues.push(...zodIssues(parsed.error, path).map((iss) => ({ ...iss, params: { ...iss.params, key: keyNo } })));
      normalizedKeys.push(raw as KeyDef);
      return;
    }
    const key = parsed.data as KnownKeyDef;
    normalizedKeys.push(key);

    if (key.type === "param") {
      key.set.forEach((s, j) => {
        if (!(s.var in tool.vars)) issues.push(missingVarIssue(`${path}.set[${j}]`, s.var, varNames));
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

    if (key.type === "hold_select") {
      const h = key as KeyHoldSelect;
      const def = tool.vars[h.var];
      if (!def) {
        issues.push(missingVarIssue(path, h.var, varNames));
      } else if (!def.values) {
        issues.push({ level: "error", path, msgKey: "val.holdSelectNeedsList", params: { key: keyNo, name: h.var } });
      } else if (def.values.length > GRID_COLS) {
        issues.push({
          level: "error",
          path,
          msgKey: "val.holdSelectTooManyValues",
          params: { key: keyNo, n: def.values.length, max: GRID_COLS },
        });
      }
    }

    if (key.type === "seq_step" || key.type === "hold_assign" || key.type === "seq_action") {
      usesSequencerKeys = true;
    }

    if (key.type === "seq_step" && tool.sequencer) {
      const step = (key as KeySeqStep).step;
      if (step >= tool.sequencer.maxSteps) {
        issues.push({
          level: "error",
          path,
          msgKey: "val.seqStepOutOfRange",
          params: { key: keyNo, step, max: tool.sequencer.maxSteps - 1 },
        });
      }
    }

    if (key.type === "hold_assign" && tool.sequencer) {
      const hits = tool.sequencer.ratchet?.hits ?? [];
      if (!hits.includes((key as { value: number }).value)) {
        issues.push({
          level: "error",
          path,
          msgKey: "val.holdAssignUnknownHits",
          params: { key: keyNo, value: (key as { value: number }).value, hits: hits.join(", ") || "-" },
        });
      }
    }

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

  // --- sequencer ---
  if (tool.sequencer) {
    if (tool.schemaVersion < 2) {
      issues.push({ level: "error", path: "sequencer", msgKey: "val.sequencerNeedsV2" });
    }
    validateSequencer(tool.sequencer, tool, varNames, device, issues);
  } else if (usesSequencerKeys) {
    issues.push({ level: "error", path: "keys", msgKey: "val.seqKeysWithoutSequencer" });
  }

  // --- acoplamiento con device: la var 'scale' indexa scaleOrder ---
  if (device && tool.vars.scale && !tool.vars.scale.values) {
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

function validateSequencer(
  seq: SequencerSpec,
  tool: ToolFile,
  varNames: string[],
  device: DeviceConfig | null | undefined,
  issues: Issue[],
) {
  // Todas las vars que referencia deben existir
  for (const name of sequencerVars(seq)) {
    if (!(name in tool.vars)) issues.push(missingVarIssue("sequencer", name, varNames));
  }

  // rate debe ser una var de lista con duraciones conocidas
  const rateDef = tool.vars[seq.rate];
  if (rateDef) {
    if (!rateDef.values) {
      issues.push({ level: "error", path: "sequencer.rate", msgKey: "val.rateNeedsList", params: { name: seq.rate } });
    } else {
      for (const v of rateDef.values) {
        if (typeof v !== "string" || !RATE_NAMES.includes(v)) {
          issues.push({
            level: "error",
            path: `vars.${seq.rate}`,
            msgKey: "val.rateUnknown",
            params: { value: String(v), known: RATE_NAMES.join(", ") },
          });
        }
      }
    }
  }

  // steps no puede superar maxSteps
  const stepsDef = tool.vars[seq.steps];
  if (stepsDef && !stepsDef.values && stepsDef.max !== undefined && stepsDef.max > seq.maxSteps) {
    issues.push({
      level: "error",
      path: `vars.${seq.steps}`,
      msgKey: "val.stepsAboveMax",
      params: { max: stepsDef.max, maxSteps: seq.maxSteps },
    });
  }

  // rango de notas coherente
  if (seq.noteRange[0] >= seq.noteRange[1]) {
    issues.push({ level: "error", path: "sequencer.noteRange", msgKey: "val.noteRangeInverted" });
  }

  // escala fija: debe existir en el device
  if ("name" in seq.scale && device) {
    if (!(seq.scale.name in device.scales)) {
      const suggestion = suggestName(seq.scale.name, Object.keys(device.scales));
      issues.push(
        suggestion
          ? {
              level: "error",
              path: "sequencer.scale",
              msgKey: "val.scaleMissingSuggest",
              params: { name: seq.scale.name, suggestion },
            }
          : { level: "error", path: "sequencer.scale", msgKey: "val.scaleMissing", params: { name: seq.scale.name } },
      );
    }
  }

  // probabilidades: listas de 0-100
  for (const [field, varName] of [
    ["mutation", seq.mutation],
    ["hold", seq.hold],
  ] as const) {
    if (!varName) continue;
    const def = tool.vars[varName];
    if (def?.values) {
      for (const v of def.values) {
        if (typeof v !== "number" || v < 0 || v > 100) {
          issues.push({
            level: "error",
            path: `vars.${varName}`,
            msgKey: "val.probabilityRange",
            params: { field, value: String(v) },
          });
        }
      }
    }
  }
}

// ---------- validación de device ----------

export function validateDevice(json: unknown, knownToolIds?: string[]): DeviceValidation {
  const issues: Issue[] = [];

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { issues: [{ level: "error", path: "", msgKey: "val.notObject" }], device: null };
  }
  const sv = (json as { schemaVersion?: unknown }).schemaVersion;
  if (typeof sv !== "number" || !(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(sv)) {
    return {
      issues: [
        {
          level: "error",
          path: "schemaVersion",
          msgKey: "val.badVersion",
          params: { version: String(sv ?? "?"), supported: SUPPORTED_SCHEMA_VERSIONS.join(", ") },
        },
      ],
      device: null,
    };
  }

  const shape = deviceShapeSchema.safeParse(json);
  if (!shape.success) {
    return { issues: zodIssues(shape.error), device: null };
  }
  const device = shape.data as DeviceConfig;

  // v1 exigía exactamente 7 grados por escala
  if (device.schemaVersion < 2) {
    for (const [name, intervals] of Object.entries(device.scales)) {
      if (intervals.length !== 7) {
        issues.push({ level: "error", path: `scales.${name}`, msgKey: "val.scaleLengthV1", params: { name } });
      }
    }
  }

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

  // escalas no monótonas: síntoma del apaño de la pentatónica en v1
  for (const [name, intervals] of Object.entries(device.scales)) {
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i] <= intervals[i - 1]) {
        issues.push({ level: "warning", path: `scales.${name}`, msgKey: "val.scaleNotAscending", params: { name } });
        break;
      }
    }
  }

  if (device.clock?.source === "internal" && device.clock.bpm === undefined) {
    issues.push({ level: "warning", path: "clock", msgKey: "val.clockNeedsBpm" });
  }

  if (device.midiOut && device.midiOut.usb === false && device.midiOut.trs === false) {
    issues.push({ level: "warning", path: "midiOut", msgKey: "val.midiOutAllDisabled" });
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
  if (
    typeof o.schemaVersion !== "number" ||
    !(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(o.schemaVersion) ||
    o.keySnippet !== true ||
    typeof o.key !== "object" ||
    o.key === null
  ) {
    return { issues: [{ level: "error", path: "", msgKey: "val.notSnippet" }], snippet: null };
  }
  const key = o.key as KeyDef;
  if (typeof key.type !== "string") {
    return { issues: [{ level: "error", path: "key", msgKey: "val.keyNotObject", params: { key: "-" } }], snippet: null };
  }
  if (isKnownKeyType(key.type)) {
    if (key.type !== "none") {
      const parsed = keySchemas[key.type].safeParse(key);
      if (!parsed.success) return { issues: zodIssues(parsed.error, "key"), snippet: null };
    }
  } else {
    issues.push({ level: "warning", path: "key", msgKey: "val.unknownType", params: { key: "-", type: key.type } });
  }
  const requiredVars = (o.requiredVars ?? {}) as KeySnippet["requiredVars"];
  return { issues, snippet: { schemaVersion: SCHEMA_VERSION, keySnippet: true, key, requiredVars } };
}
