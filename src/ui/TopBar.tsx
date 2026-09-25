// Barra superior: navegación, idioma, conexión y sincronización.

import { useMemo, useState } from "react";
import brandIcon from "../assets/octa-icon.png";
import { useI18n } from "../i18n";
import { hasErrors, validateDevice, validateTool } from "../schema/validate";
import { serialSupported } from "../device/SerialDeviceLink";
import { useAppStore, View } from "../store/appStore";
import { useLinkStore } from "../store/linkStore";

const VIEWS: View[] = ["slots", "editor", "library", "live"];

export function TopBar() {
  const { t, lang, setLang } = useI18n();
  const { view, setView, device, tools, toast } = useAppStore();
  const { kind, setKind, conn, connect, disconnect, fwVersion, sync, syncing } = useLinkStore();
  const [connecting, setConnecting] = useState(false);

  // Gate de sincronización: jamás viaja un JSON inválido al dispositivo.
  const slottedTools = useMemo(() => {
    const ids = new Set((device.slots ?? []).filter((s): s is string => s != null));
    return [...ids].map((id) => tools[id]).filter(Boolean);
  }, [device, tools]);

  const syncBlocked = useMemo(() => {
    if (hasErrors(validateDevice(device, Object.keys(tools)).issues)) return true;
    return slottedTools.some((tool) => hasErrors(validateTool(tool, device).issues));
  }, [device, tools, slottedTools]);

  async function handleConnect() {
    if (conn === "connected") {
      await disconnect();
      return;
    }
    setConnecting(true);
    try {
      await connect();
      toast("success", t("conn.connected"));
    } catch (err) {
      // Cancelar el selector de puertos no es un fallo: no hay nada que avisar.
      if (err instanceof DOMException && err.name === "NotFoundError") return;

      let msg: string;
      if (err instanceof Error && err.message === "serial-unsupported") {
        msg = t("conn.serialUnsupported");
      } else if (err instanceof DOMException && err.name === "NetworkError") {
        // Puerto tomado por otro programa: el monitor serie del IDE es
        // el culpable habitual, y el mensaje del navegador no lo dice.
        msg = t("conn.portBusy");
      } else {
        msg = `${t("conn.failed")}: ${err instanceof Error ? err.message : String(err)}`;
      }
      toast("error", msg);
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    try {
      await sync(device, slottedTools);
      toast("success", t("conn.syncDone", { n: slottedTools.length }));
    } catch {
      toast("error", t("conn.syncFailed"));
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <img src={brandIcon} alt="" className="brand-icon" />
        <span className="brand-name">OCTA CTRL</span>
      </div>

      <nav className="tabs">
        {VIEWS.map((v) => (
          <button key={v} type="button" className={view === v ? "tab active" : "tab"} onClick={() => setView(v)}>
            {t(`nav.${v}`)}
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value as "en" | "es")} title={t("nav.language")}>
          <option value="en">EN</option>
          <option value="es">ES</option>
        </select>

        <select
          className="link-select"
          value={kind}
          disabled={conn !== "disconnected"}
          onChange={(e) => setKind(e.target.value as "mock" | "serial")}
          title={t("conn.kind")}
        >
          <option value="mock">{t("conn.mock")}</option>
          <option value="serial" disabled={!serialSupported()}>
            {t("conn.serial")}
            {!serialSupported() ? ` (${t("conn.unavailable")})` : ""}
          </option>
        </select>

        <button type="button" className={conn === "connected" ? "danger-outline" : "primary"} onClick={handleConnect} disabled={connecting}>
          {conn === "connected" ? t("conn.disconnect") : connecting ? t("conn.connecting") : t("conn.connect")}
        </button>

        <span className={`conn-dot ${conn}`} title={fwVersion ? `fw ${fwVersion}` : ""} />

        {conn === "connected" && (
          <button
            type="button"
            className="primary"
            onClick={handleSync}
            disabled={syncBlocked || syncing}
            title={syncBlocked ? t("conn.syncBlocked") : ""}
          >
            {syncing ? t("conn.syncing") : t("conn.sync")}
          </button>
        )}
      </div>
    </header>
  );
}
