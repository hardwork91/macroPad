// Barra superior: navegación, idioma, conexión y sincronización.

import { useEffect, useMemo, useRef, useState } from "react";
import brandIcon from "../assets/octa-icon.png";
import { useI18n } from "../i18n";
import { hasErrors, validateDevice, validateTool } from "../schema/validate";
import { useAppStore, View } from "../store/appStore";
import { useLinkStore } from "../store/linkStore";

const VIEWS: View[] = ["slots", "editor", "library", "live"];

export function TopBar() {
  const { t, lang, setLang } = useI18n();
  const { view, setView, device, tools, toast } = useAppStore();
  const { conn, connect, disconnect, pull, fwVersion, sync, syncing } = useLinkStore();
  const [connecting, setConnecting] = useState(false);
  const barRef = useRef<HTMLElement>(null);

  // El intro coloca su clip donde caera el logo de la bienvenida, y
  // para eso necesita saber cuanto ocupa esta barra. Su altura depende
  // del contenido (con o sin pestanas) y del ancho, asi que se publica
  // medida en vez de repetirla como numero magico en el CSS.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const publicar = () =>
      document.documentElement.style.setProperty("--topbar-h", `${el.getBoundingClientRect().height}px`);
    publicar();
    const ro = new ResizeObserver(publicar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
      const n = await pull();
      toast("success", t("welcome.loaded", { n }));
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
    <header className="topbar" ref={barRef}>
      <div className="brand">
        <img src={brandIcon} alt="" className="brand-icon" />
        <span className="brand-name">OCTA CTRL</span>
      </div>

      {/* Sin pad conectado no hay ninguna vista que ofrecer. */}
      {conn === "connected" && (
        <nav className="tabs">
          {VIEWS.map((v) => (
            <button key={v} type="button" className={view === v ? "tab active" : "tab"} onClick={() => setView(v)}>
              {t(`nav.${v}`)}
            </button>
          ))}
        </nav>
      )}

      <div className="topbar-right">
        <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value as "en" | "es")} title={t("nav.language")}>
          <option value="en">EN</option>
          <option value="es">ES</option>
        </select>


        {conn === "connected" && (
          <button type="button" className="danger-outline" onClick={handleConnect} disabled={connecting}>
            {t("conn.disconnect")}
          </button>
        )}

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
