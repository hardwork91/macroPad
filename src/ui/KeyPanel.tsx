// Formulario por tecla: el dropdown de primitiva primero y los campos
// específicos después. Copiar/pegar y snippets (§3.4) viven aquí.

import { useState } from "react";
import { useI18n } from "../i18n";
import { applySnippet, buildKeySnippet, planSnippetMerge } from "../schema/snippet";
import {
  CTRL_KEY_INDEX,
  KeyCC,
  KeyDef,
  KeyHoldAssign,
  KeyHoldSelect,
  KeyNote,
  KeyParam,
  KeyScaleNote,
  KeySeqAction,
  KeySeqStep,
  KnownKeyType,
  MAX_SEQ_STEPS,
  ToolFile,
  isKnownKeyType,
} from "../schema/types";
import { validateSnippet } from "../schema/validate";
import { useAppStore } from "../store/appStore";
import { noteName } from "../live/engine";
import { ColorField, Modal, NumField, SelectField } from "./common";

const TYPE_OPTIONS_V1: KnownKeyType[] = ["none", "note", "scale_note", "chord", "cc", "param"];
const TYPE_OPTIONS_V2: KnownKeyType[] = ["seq_step", "seq_action", "hold_select", "hold_assign"];

function defaultKey(type: KnownKeyType, prevColor?: string, tool?: ToolFile): KeyDef {
  const color = prevColor ?? "7C8CF8";
  const listVars = tool ? Object.entries(tool.vars).filter(([, d]) => d.values).map(([n]) => n) : [];
  switch (type) {
    case "note":
      return { type, note: 60, color };
    case "scale_note":
      return { type, degree: 0, color };
    case "chord":
      return { type, degree: 0, color };
    case "cc":
      return { type, cc: 20, behavior: "momentary", pressValue: 127, releaseValue: 0, color };
    case "param":
      return { type, set: [{ var: "", delta: 1 }], flash: "FFFFFF", limitFlash: "FF0000" };
    case "seq_step":
      return { type, step: 0, color, playheadColor: "FFFFFF" };
    case "seq_action":
      return { type, action: "regenerate", color };
    case "hold_select":
      return { type, var: listVars[0] ?? "", color, selectedColor: "FFFFFF" };
    case "hold_assign":
      return { type, target: "ratchet", value: tool?.sequencer?.ratchet?.hits[0] ?? 12, color };
    default:
      return { type: "none" };
  }
}

