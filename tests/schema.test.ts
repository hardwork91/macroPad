// Hito 1: el contrato. Los 4 JSONs de ejemplo (copiados tal cual del
// firmware) deben validar sin errores, y los casos rotos deben
// producir errores/avisos legibles.

import { describe, expect, it } from "vitest";
import { validateDevice, validateSnippet, validateTool, hasErrors } from "../src/schema/validate";
import { buildKeySnippet, planSnippetMerge, applySnippet } from "../src/schema/snippet";
import { DeviceConfig, ToolFile } from "../src/schema/types";
import { initLiveState, pressKey, releaseKey, noteName } from "../src/live/engine";

import device from "../src/examples/device.json";
import ccBasic from "../src/examples/cc_basic.json";
import chromatic from "../src/examples/chromatic.json";
import scalePlay from "../src/examples/scale_play.json";
import chordPlay from "../src/examples/chord_play.json";

const dev = device as DeviceConfig;

describe("example files validate as-is", () => {
  it.each([
    ["cc_basic", ccBasic],
    ["chromatic", chromatic],
    ["scale_play", scalePlay],
    ["chord_play", chordPlay],
  ])("%s has no errors", (_name, json) => {
    const { issues, tool } = validateTool(json, dev);
    expect(tool).not.toBeNull();
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("device.json has no errors", () => {
    const { issues, device: parsed } = validateDevice(device, ["cc_basic", "chromatic", "scale_play", "chord_play"]);
    expect(parsed).not.toBeNull();
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("tool validation", () => {
  const base = () => structuredClone(chromatic) as unknown as ToolFile;

  it("rejects a tool with 15 keys", () => {
    const t = base();
    t.keys = t.keys.slice(0, 15);
    const { issues } = validateTool(t, dev);
    expect(issues.some((i) => i.msgKey === "val.keysLength" && i.level === "error")).toBe(true);
  });

  it("rejects unknown schemaVersion with a clear message", () => {
    const t = base();
    (t as { schemaVersion: number }).schemaVersion = 99;
    const { issues, tool } = validateTool(t, dev);
    expect(tool).toBeNull();
    expect(issues[0].msgKey).toBe("val.badVersion");
  });

  it("flags an unknown key type as warning, not error", () => {
    const t = base();
    t.keys[0] = { type: "sequencer_step", pattern: [1, 0, 1] };
    const { issues, tool } = validateTool(t, dev);
    expect(tool).not.toBeNull();
    const unknown = issues.filter((i) => i.msgKey === "val.unknownType");
    expect(unknown).toHaveLength(1);
    expect(unknown[0].level).toBe("warning");
    expect(hasErrors(issues)).toBe(false);
    // la tecla desconocida se conserva tal cual
    expect(tool!.keys[0]).toMatchObject({ type: "sequencer_step" });
  });

  it("suggests the right var name for typos (octav -> octave)", () => {
    const t = base();
    t.keys[12] = { type: "param", set: [{ var: "octav", delta: -1 }], flash: "B400FF" };
    const { issues } = validateTool(t, dev);
    const iss = issues.find((i) => i.msgKey === "val.varMissingSuggest");
    expect(iss).toBeDefined();
    expect(iss!.params).toMatchObject({ name: "octav", suggestion: "octave" });
    expect(iss!.level).toBe("error");
  });

  it("rejects bad colors", () => {
    const t = base();
    (t.keys[0] as { color: string }).color = "#0096FF"; // el contrato no lleva '#'
    const { issues } = validateTool(t, dev);
    expect(hasErrors(issues)).toBe(true);
  });

  it("requires max or maxVar on vars", () => {
    const t = base();
    t.vars.speed = { init: 0, min: 0 };
    const { issues } = validateTool(t, dev);
    expect(issues.some((i) => i.msgKey === "val.varNeedsMax")).toBe(true);
  });

  it("warns when scale max exceeds the device's scale count", () => {
    const t = structuredClone(scalePlay) as unknown as ToolFile;
    t.vars.scale.max = 9;
    const { issues } = validateTool(t, dev);
    const iss = issues.find((i) => i.msgKey === "val.scaleRange");
    expect(iss).toBeDefined();
    expect(iss!.level).toBe("warning");
  });
});

describe("device validation", () => {
  it("rejects a scaleOrder entry missing from scales, with suggestion", () => {
    const d = structuredClone(dev);
    d.scaleOrder = [...d.scaleOrder, "majr"];
    const { issues } = validateDevice(d);
    const iss = issues.find((i) => i.msgKey === "val.scaleMissingSuggest");
    expect(iss).toBeDefined();
    expect(iss!.params).toMatchObject({ suggestion: "major" });
  });

  it("warns when slot 16 (Ctrl) is occupied", () => {
    const d = structuredClone(dev);
    d.slots = Array(16).fill(null);
    d.slots[15] = "cc_basic";
    const { issues } = validateDevice(d, ["cc_basic"]);
    expect(issues.some((i) => i.msgKey === "val.ctrlSlotReserved")).toBe(true);
  });
});

describe("key snippets (§3.4)", () => {
  const chord = chordPlay as unknown as ToolFile;

  it("exports a chord key with all its required vars (incl. maxVar chain)", () => {
    const snippet = buildKeySnippet(chord, 0);
    expect(snippet.keySnippet).toBe(true);
    expect(snippet.key).toMatchObject({ type: "chord", degree: 0 });
    // chord lee root/scale/octave/degree/voices/inversion; inversion -> maxVar voices
    for (const v of ["root", "scale", "octave", "degree", "voices", "inversion"]) {
      expect(snippet.requiredVars).toHaveProperty(v);
    }
  });

  it("merges missing vars into the target tool", () => {
    const snippet = buildKeySnippet(chord, 0);
    const target = structuredClone(ccBasic) as unknown as ToolFile;
    const plan = planSnippetMerge(target, snippet);
    expect(plan.missing).toContain("voices");
    expect(plan.conflicting).toEqual([]);
    const merged = applySnippet(target, 3, snippet, false);
    expect(merged.keys[3]).toMatchObject({ type: "chord" });
    expect(merged.vars.voices).toBeDefined();
  });

  it("round-trips through validateSnippet", () => {
    const snippet = buildKeySnippet(chord, 0);
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
    expect(res.log?.text).toContain("C4");
    const off = releaseKey(tool, dev, st, 0);
    expect(off).toEqual([{ kind: "noteOff", note: 60, value: 0, channel: 1 }]);
  });

  it("octave param shifts notes and clamps at limits", () => {
    const tool = chromatic as unknown as ToolFile;
    const st = initLiveState(tool);
    pressKey(tool, dev, st, 13); // octave +1
    expect(st.vars.octave).toBe(1);
    const res = pressKey(tool, dev, st, 0);
    expect(res.events[0].note).toBe(72);
    // subir más allá del max (3) reporta límite
    st.vars.octave = 3;
    const lim = pressKey(tool, dev, st, 13);
    expect(st.vars.octave).toBe(3);
    expect(lim.log?.labelKey).toBe("live.paramLimit");
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
    const res = pressKey(tool, dev, st, 0);
    expect(res.events.map((e) => e.note)).toEqual([72, 64, 67]);
  });

  it("cc toggle alternates on/off values", () => {
    const tool = ccBasic as unknown as ToolFile;
    const st = initLiveState(tool);
    const on = pressKey(tool, dev, st, 8);
    expect(on.events).toEqual([{ kind: "cc", cc: 80, value: 127, channel: 1 }]);
    expect(on.ledColor).toBe("00FF00");
    const off = pressKey(tool, dev, st, 8);
    expect(off.events).toEqual([{ kind: "cc", cc: 80, value: 0, channel: 1 }]);
    expect(off.ledColor).toBeNull();
  });

  it("scale degree 7 continues into the next octave", () => {
    const tool = scalePlay as unknown as ToolFile;
    const st = initLiveState(tool);
    const res = pressKey(tool, dev, st, 7); // degree 7 = octava de la tónica
    expect(res.events[0].note).toBe(72);
  });

  it("names notes correctly", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(61)).toBe("C#4");
    expect(noteName(59)).toBe("B3");
  });
});
