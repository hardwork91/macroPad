import { useEffect, useState } from "react";
import { useI18n } from "./i18n";
import { useAppStore } from "./store/appStore";
import { useLinkStore } from "./store/linkStore";
import { EditorView } from "./ui/EditorView";
import { LibraryView } from "./ui/LibraryView";
import { LiveView } from "./ui/LiveView";
import { SlotsView } from "./ui/SlotsView";
import { Splash } from "./ui/Splash";
import { TopBar } from "./ui/TopBar";
import { Welcome } from "./ui/Welcome";

export default function App() {
  const { t } = useI18n();
  const { ready, init, view, toasts, dismissToast } = useAppStore();
  const [introDone, setIntroDone] = useState(false);
  const conn = useLinkStore((s) => s.conn);

  useEffect(() => {
    void init();
    // init es idempotente; solo debe correr al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mientras la biblioteca carga, el intro es lo unico en pantalla.
  // En cuanto esta lista se monta la interfaz DEBAJO del intro, para
  // que el fundido de salida la revele en vez de saltar a ella.
  if (!ready) {
    return introDone ? <div className="loading">{t("common.loading")}</div> : <Splash onDone={() => setIntroDone(true)} />;
  }

  return (
    <>
      <TopBar />
      <main>
        {/* Sin pad no hay nada que editar: un solo camino a seguir. */}
        {conn !== "connected" ? (
          <Welcome />
        ) : (
          <>
            {view === "slots" && <SlotsView />}
            {view === "editor" && <EditorView />}
            {view === "library" && <LibraryView />}
            {view === "live" && <LiveView />}
          </>
        )}
      </main>
      <div className="toasts">
        {toasts.map((toast) => (
          <button key={toast.id} type="button" className={`toast ${toast.kind}`} onClick={() => dismissToast(toast.id)}>
            {toast.text}
          </button>
        ))}
      </div>

      {!introDone && <Splash onDone={() => setIntroDone(true)} />}
    </>
  );
}