export function KeyPanel({ toolId, tool, keyIndex }: { toolId: string; tool: ToolFile; keyIndex: number }) {
  const { t } = useI18n();
  const { updateTool, clipboardKey, setClipboardKey, toast } = useAppStore();
  const [importOpen, setImportOpen] = useState(false);
  const key = tool.keys[keyIndex] ?? { type: "none" };
  const unknown = !isKnownKeyType(key.type);

  function setKey(next: KeyDef) {
    updateTool(toolId, (tl) => ({ ...tl, keys: tl.keys.map((k, i) => (i === keyIndex ? next : k)) }));
  }
  function patchKey(patch: Partial<KeyDef>) {
    setKey({ ...key, ...patch } as KeyDef);
  }

  function copyKey() {
    setClipboardKey(buildKeySnippet(tool, keyIndex));
    toast("info", t("key.copied", { key: keyIndex + 1 }));
  }

  function pasteKey() {
    if (!clipboardKey) return;
    mergeSnippet(clipboardKey);
  }

  function mergeSnippet(snippet: ReturnType<typeof buildKeySnippet>) {
    const plan = planSnippetMerge(tool, snippet);
    let overwrite = false;
    if (plan.conflicting.length > 0) {
      overwrite = window.confirm(t("key.varConflictConfirm", { vars: plan.conflicting.join(", ") }));
    }
    updateTool(toolId, (tl) => applySnippet(tl, keyIndex, snippet, overwrite));
    if (plan.missing.length > 0) toast("info", t("key.varsMerged", { vars: plan.missing.join(", ") }));
  }

  async function exportSnippet() {
    const snippet = buildKeySnippet(tool, keyIndex);
    await navigator.clipboard.writeText(JSON.stringify(snippet, null, 2));
    toast("success", t("key.snippetExported"));
  }

  return (
    <div className="key-panel">
      {keyIndex === CTRL_KEY_INDEX && <p className="hint-box">{t("editor.ctrlKeyHint")}</p>}

      <SelectField
        label={t("key.type")}
        value={key.type}
        options={[
          ...TYPE_OPTIONS_V1.map((v) => ({ value: v, label: t(`key.type_${v}`) })),
          ...(tool.schemaVersion >= 2
            ? TYPE_OPTIONS_V2.map((v) => ({ value: v, label: t(`key.type_${v}`) }))
            : []),
          ...(unknown ? [{ value: key.type, label: `${key.type} (?)` }] : []),
        ]}
        onChange={(v) => {
          if (isKnownKeyType(v)) setKey(defaultKey(v, "color" in key ? (key.color as string) : undefined, tool));
        }}
      />

      {unknown && (
        <div className="warn-box">
          <p>{t("key.unknownTypeWarn", { type: key.type })}</p>
          <pre className="json-view small">{JSON.stringify(key, null, 2)}</pre>
          <button type="button" onClick={() => setKey({ type: "none" })}>
            {t("key.resetToNone")}
          </button>
        </div>
      )}

      {key.type === "note" && (
        <>
          <NumField
            label={t("key.note")}
            value={(key as KeyNote).note}
            min={0}
            max={127}
            onChange={(v) => patchKey({ note: v })}
            hint={noteName((key as KeyNote).note)}
          />
          <ColorField label={t("key.color")} value={(key as KeyNote).color} onChange={(v) => patchKey({ color: v })} />
        </>
      )}

      {(key.type === "scale_note" || key.type === "chord") && (
        <>
          <NumField
            label={t("key.degree")}
            value={(key as KeyScaleNote).degree}
            min={0}
            max={13}
            onChange={(v) => patchKey({ degree: v })}
            hint={t(key.type === "chord" ? "key.degreeChordHint" : "key.degreeHint")}
          />
          <ColorField label={t("key.color")} value={(key as KeyScaleNote).color} onChange={(v) => patchKey({ color: v })} />
        </>
      )}

      {key.type === "cc" && <CCForm keyDef={key as KeyCC} patchKey={patchKey} />}
      {key.type === "param" && <ParamForm keyDef={key as KeyParam} tool={tool} setKey={setKey} />}
      {key.type === "seq_step" && <SeqStepForm keyDef={key as KeySeqStep} tool={tool} patchKey={patchKey} />}
      {key.type === "seq_action" && <SeqActionForm keyDef={key as KeySeqAction} patchKey={patchKey} />}
      {key.type === "hold_select" && <HoldSelectForm keyDef={key as KeyHoldSelect} tool={tool} patchKey={patchKey} />}
      {key.type === "hold_assign" && <HoldAssignForm keyDef={key as KeyHoldAssign} tool={tool} patchKey={patchKey} />}

      <div className="key-actions">
        <button type="button" onClick={copyKey}>
          {t("common.copy")}
        </button>
        <button type="button" disabled={!clipboardKey} onClick={pasteKey}>
          {t("common.paste")}
        </button>
        <button type="button" onClick={exportSnippet}>
          {t("key.exportSnippet")}
        </button>
        <button type="button" onClick={() => setImportOpen(true)}>
          {t("key.importSnippet")}
        </button>
      </div>

      {importOpen && (
        <SnippetImportModal
          onClose={() => setImportOpen(false)}
          onImport={(snippet) => {
            mergeSnippet(snippet);
            setImportOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------- CC ----------------

function CCForm({ keyDef, patchKey }: { keyDef: KeyCC; patchKey: (p: Partial<KeyCC>) => void }) {
  const { t } = useI18n();
  return (
    <>
      <NumField label="CC" value={keyDef.cc} min={0} max={127} onChange={(v) => patchKey({ cc: v })} />
      <SelectField
        label={t("key.behavior")}
        value={keyDef.behavior}
        options={[
          { value: "momentary", label: t("key.momentary") },
          { value: "toggle", label: t("key.toggle") },
        ]}
        onChange={(v) => {
          if (v === "toggle") patchKey({ behavior: "toggle", onValue: keyDef.onValue ?? 127, offValue: keyDef.offValue ?? 0 });
          else patchKey({ behavior: "momentary", pressValue: keyDef.pressValue ?? 127, releaseValue: keyDef.releaseValue ?? 0 });
        }}
      />
      {keyDef.behavior === "momentary" ? (
        <div className="field-row">
          <NumField label={t("key.pressValue")} value={keyDef.pressValue ?? 127} min={0} max={127} onChange={(v) => patchKey({ pressValue: v })} />
          <NumField label={t("key.releaseValue")} value={keyDef.releaseValue ?? 0} min={0} max={127} onChange={(v) => patchKey({ releaseValue: v })} />
        </div>
      ) : (
        <div className="field-row">
          <NumField label={t("key.onValue")} value={keyDef.onValue ?? 127} min={0} max={127} onChange={(v) => patchKey({ onValue: v })} />
          <NumField label={t("key.offValue")} value={keyDef.offValue ?? 0} min={0} max={127} onChange={(v) => patchKey({ offValue: v })} />
        </div>
      )}
      <ColorField label={t("key.color")} value={keyDef.color} onChange={(v) => patchKey({ color: v })} />
    </>
  );
}

// ---------------- Param ----------------

function ParamForm({ keyDef, tool, setKey }: { keyDef: KeyParam; tool: ToolFile; setKey: (k: KeyDef) => void }) {
  const { t } = useI18n();
  const varNames = Object.keys(tool.vars);
  const feedback = keyDef.indicate ? "indicate" : "flash";

  function patch(p: Partial<KeyParam>) {
    setKey({ ...keyDef, ...p });
  }
  function patchSetter(i: number, p: Partial<KeyParam["set"][number]>) {
    patch({ set: keyDef.set.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  }

  return (
    <>
      <h4>{t("key.setters")}</h4>
      {keyDef.set.map((s, i) => {
        const mode = s.value !== undefined ? "value" : "delta";
        return (
          <div key={i} className="setter-row">
            <select value={s.var} onChange={(e) => patchSetter(i, { var: e.target.value })}>
              <option value="">—</option>
              {varNames.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={mode}
              onChange={(e) => {
                const amount = s.value ?? s.delta ?? 1;
                if (e.target.value === "value") patchSetter(i, { value: amount, delta: undefined });
                else patchSetter(i, { delta: amount, value: undefined });
              }}
            >
              <option value="delta">{t("key.delta")}</option>
              <option value="value">{t("key.value")}</option>
            </select>
            <input
              type="number"
              value={s.value ?? s.delta ?? 0}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isNaN(v)) return;
                if (mode === "value") patchSetter(i, { value: v });
                else patchSetter(i, { delta: v });
              }}
            />
            <button
              type="button"
              className="ghost icon-btn"
              disabled={keyDef.set.length <= 1}
              onClick={() => patch({ set: keyDef.set.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
        );
      })}
      <button type="button" className="ghost" onClick={() => patch({ set: [...keyDef.set, { var: varNames[0] ?? "", delta: 1 }] })}>
        + {t("key.addSetter")}
      </button>

      <h4>{t("key.feedback")}</h4>
      <SelectField
        label={t("key.feedbackMode")}
        value={feedback}
        options={[
          { value: "flash", label: t("key.feedbackFlash") },
          { value: "indicate", label: t("key.feedbackIndicate") },
        ]}
        onChange={(v) => {
          if (v === "indicate")
            patch({ indicate: { var: varNames[0] ?? "", color: "FFFFFF", holdMs: 250 }, flash: undefined, limitFlash: undefined });
          else patch({ indicate: undefined, flash: "FFFFFF", limitFlash: "FF0000" });
        }}
      />
      {feedback === "flash" ? (
        <div className="field-row">
          <ColorField label={t("key.flash")} value={keyDef.flash} onChange={(v) => patch({ flash: v })} />
          <ColorField label={t("key.limitFlash")} value={keyDef.limitFlash} onChange={(v) => patch({ limitFlash: v })} />
        </div>
      ) : (
        <>
          <SelectField
            label={t("key.indicateVar")}
            value={keyDef.indicate?.var ?? ""}
            options={[{ value: "", label: "—" }, ...varNames.map((v) => ({ value: v, label: v }))]}
            onChange={(v) => patch({ indicate: { ...keyDef.indicate!, var: v } })}
          />
          <div className="field-row">
            <ColorField label={t("key.color")} value={keyDef.indicate?.color} onChange={(v) => patch({ indicate: { ...keyDef.indicate!, color: v } })} />
            <NumField
              label="holdMs"
              value={keyDef.indicate?.holdMs ?? 250}
              min={0}
              onChange={(v) => patch({ indicate: { ...keyDef.indicate!, holdMs: v } })}
            />
          </div>
        </>
      )}
    </>
  );
}

// ---------------- Primitivas del secuenciador (v2) ----------------

function SeqStepForm({
  keyDef,
  tool,
  patchKey,
}: {
  keyDef: KeySeqStep;
  tool: ToolFile;
  patchKey: (p: Partial<KeySeqStep>) => void;
}) {
  const { t } = useI18n();
  const maxStep = (tool.sequencer?.maxSteps ?? MAX_SEQ_STEPS) - 1;
  return (
    <>
      <NumField
        label={t("key.step")}
        value={keyDef.step}
        min={0}
        max={maxStep}
        onChange={(v) => patchKey({ step: v })}
        hint={`0 – ${maxStep}`}
      />
      <div className="field-row">
        <ColorField label={t("key.color")} value={keyDef.color} onChange={(v) => patchKey({ color: v })} />
        <ColorField
          label={t("key.playheadColor")}
          value={keyDef.playheadColor}
          onChange={(v) => patchKey({ playheadColor: v })}
        />
      </div>
    </>
  );
}

function SeqActionForm({
  keyDef,
  patchKey,
}: {
  keyDef: KeySeqAction;
  patchKey: (p: Partial<KeySeqAction>) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <SelectField
        label={t("key.seqAction")}
        value={keyDef.action}
        options={(["regenerate", "start", "stop", "toggle"] as const).map((a) => ({
          value: a,
          label: t(`key.action_${a}`),
        }))}
        onChange={(v) => patchKey({ action: v as KeySeqAction["action"] })}
      />
      <ColorField label={t("key.color")} value={keyDef.color} onChange={(v) => patchKey({ color: v })} />
    </>
  );
}

function HoldSelectForm({
  keyDef,
  tool,
  patchKey,
}: {
  keyDef: KeyHoldSelect;
  tool: ToolFile;
  patchKey: (p: Partial<KeyHoldSelect>) => void;
}) {
  const { t } = useI18n();
  const listVars = Object.entries(tool.vars).filter(([, d]) => d.values);
  const chosen = tool.vars[keyDef.var];

  return (
    <>
      <SelectField
        label={t("key.holdVar")}
        value={keyDef.var}
        options={[{ value: "", label: "—" }, ...listVars.map(([n]) => ({ value: n, label: n }))]}
        onChange={(v) => patchKey({ var: v })}
      />
      {listVars.length === 0 && <p className="hint-box">{t("val.holdSelectNeedsList", { key: "", name: keyDef.var })}</p>}
      {chosen?.values && (
        <p className="muted small">
          {chosen.values.length} {t("vars.values")}: <code>{chosen.values.join(", ")}</code>
        </p>
      )}
      <div className="field-row">
        <ColorField label={t("key.color")} value={keyDef.color} onChange={(v) => patchKey({ color: v })} />
        <ColorField
          label={t("key.selectedColor")}
          value={keyDef.selectedColor}
          onChange={(v) => patchKey({ selectedColor: v })}
        />
      </div>
    </>
  );
}

function HoldAssignForm({
  keyDef,
  tool,
  patchKey,
}: {
  keyDef: KeyHoldAssign;
  tool: ToolFile;
  patchKey: (p: Partial<KeyHoldAssign>) => void;
}) {
  const { t } = useI18n();
  const hits = tool.sequencer?.ratchet?.hits ?? [];
  return (
    <>
      <SelectField
        label={t("key.ratchetHits")}
        value={String(keyDef.value)}
        options={
          hits.length > 0
            ? hits.map((h) => ({ value: String(h), label: String(h) }))
            : [{ value: String(keyDef.value), label: String(keyDef.value) }]
        }
        onChange={(v) => patchKey({ value: parseInt(v, 10) })}
      />
      <ColorField label={t("key.color")} value={keyDef.color} onChange={(v) => patchKey({ color: v })} />
    </>
  );
}

// ---------------- Import de snippet ----------------

function SnippetImportModal({ onClose, onImport }: { onClose: () => void; onImport: (s: ReturnType<typeof buildKeySnippet>) => void }) {
  const { t } = useI18n();
  const { toast } = useAppStore();
  const [text, setText] = useState("");

  function handleImport() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast("error", t("editor.jsonParseError"));
      return;
    }
    const { issues, snippet } = validateSnippet(parsed);
    if (!snippet || issues.some((i) => i.level === "error")) {
      toast("error", t("key.snippetInvalid"));
      return;
    }
    onImport(snippet);
  }

  return (
    <Modal title={t("key.importSnippet")} onClose={onClose} wide>
      <p className="muted small">{t("key.importSnippetHint")}</p>
      <textarea className="json-edit" rows={10} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button type="button" className="primary" disabled={!text.trim()} onClick={handleImport}>
          {t("common.import")}
        </button>
      </div>
    </Modal>
  );
}
