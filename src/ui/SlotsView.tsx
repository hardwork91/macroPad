// Pantalla principal: asignación Func+tecla -> tool (slots) y
// configuración global del dispositivo (device.json).

import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { FUNC_KEY_INDEX, NUM_KEYS } from "../schema/types";
import { validateDevice } from "../schema/validate";
import { useAppStore } from "../store/appStore";
import { IssueList, Modal, NumField } from "./common";
import { PadGrid, PadCell } from "./PadGrid";

export function SlotsView() {
  const { t } = useI18n();
  const { device, tools, setSlot, updateDevice, selectTool, setView } = useAppStore();
  const [assigning, setAssigning] = useState<number | null>(null);
  const [newScale, setNewScale] = useState("");

  const slots = device.slots ?? Array(NUM_KEYS).fill(null);
  const deviceIssues = useMemo(() => validateDevice(device, Object.keys(tools)).issues, [device, tools]);

  const cells: PadCell[] = slots.map((id, i) => {
    if (i === FUNC_KEY_INDEX) {
      return { ctrl: true, label: "Func", disabled: true, title: t("slots.ctrlTooltip") };
    }
    const tool = id ? tools[id] : null;
    if (!tool) return { label: "—", sub: t("slots.empty"), title: t("slots.assignHint") };
    return { color: tool.color, lit: true, label: tool.name, title: `${tool.name} (${tool.id})` };
  });

  function swapSlots(from: number, to: number) {
    if (to === FUNC_KEY_INDEX || from === FUNC_KEY_INDEX) return;
    const next = [...slots];
    [next[from], next[to]] = [next[to], next[from]];
    updateDevice((d) => ({ ...d, slots: next }));
  }

  return (
    <div className="view slots-view">
      <section className="panel-card grow">
        <h2>{t("slots.title")}</h2>
        <p className="muted">{t("slots.subtitle")}</p>
        <PadGrid cells={cells} onCellClick={(i) => i !== FUNC_KEY_INDEX && setAssigning(i)} draggable onSwap={swapSlots} />
        <IssueList issues={deviceIssues} />
      </section>

      <section className="panel-card device-settings">
        <h2>{t("slots.deviceTitle")}</h2>
        <div className="field-row">
          <NumField label={t("device.midiChannel")} value={device.midiChannel} min={1} max={16} onChange={(v) => updateDevice((d) => ({ ...d, midiChannel: v }))} />
          <NumField label={t("device.velocity")} value={device.velocity} min={1} max={127} onChange={(v) => updateDevice((d) => ({ ...d, velocity: v }))} />
          <NumField label={t("device.brightness")} value={device.brightness} min={0} max={255} onChange={(v) => updateDevice((d) => ({ ...d, brightness: v }))} />
        </div>

        <h3>{t("device.scales")}</h3>
        <p className="muted small">{t("device.scalesHint")}</p>
        <div className="scales-table">
          {device.scaleOrder.map((name) => (
            <div key={name} className="scale-row">
              <code className="scale-name">{name}</code>
              {(device.scales[name] ?? Array(7).fill(0)).map((iv, j) => (
                <input
                  key={j}
                  type="number"
                  min={0}
                  max={24}
                  value={iv}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (Number.isNaN(v)) return;
                    updateDevice((d) => {
                      const intervals = [...(d.scales[name] ?? Array(7).fill(0))];
                      intervals[j] = v;
                      return { ...d, scales: { ...d.scales, [name]: intervals } };
                    });
                  }}
                />
              ))}
              <button
                type="button"
                className="ghost icon-btn"
                title={t("common.delete")}
                onClick={() => {
                  if (!window.confirm(t("device.deleteScaleConfirm", { name }))) return;
                  updateDevice((d) => {
                    const scales = { ...d.scales };
                    delete scales[name];
                    return { ...d, scales, scaleOrder: d.scaleOrder.filter((s) => s !== name) };
                  });
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div className="add-row">
          <input
            type="text"
            className="mono"
            placeholder={t("device.newScalePlaceholder")}
            value={newScale}
            onChange={(e) => setNewScale(e.target.value)}
          />
          <button
            type="button"
            disabled={!/^[a-z0-9_]+$/.test(newScale) || newScale in device.scales}
            onClick={() => {
              updateDevice((d) => ({
                ...d,
                scaleOrder: [...d.scaleOrder, newScale],
                scales: { ...d.scales, [newScale]: [0, 2, 4, 5, 7, 9, 11] },
              }));
              setNewScale("");
            }}
          >
            {t("common.add")}
          </button>
        </div>
      </section>

      {assigning !== null && (
        <Modal title={t("slots.assignTitle", { key: assigning + 1 })} onClose={() => setAssigning(null)}>
          <div className="assign-list">
            <button
              type="button"
              className="assign-item"
              onClick={() => {
                setSlot(assigning, null);
                setAssigning(null);
              }}
            >
              <span className="assign-swatch empty" />
              {t("slots.empty")}
            </button>
            {Object.values(tools).map((tool) => (
              <button
                key={tool.id}
                type="button"
                className="assign-item"
                onClick={() => {
                  setSlot(assigning, tool.id);
                  setAssigning(null);
                }}
              >
                <span className="assign-swatch" style={{ background: `#${tool.color}` }} />
                <span>
                  {tool.name} <code className="muted">{tool.id}</code>
                </span>
              </button>
            ))}
            {Object.keys(tools).length === 0 && (
              <p className="muted">
                {t("slots.noTools")}{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setAssigning(null);
                    selectTool(null);
                    setView("library");
                  }}
                >
                  {t("nav.library")}
                </button>
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
