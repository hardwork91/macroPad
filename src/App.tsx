import { useEffect } from "react";
import { useI18n } from "./i18n";
import { useAppStore } from "./store/appStore";
import { EditorView } from "./ui/EditorView";
import { LibraryView } from "./ui/LibraryView";
import { LiveView } from "./ui/LiveView";
import { SlotsView } from "./ui/SlotsView";
import { TopBar } from "./ui/TopBar";

export default function App() {
  const { t } = useI18n();
  const { ready, init, view, toasts, dismissToast } = useAppStore();

  useEffect(() => {
    void init();
    // init es idempotente; solo debe correr al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return <div className="loading">{t("common.loading")}</div>;
  }

  return (
    <>
      <TopBar />
      <main>
        {view === "slots" && <SlotsView />}
        {view === "editor" && <EditorView />}
        {view === "library" && <LibraryView />}
        {view === "live" && <LiveView />}
      </main>
      <div className="toasts">
        {toasts.map((toast) => (
          <button key={toast.id} type="button" className={`toast ${toast.kind}`} onClick={() => dismissToast(toast.id)}>
            {toast.text}
          </button>
        ))}
      </div>
    </>
  );
}
