// El contrato. Los JSONs de ejemplo deben validar tal cual, y los
// casos rotos deben producir errores/avisos legibles.

import { describe, expect, it } from "vitest";
import { validateDevice, validateSnippet, validateTool, hasErrors } from "../src/schema/validate";
import { buildKeySnippet, planSnippetMerge, applySnippet } from "../src/schema/snippet";
import { DeviceConfig, ToolFile, resolveVarValue, RATE_CLOCKS } from "../src/schema/types";
import { initLiveState, pressKey, releaseKey, noteName } from "../src/live/engine";

import device from "../src/examples/device.json";
import ccBasic from "../src/examples/cc_basic.json";
import chromatic from "../src/examples/chromatic.json";
import scalePlay from "../src/examples/scale_play.json";
import chordPlay from "../src/examples/chord_play.json";
import minorRatchet from "../src/examples/minor_ratchet.json";
import randomMelody from "../src/examples/random_melody.json";
import minorGlide from "../src/examples/minor_glide.json";

const dev = device as DeviceConfig;
const ALL_IDS = [
  "cc_basic",
  "chromatic",
  "scale_play",
  "chord_play",
  "minor_ratchet",
  "random_melody",
  "minor_glide",
];

describe("example files validate as-is", () => {
  it.each([
    ["cc_basic", ccBasic],
    ["chromatic", chromatic],
    ["scale_play", scalePlay],
    ["chord_play", chordPlay],
    ["minor_ratchet", minorRatchet],
    ["random_melody", randomMelody],
    ["minor_glide", minorGlide],
  ])("%s has no errors", (_name, json) => {
    const { issues, tool } = validateTool(json, dev);
    expect(tool).not.toBeNull();
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("device.json has no errors", () => {
    const { issues, device: parsed } = validateDevice(device, ALL_IDS);
    expect(parsed).not.toBeNull();
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("v1 tools still validate against a v2 device", () => {
    expect((ccBasic as { schemaVersion: number }).schemaVersion).toBe(1);
    expect(hasErrors(validateTool(ccBasic, dev).issues)).toBe(false);
  });
});

describe("tool validation", () => {
  const base = () => structuredClone(chromatic) as unknown as ToolFile;

  it("rejects a tool with 15 keys", () => {
    const t = base();
    t.keys = t.keys.slice(0, 15);
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.keysLength")).toBe(true);
  });

  it("rejects an unsupported schemaVersion", () => {
    const t = base();
    (t as { schemaVersion: number }).schemaVersion = 99;
    const { issues, tool } = validateTool(t, dev);
    expect(tool).toBeNull();
    expect(issues[0].msgKey).toBe("val.badVersion");
  });

  it("flags an unknown key type as warning, not error", () => {
    const t = base();
    t.keys[0] = { type: "sequencer_step_xyz", pattern: [1, 0, 1] };
    const { issues, tool } = validateTool(t, dev);
    expect(hasErrors(issues)).toBe(false);
    expect(issues.filter((i) => i.msgKey === "val.unknownType")).toHaveLength(1);
    expect(tool!.keys[0]).toMatchObject({ type: "sequencer_step_xyz" });
  });

  it("suggests the right var name for typos (octav -> octave)", () => {
    const t = base();
    t.keys[12] = { type: "param", set: [{ var: "octav", delta: -1 }], flash: "B400FF" };
    const iss = validateTool(t, dev).issues.find((i) => i.msgKey === "val.varMissingSuggest");
    expect(iss?.params).toMatchObject({ name: "octav", suggestion: "octave" });
  });

  it("rejects bad colors", () => {
    const t = base();
    (t.keys[0] as { color: string }).color = "#0096FF";
    expect(hasErrors(validateTool(t, dev).issues)).toBe(true);
  });
});

describe("v2: list variables", () => {
  it("rejects a values list together with min/max", () => {
    const t = structuredClone(minorRatchet) as unknown as ToolFile;
    t.vars.rate.min = 0;
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.varValuesAndRange")).toBe(true);
  });

  it("rejects an init outside the list", () => {
    const t = structuredClone(minorRatchet) as unknown as ToolFile;
    t.vars.transpose.init = 99;
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.varInitOutOfList")).toBe(true);
  });

  it("rejects a values list in a v1 tool", () => {
    const t = structuredClone(minorRatchet) as unknown as ToolFile;
    t.schemaVersion = 1;
    const issues = validateTool(t, dev).issues;
    expect(issues.some((i) => i.msgKey === "val.varValuesNeedsV2")).toBe(true);
    expect(issues.some((i) => i.msgKey === "val.sequencerNeedsV2")).toBe(true);
  });

  it("resolves the index into the underlying value", () => {
    const def = (minorRatchet as unknown as ToolFile).vars.transpose;
    expect(resolveVarValue(def, 0)).toBe(-12);
    expect(resolveVarValue(def, def.init)).toBe(0);
    expect(resolveVarValue(def, 6)).toBe(12);
    // fuera de rango: se recorta, no explota
    expect(resolveVarValue(def, 99)).toBe(12);
  });
});

describe("v2: sequencer", () => {
  const seqTool = () => structuredClone(minorRatchet) as unknown as ToolFile;

  it("rejects sequencer keys with no sequencer block", () => {
    const t = seqTool();
    delete t.sequencer;
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.seqKeysWithoutSequencer")).toBe(true);
  });

  it("rejects a step beyond maxSteps", () => {
    const t = seqTool();
    t.sequencer!.maxSteps = 4;
    const issues = validateTool(t, dev).issues;
    expect(issues.some((i) => i.msgKey === "val.seqStepOutOfRange")).toBe(true);
  });

  it("rejects an unknown note duration in the rate list", () => {
    const t = seqTool();
    t.vars.rate.values = ["1/4", "1/3"];
    t.vars.rate.init = 0;
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.rateUnknown")).toBe(true);
  });

  it("rejects a rate variable that is not a list", () => {
    const t = seqTool();
    t.vars.rate = { init: 0, min: 0, max: 4 };
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.rateNeedsList")).toBe(true);
  });

  it("rejects a ratchet assignment the sequencer does not offer", () => {
    const t = seqTool();
    (t.keys[12] as { value: number }).value = 7;
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.holdAssignUnknownHits")).toBe(true);
  });

  it("rejects an inverted note range", () => {
    const t = seqTool();
    t.sequencer!.noteRange = [72, 24];
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.noteRangeInverted")).toBe(true);
  });

  it("rejects a fixed scale the device does not define, with a suggestion", () => {
    const t = seqTool();
    t.sequencer!.scale = { name: "natural_minr" };
    const iss = validateTool(t, dev).issues.find((i) => i.msgKey === "val.scaleMissingSuggest");
    expect(iss?.params).toMatchObject({ suggestion: "natural_minor" });
  });

  it("rejects a missing sequencer variable", () => {
    const t = seqTool();
    t.sequencer!.transpose = "transpoze";
    expect(validateTool(t, dev).issues.some((i) => i.msgKey.startsWith("val.varMissing"))).toBe(true);
  });

  it("every rate in the shipped tools maps to a clock count", () => {
    for (const tool of [minorRatchet, randomMelody, minorGlide] as unknown as ToolFile[]) {
      for (const v of tool.vars.rate.values!) {
        expect(RATE_CLOCKS[v as string]).toBeGreaterThan(0);
      }
    }
  });
});

describe("v2: hold_select", () => {
  it("rejects selecting a variable with no values list", () => {
    const t = structuredClone(minorGlide) as unknown as ToolFile;
    t.vars.gate = { init: 0, min: 0, max: 4 };
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.holdSelectNeedsList")).toBe(true);
  });

  it("rejects more values than the top row of keys", () => {
    const t = structuredClone(minorGlide) as unknown as ToolFile;
    t.vars.gate.values = Array.from({ length: 12 }, (_, i) => i);
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.holdSelectTooManyValues")).toBe(true);
  });

  it("rejects v2 primitives in a v1 tool", () => {
    const t = structuredClone(chromatic) as unknown as ToolFile;
    t.keys[0] = { type: "hold_select", var: "octave", color: "FFFFFF" };
    expect(validateTool(t, dev).issues.some((i) => i.msgKey === "val.keyNeedsNewerSchema")).toBe(true);
  });
});

describe("device validation", () => {
  it("rejects a scaleOrder entry missing from scales, with suggestion", () => {
    const d = structuredClone(dev);
    d.scaleOrder = [...d.scaleOrder, "majr"];
    const iss = validateDevice(d).issues.find((i) => i.msgKey === "val.scaleMissingSuggest");
    expect(iss?.params).toMatchObject({ suggestion: "major" });
  });

  it("warns when slot 16 (Ctrl) is occupied", () => {
    const d = structuredClone(dev);
    d.slots = Array(16).fill(null);
    d.slots[15] = "cc_basic";
    expect(validateDevice(d, ["cc_basic"]).issues.some((i) => i.msgKey === "val.ctrlSlotReserved")).toBe(true);
  });

  it("accepts a 5-note pentatonic in v2 but rejects it in v1", () => {
    expect(dev.scales.minor_pentatonic).toHaveLength(5);
    expect(hasErrors(validateDevice(dev, ALL_IDS).issues)).toBe(false);

    const asV1 = structuredClone(dev);
    asV1.schemaVersion = 1;
    expect(validateDevice(asV1).issues.some((i) => i.msgKey === "val.scaleLengthV1")).toBe(true);
  });

  it("warns about a non-ascending scale", () => {
    const d = structuredClone(dev);
    d.scales.broken = [0, 3, 2, 7, 10];
    d.scaleOrder = [...d.scaleOrder, "broken"];
    expect(validateDevice(d).issues.some((i) => i.msgKey === "val.scaleNotAscending")).toBe(true);
  });

  it("warns when an internal clock has no bpm", () => {
    const d = structuredClone(dev);
    d.clock = { source: "internal" };
    expect(validateDevice(d).issues.some((i) => i.msgKey === "val.clockNeedsBpm")).toBe(true);
  });

  it("warns when every MIDI output is off", () => {
    const d = structuredClone(dev);
    d.midiOut = { usb: false, trs: false };
    expect(validateDevice(d).issues.some((i) => i.msgKey === "val.midiOutAllDisabled")).toBe(true);
  });
});

describe("key snippets", () => {
  const chord = chordPlay as unknown as ToolFile;

  it("exports a chord key with all its required vars (incl. maxVar chain)", () => {
    const snippet = buildKeySnippet(chord, 0);
    expect(snippet.key).toMatchObject({ type: "chord", degree: 0 });
    for (const v of ["root", "scale", "octave", "degree", "voices", "inversion"]) {
      expect(snippet.requiredVars).toHaveProperty(v);
    }
  });

  it("merges missing vars into the target tool", () => {
    const snippet = buildKeySnippet(chord, 0);
    const target = structuredClone(ccBasic) as unknown as ToolFile;
    const plan = planSnippetMerge(target, snippet);
    expect(plan.missing).toContain("voices");
    const merged = applySnippet(target, 3, snippet, false);
    expect(merged.keys[3]).toMatchObject({ type: "chord" });
    expect(merged.vars.voices).toBeDefined();
  });

  it("round-trips a v2 hold_select key", () => {
    const tool = minorGlide as unknown as ToolFile;
    const snippet = buildKeySnippet(tool, 12);
    expect(snippet.key).toMatchObject({ type: "hold_select", var: "gate" });
    expect(snippet.requiredVars).toHaveProperty("gate");
    const { issues, snippet: parsed } = validateSnippet(JSON.parse(JSON.stringify(snippet)));
    expect(parsed).not.toBeNull();
    expect(hasErrors(issues)).toBe(false);
  });
});

describe("live engine mirrors the firmware", () => {
  it("chromatic note press/release", () => {
    const tool = chromatic as unknown as ToolFile;
    const st = initLiveState(tool);
    const res = pressKey(tool, dev, st, 0);
    expect(res.events).toEqual([{ kind: "noteOn", note: 60, value: 100, channel: 1 }]);
    expect(releaseKey(tool, dev, st, 0)).toEqual([{ kind: "noteOff", note: 60, value: 0, channel: 1 }]);
  });

  it("octave param shifts notes and clamps at limits", () => {
    const tool = chromatic as unknown as ToolFile;
    const st = initLiveState(tool);
    pressKey(tool, dev, st, 13);
    expect(st.vars.octave).toBe(1);
    expect(pressKey(tool, dev, st, 0).events[0].note).toBe(72);
    st.vars.octave = 3;
    expect(pressKey(tool, dev, st, 13).log?.labelKey).toBe("live.paramLimit");
  });

  it("builds a C major triad on chord key 1 (C-E-G)", () => {
    const tool = chordPlay as unknown as ToolFile;
    const st = initLiveState(tool);
    const res = pressKey(tool, dev, st, 0);
    expect(res.events.map((e) => e.note)).toEqual([60, 64, 67]);
    expect(res.log?.text).toBe("C4 · E4 · G4");
  });

  it("inversion raises the lowest voices an octave", () => {
    const tool = chordPlay as unknown as ToolFile;
    const st = initLiveState(tool);
    st.vars.inversion = 1;
    expect(pressKey(tool, dev, st, 0).events.map((e) => e.note)).toEqual([72, 64, 67]);
  });

  it("cc toggle alternates on/off values", () => {
    const tool = ccBasic as unknown as ToolFile;
    const st = initLiveState(tool);
    expect(pressKey(tool, dev, st, 8).events).toEqual([{ kind: "cc", cc: 80, value: 127, channel: 1 }]);
    expect(pressKey(tool, dev, st, 8).events).toEqual([{ kind: "cc", cc: 80, value: 0, channel: 1 }]);
  });

  it("names notes correctly", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(61)).toBe("C#4");
    expect(noteName(59)).toBe("B3");
  });
});
