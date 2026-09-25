// Editor de tool: grid clickeable + panel por tecla + vars + JSON.

import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { FUNC_KEY_INDEX, MAX_SEQ_STEPS, SequencerSpec, ToolFile, VarDef, referencedVars } from "../schema/types";
import { validateTool } from "../schema/validate";
import { useAppStore } from "../store/appStore";
import { ColorField, IssueList, NumField, SelectField, TextField, ValidationBadge } from "./common";
import { KeyPanel } from "./KeyPanel";
import { PadGrid, PadCell } from "./PadGrid";
import { downloadJson, keyIcon } from "./utils";
import { noteName } from "../live/engine";

export function EditorView() {
  const { t } = useI18n();
  const { tools, selectedToolId, selectTool } = useAppStore();

  if (!selectedToolId || !tools[selectedToolId]) {
    return (
      <div className="view center-view">
        <div className="panel-card">
          <h2>{t("editor.pickTitle")}</h2>
          <p className="muted">{t("editor.pickHint")}</p>
          <div className="assign-list">
            {Object.values(tools).map((tool) => (
              <button key={tool.id} type="button" className="assign-item" onClick={() => selectTool(tool.id)}>
                <span className="assign-swatch" style={{ background: `#${tool.color}` }} />
                <span>
                  {tool.name} <code className="muted">{tool.id}</code>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return <ToolEditor toolId={selectedToolId} />;
}

function ToolEditor({ toolId }: { toolId: string }) {
  const { t } = useI18n();
  const { tools, device, selectedKey, selectKey, updateTool, renameToolId, toast } = useAppStore();
  const tool = tools[toolId];
  const [idDraft, setIdDraft] = useState(tool.id);
  const [tab, setTab] = useState<"key" | "json">("key");

  const { issues } = useMemo(() => validateTool(tool, device), [tool, device]);

  const cells: PadCell[] = tool.keys.map((k, i) => ({
    color: "color" in k ? (k.color as string) : null,
    lit: "color" in k && k.type !== "none",
    icon: keyIcon(k),
    sub: k.type === "none" ? "" : k.type,
    selected: i === selectedKey,
    error: !["none", "note", "scale_note", "chord", "cc", "param"].includes(k.type),
    title: i === FUNC_KEY_INDEX ? t("editor.ctrlKeyHint") : undefined,
  }));

  function commitId() {
    if (idDraft === tool.id) return;
    if (!/^[a-z0-9_]+$/.test(idDraft)) {
      toast("error", t("editor.badId"));
      setIdDraft(tool.id);
      return;
    }
    if (!renameToolId(tool.id, idDraft)) {
      toast("error", t("editor.idTaken", { id: idDraft }));
      setIdDraft(tool.id);
    }
  }

  return (
    <div className="view editor-view">
      <div className="editor-meta panel-card">
        <div className="meta-fields">
          <TextField label={t("editor.name")} value={tool.name} onChange={(v) => updateTool(toolId, (tl) => ({ ...tl, name: v }))} />
          <TextField label="ID" value={idDraft} mono onChange={setIdDraft} onBlur={commitId} />
          <TextField label={t("editor.author")} value={tool.author ?? ""} onChange={(v) => updateTool(toolId, (tl) => ({ ...tl, author: v }))} />
          <ColorField label={t("editor.toolColor")} value={tool.color} onChange={(v) => updateTool(toolId, (tl) => ({ ...tl, color: v }))} />
        </div>
        <div className="meta-actions">
          <ValidationBadge issues={issues} />
          <button type="button" onClick={() => downloadJson(`${tool.id}.json`, tool)}>
            {t("common.export")}
          </button>
        </div>
      </div>

      <div className="editor-cols">
        <div className="editor-left">
          <section className="panel-card">
            <PadGrid cells={cells} onCellClick={selectKey} compact />
          </section>
          {tool.schemaVersion >= 2 && <SequencerPanel toolId={toolId} tool={tool} />}
          <VarsPanel toolId={toolId} tool={tool} />
          <section className="panel-card">
            <h3>{t("editor.validation")}</h3>
            {issues.length === 0 ? <p className="muted small">{t("editor.noIssues")}</p> : <IssueList issues={issues} compact />}
          </section>
        </div>

        <div className="editor-right panel-card">
          <div className="tab-row">
            <button type="button" className={tab === "key" ? "tab active" : "tab"} onClick={() => setTab("key")}>
              {t("editor.keyTab", { key: selectedKey + 1 })}
            </button>
            <button type="button" className={tab === "json" ? "tab active" : "tab"} onClick={() => setTab("json")}>
              JSON
            </button>
          </div>
          {tab === "key" ? <KeyPanel toolId={toolId} tool={tool} keyIndex={selectedKey} /> : <JsonPanel toolId={toolId} tool={tool} />}
        </div>
      </div>
    </div>
  );
}

// ---------------- Secuenciador (v2) ----------------

function SequencerPanel({ toolId, tool }: { toolId: string; tool: ToolFile }) {
  const { t } = useI18n();
  const { device, updateTool } = useAppStore();
  const seq = tool.sequencer;

  const listVars = Object.entries(tool.vars).filter(([, d]) => d.values).map(([n]) => n);
  const allVars = Object.keys(tool.vars);

  function patch(p: Partial<SequencerSpec>) {
    updateTool(toolId, (tl) => ({ ...tl, sequencer: { ...tl.sequencer!, ...p } }));
  }

  if (!seq) {
    return (
      <section className="panel-card">
        <h3>{t("seq.title")}</h3>
        <p className="muted small">{t("seq.none")}</p>
        <button
          type="button"
          onClick={() =>
            updateTool(toolId, (tl) => ({
              ...tl,
              sequencer: {
                type: "phrase",
                maxSteps: MAX_SEQ_STEPS,
                noteRange: [24, 72],
                steps: listVars[0] ?? "",
                rate: listVars[1] ?? listVars[0] ?? "",
                scale: { name: device.scaleOrder[0] ?? "major" },
                root: { pitchClass: 0 },
                gate: { percent: 80 },
              },
            }))
          }
        >
          + {t("seq.title")}
        </button>
      </section>
    );
  }

  const varOptions = (names: string[], allowEmpty = true) => [
    ...(allowEmpty ? [{ value: "", label: "—" }] : []),
    ...names.map((n) => ({ value: n, label: n })),
  ];

  return (
    <section className="panel-card">
      <h3>
        {t("seq.title")}
        <span className="seq-badge">{seq.type}</span>
      </h3>

      <div className="seq-grid">
        <NumField label={t("seq.maxSteps")} value={seq.maxSteps} min={1} max={MAX_SEQ_STEPS} onChange={(v) => patch({ maxSteps: v })} />
        <SelectField label={t("seq.steps")} value={seq.steps} options={varOptions(listVars)} onChange={(v) => patch({ steps: v })} />
        <SelectField label={t("seq.rate")} value={seq.rate} options={varOptions(listVars)} onChange={(v) => patch({ rate: v })} />
        <SelectField
          label={t("seq.transpose")}
          value={seq.transpose ?? ""}
          options={varOptions(listVars)}
          onChange={(v) => patch({ transpose: v || undefined })}
        />
        <SelectField
          label={t("seq.mutation")}
          value={seq.mutation ?? ""}
          options={varOptions(listVars)}
          onChange={(v) => patch({ mutation: v || undefined })}
        />
        <SelectField
          label={t("seq.hold")}
          value={seq.hold ?? ""}
          options={varOptions(listVars)}
          onChange={(v) => patch({ hold: v || undefined })}
        />
      </div>

      <div className="field-row" style={{ marginTop: 12 }}>
        <NumField
          label={`${t("seq.noteRange")} ▼`}
          value={seq.noteRange[0]}
          min={0}
          max={127}
          onChange={(v) => patch({ noteRange: [v, seq.noteRange[1]] })}
          hint={noteName(seq.noteRange[0])}
        />
        <NumField
          label={`${t("seq.noteRange")} ▲`}
          value={seq.noteRange[1]}
          min={0}
          max={127}
          onChange={(v) => patch({ noteRange: [seq.noteRange[0], v] })}
          hint={noteName(seq.noteRange[1])}
        />
      </div>

      <div className="field-row">
        <SelectField
          label={t("seq.scale")}
          value={"name" in seq.scale ? seq.scale.name : `var:${seq.scale.var}`}
          options={[
            ...device.scaleOrder.map((s) => ({ value: s, label: `${t("seq.fixedScale")}: ${s}` })),
            ...allVars.map((v) => ({ value: `var:${v}`, label: `${t("seq.scaleFromVar")}: ${v}` })),
          ]}
          onChange={(v) => patch({ scale: v.startsWith("var:") ? { var: v.slice(4) } : { name: v } })}
        />
        <SelectField
          label={t("seq.root")}
          value={"pitchClass" in seq.root ? String(seq.root.pitchClass) : `var:${seq.root.var}`}
          options={[
            ...Array.from({ length: 12 }, (_, i) => ({ value: String(i), label: noteName(60 + i).replace("4", "") })),
            ...listVars.map((v) => ({ value: `var:${v}`, label: `${t("seq.scaleFromVar")}: ${v}` })),
          ]}
          onChange={(v) =>
            patch({ root: v.startsWith("var:") ? { var: v.slice(4) } : { pitchClass: parseInt(v, 10) } })
          }
        />
      </div>

      <div className="field-row">
        {"percent" in seq.gate ? (
          <NumField
            label={t("seq.gatePercent")}
            value={seq.gate.percent}
            min={1}
            max={100}
            onChange={(v) => patch({ gate: { percent: v } })}
          />
        ) : (
          <SelectField
            label={t("seq.gate")}
            value={`var:${seq.gate.var}`}
            options={varOptions(listVars.map((v) => `var:${v}`), false).map((o) => ({
              value: o.value,
              label: o.label.replace("var:", ""),
            }))}
            onChange={(v) => patch({ gate: { var: v.slice(4) } })}
          />
        )}
        <label className="field">
          <span className="field-label">{t("seq.gate")}</span>
          <select
            value={"percent" in seq.gate ? "percent" : "var"}
            onChange={(e) =>
              patch({ gate: e.target.value === "percent" ? { percent: 80 } : { var: listVars[0] ?? "" } })
            }
          >
            <option value="percent">%</option>
            <option value="var">var</option>
          </select>
        </label>
      </div>

      <div className="field-row">
        <label className="check-label">
          <input
            type="checkbox"
            checked={seq.ratchet !== undefined}
            onChange={(e) =>
              patch({ ratchet: e.target.checked ? { hits: [12, 8], velocityRamp: [100, 1] } : undefined })
            }
          />
          {t("seq.ratchet")}
        </label>
        {seq.ratchet && (
          <TextField
            label={t("key.ratchetHits")}
            value={seq.ratchet.hits.join(", ")}
            mono
            onChange={(v) => {
              const hits = v
                .split(",")
                .map((s) => parseInt(s.trim(), 10))
                .filter((n) => !Number.isNaN(n) && n > 0);
              patch({ ratchet: { ...seq.ratchet!, hits: hits.length > 0 ? hits : [12] } });
            }}
          />
        )}
      </div>
    </section>
  );
}

// ---------------- Vars ----------------

function VarsPanel({ toolId, tool }: { toolId: string; tool: ToolFile }) {
  const { t } = useI18n();
  const { updateTool, toast } = useAppStore();
  const [newVar, setNewVar] = useState("");

  const varNames = Object.keys(tool.vars);

  function updateVar(name: string, patch: Partial<VarDef>) {
    updateTool(toolId, (tl) => ({ ...tl, vars: { ...tl.vars, [name]: { ...tl.vars[name], ...patch } } }));
  }

  function removeVar(name: string) {
    const usedBy = tool.keys
      .map((k, i) => (referencedVars(k, tool.vars).includes(name) ? i + 1 : null))
      .filter((n): n is number => n !== null);
    const msg = usedBy.length > 0 ? t("vars.deleteUsedConfirm", { name, keys: usedBy.join(", ") }) : t("vars.deleteConfirm", { name });
    if (!window.confirm(msg)) return;
    updateTool(toolId, (tl) => {
      const vars = { ...tl.vars };
      delete vars[name];
      return { ...tl, vars };
    });
  }

  return (
    <section className="panel-card">
      <h3>{t("vars.title")}</h3>
      {varNames.length === 0 && <p className="muted small">{t("vars.none")}</p>}
      {varNames.length > 0 && (
        <div className="vars-table">
          <div className="vars-head">
            <span>{t("vars.name")}</span>
            <span>init</span>
            <span>min</span>
            <span>max</span>
            <span>wrap</span>
            <span>maxVar</span>
            <span>±</span>
            <span />
          </div>
          {varNames.map((name) => {
            const def = tool.vars[name];

            // Var de lista: el valor es un indice dentro de values, asi que
            // la fila de min/max/maxVar no aplica y se edita la lista entera.
            if (def.values) {
              return (
                <div key={name} className="vars-row list">
                  <code>{name}</code>
                  <input
                    type="number"
                    value={def.init}
                    min={0}
                    max={def.values.length - 1}
                    title={String(def.values[def.init] ?? "")}
                    onChange={(e) => updateVar(name, { init: parseInt(e.target.value, 10) || 0 })}
                  />
                  <input
                    type="text"
                    className="mono var-values"
                    value={def.values.join(", ")}
                    onChange={(e) => {
                      const parts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                      const vals = parts.map((s) => (/^-?\d+$/.test(s) ? parseInt(s, 10) : s));
                      updateVar(name, { values: vals.length > 0 ? vals : [0] });
                    }}
                  />
                  <input
                    type="checkbox"
                    checked={def.wrap ?? false}
                    onChange={(e) => updateVar(name, { wrap: e.target.checked || undefined })}
                  />
                  <button
                    type="button"
                    className="ghost icon-btn"
                    title={t("vars.toRange")}
                    onClick={() =>
                      updateTool(toolId, (tl) => {
                        const d = { ...tl.vars[name] };
                        delete d.values;
                        d.min = 0;
                        d.max = Math.max(d.init, 1);
                        return { ...tl, vars: { ...tl.vars, [name]: d } };
                      })
                    }
                  >
                    ⇄
                  </button>
                  <button type="button" className="ghost icon-btn" title={t("common.delete")} onClick={() => removeVar(name)}>
                    ✕
                  </button>
                </div>
              );
            }

            return (
              <div key={name} className="vars-row">
                <code>{name}</code>
                <input type="number" value={def.init} onChange={(e) => updateVar(name, { init: parseInt(e.target.value, 10) || 0 })} />
                <input type="number" value={def.min} onChange={(e) => updateVar(name, { min: parseInt(e.target.value, 10) || 0 })} />
                <input
                  type="number"
                  value={def.max ?? ""}
                  disabled={def.maxVar !== undefined}
                  placeholder={def.maxVar ? "dyn" : ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    updateVar(name, { max: Number.isNaN(v) ? undefined : v });
                  }}
                />
                <input type="checkbox" checked={def.wrap ?? false} onChange={(e) => updateVar(name, { wrap: e.target.checked || undefined })} />
                <select
                  value={def.maxVar ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || undefined;
                    updateTool(toolId, (tl) => {
                      const d = { ...tl.vars[name] };
                      if (v) {
                        d.maxVar = v;
                        delete d.max;
                        if (d.maxOffset === undefined) d.maxOffset = 0;
                      } else {
                        delete d.maxVar;
                        delete d.maxOffset;
                        if (d.max === undefined) d.max = Math.max(d.init, d.min ?? 0);
                      }
                      return { ...tl, vars: { ...tl.vars, [name]: d } };
                    });
                  }}
                >
                  <option value="">—</option>
                  {varNames
                    .filter((v) => v !== name)
                    .map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                </select>
                <input
                  type="number"
                  value={def.maxOffset ?? ""}
                  disabled={def.maxVar === undefined}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    updateVar(name, { maxOffset: Number.isNaN(v) ? undefined : v });
                  }}
                />
                {tool.schemaVersion >= 2 && (
                  <button
                    type="button"
                    className="ghost icon-btn"
                    title={t("vars.toList")}
                    onClick={() =>
                      updateTool(toolId, (tl) => {
                        const d = { ...tl.vars[name] };
                        const lo = d.min ?? 0;
                        const hi = d.max ?? lo + 3;
                        d.values = Array.from({ length: Math.min(hi - lo + 1, 16) }, (_, i) => lo + i);
                        d.init = 0;
                        delete d.min;
                        delete d.max;
                        delete d.maxVar;
                        delete d.maxOffset;
                        return { ...tl, vars: { ...tl.vars, [name]: d } };
                      })
                    }
                  >
                    ⇄
                  </button>
                )}
                <button type="button" className="ghost icon-btn" title={t("common.delete")} onClick={() => removeVar(name)}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="add-row">
        <input type="text" className="mono" placeholder={t("vars.newPlaceholder")} value={newVar} onChange={(e) => setNewVar(e.target.value)} />
        <button
          type="button"
          disabled={!/^[a-z0-9_]+$/.test(newVar) || newVar in tool.vars}
          onClick={() => {
            updateTool(toolId, (tl) => ({ ...tl, vars: { ...tl.vars, [newVar]: { init: 0, min: 0, max: 10 } } }));
            setNewVar("");
            toast("info", t("vars.added", { name: newVar }));
          }}
        >
          {t("common.add")}
        </button>
      </div>
      <p className="muted small">{t("vars.reservedHint")}</p>
    </section>
  );
}

// ---------------- JSON ----------------

function JsonPanel({ toolId, tool }: { toolId: string; tool: ToolFile }) {
  const { t } = useI18n();
  const { updateTool, renameToolId, toast, device } = useAppStore();
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const pretty = JSON.stringify(tool, null, 2);

  function applyDraft() {
    if (draft === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      toast("error", t("editor.jsonParseError"));
      return;
    }
    const { issues, tool: next } = validateTool(parsed, device);
    if (!next || issues.some((i) => i.level === "error")) {
      toast("error", t("editor.jsonInvalid"));
      return;
    }
    if (next.id !== toolId && !renameToolId(toolId, next.id)) {
      toast("error", t("editor.idTaken", { id: next.id }));
      return;
    }
    updateTool(next.id, () => next);
    setDraft(null);
    toast("success", t("editor.jsonApplied"));
  }

  return (
    <div className="json-panel">
      <div className="json-actions">
        <button type="button" onClick={() => navigator.clipboard.writeText(pretty).then(() => toast("info", t("common.copied")))}>
          {t("common.copy")}
        </button>
        <label className="check-label">
          <input type="checkbox" checked={advanced} onChange={(e) => { setAdvanced(e.target.checked); setDraft(null); }} />
          {t("editor.advancedMode")}
        </label>
        {advanced && draft !== null && (
          <>
            <button type="button" className="primary" onClick={applyDraft}>
              {t("common.apply")}
            </button>
            <button type="button" className="ghost" onClick={() => setDraft(null)}>
              {t("common.discard")}
            </button>
          </>
        )}
      </div>
      {advanced ? (
        <textarea className="json-edit" spellCheck={false} value={draft ?? pretty} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <pre className="json-view">{pretty}</pre>
      )}
    </div>
  );
}
