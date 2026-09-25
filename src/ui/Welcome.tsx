// Pantalla de entrada: sin pad conectado no hay nada que editar, asi
// que en vez de una interfaz vacia se muestra un unico camino a seguir.

import { useState } from "react";
import { useI18n } from "../i18n";
import logo from "../assets/octa-logo.png";
import { serialSupported } from "../device/SerialDeviceLink";
import { useAppStore } from "../store/appStore";
import { useLinkStore } from "../store/linkStore";

export function Welcome() {
  const { t } = useI18n();
  const { toast } = useAppStore();
  const { connect, pull, conn } = useLinkStore();
  const [busy, setBusy] = useState(false);

  const supported = serialSupported();

  async function handleConnect() {
    setBusy(true);
    try {
      await connect();
      const n = await pull();
      toast("success", t("welcome.loaded", { n }));
    } catch (err) {
      // Cancelar el selector de puertos no es un fallo que avisar.
      if (err instanceof DOMException && err.name === "NotFoundError") return;
      toast("error", err instanceof Error ? err.message : t("conn.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <img src={logo} alt="OCTA CTRL" className="welcome-logo" />
      <p className="welcome-sub">{t("welcome.sub")}</p>

      {supported ? (
        <>
          <button type="button" className="primary welcome-connect" onClick={handleConnect} disabled={busy}>
            {busy || conn === "connecting" ? t("conn.connecting") : t("conn.connect")}
          </button>
          <p className="welcome-hint">{t("welcome.hint")}</p>
        </>
      ) : (
        <p className="welcome-unsupported">{t("conn.serialUnsupported")}</p>
      )}
    </div>
  );
}
