// Vista "En vivo": el grid refleja las teclas físicas (o simuladas)
// y el log traduce cada pulsación a MIDI legible.

import { useI18n } from "../i18n";
import { FUNC_KEY_INDEX } from "../schema/types";
import { useAppStore } from "../store/appStore";
import { useLinkStore } from "../store/linkStore";
import { PadGrid, PadCell } from "./PadGrid";
import { keyIcon } from "./utils";

export function LiveView() {
  const { t } = useI18n();
  const { tools, device, toast } = useAppStore();
  const {
    conn,
    kind,
    live,
    setLive,
    pressed,
    activeToolId,
    setActiveTool,
    liveState,
    log,
    clearLog,
    injectKey,
    toggleDemo,
    demoRunning,
  } = useLinkStore();

  // Si LIVE falla, el estado no cambia y el boton parece no hacer nada:
  // sin este aviso el fallo es invisible.
  async function handleToggleLive() {
    try {
      await setLive(!live);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : t("live.toggleFailed"));
    }
  }

  if (conn !== "connected") {
    return (
      <div className="view center-view">
        <div className="panel-card">
          <h2>{t("live.title")}</h2>
          <p className="muted">{t("live.notConnected")}</p>
        </div>
      </div>
    );
  }

  const tool = activeToolId ? tools[activeToolId] : null;
  const slottedIds = [...new Set((device.slots ?? []).filter((s): s is string => s != null && s in tools))];

  const cells: PadCell[] = Array.from({ length: 16 }, (_, i) => {
    const k = tool?.keys[i];
    const color = k && "color" in k ? (k.color as string) : null;
    return {
      color,
      icon: k ? keyIcon(k) : "",
      pressed: pressed[i],
      ctrl: i === FUNC_KEY_INDEX,
      label: i === FUNC_KEY_INDEX ? "Func" : undefined,
    };
  });

  return (
    <div className="view live-view">
      <section className="panel-card grow">
        <div className="live-head">
          <h2>{t("live.title")}</h2>
          <div className="live-controls">
            <label className="field inline">
              <span className="field-label">{t("live.activeTool")}</span>
              <select value={activeToolId ?? ""} onChange={(e) => setActiveTool(e.target.value || null)}>
                <option value="">—</option>
                {slottedIds.map((id) => (
                  <option key={id} value={id}>
                    {tools[id].name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={live ? "danger-outline" : "primary"} onClick={handleToggleLive}>
              {live ? t("live.stop") : t("live.start")}
            </button>
            {kind === "mock" && live && (
              <button type="button" onClick={toggleDemo}>
                {demoRunning ? t("live.demoStop") : t("live.demo")}
              </button>
            )}
          </div>
        </div>

        <PadGrid
          cells={cells}
          onCellDown={kind === "mock" && live ? (i) => injectKey(i, true) : undefined}
          onCellUp={kind === "mock" && live ? (i) => injectKey(i, false) : undefined}
        />
        {kind === "mock" && live && <p className="muted small">{t("live.mockHint")}</p>}
        {!live && <p className="muted small">{t("live.startHint")}</p>}

        {tool && liveState && Object.keys(liveState.vars).length > 0 && (
          <div className="live-vars">
            {Object.entries(liveState.vars).map(([name, value]) => (
              <span key={name} className="var-chip">
                <code>{name}</code> {value}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="panel-card live-log">
        <div className="live-head">
          <h3>{t("live.log")}</h3>
          <button type="button" className="ghost" onClick={clearLog}>
            {t("common.clear")}
          </button>
        </div>
        <div className="log-list">
          {log.length === 0 && <p className="muted small">{t("live.logEmpty")}</p>}
          {log.map((item) => (
            <div key={item.id} className="log-item">
              <span className="log-key">{String(item.entry.keyIndex + 1).padStart(2, "0")}</span>
              {item.entry.color && <span className="log-dot" style={{ background: `#${item.entry.color}` }} />}
              <span className="log-label">{t(item.entry.labelKey)}</span>
              <span className="log-text">{item.entry.text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
