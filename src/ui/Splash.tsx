// Intro de arranque: negro y la animacion de marca, nada mas.
// Se reproduce en cada carga y se puede saltar con cualquier tecla,
// click o el boton de abajo.
//
// El fundido de salida arranca ANTES de que el clip termine y se
// solapa con su ultimo tramo, asi que la interfaz se revela por
// debajo sin que haya un momento muerto en negro.

import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import intro from "../assets/octa-intro.webp";

/** Lo que dura el clip. */
const INTRO_MS = 4500;
/**
 * El fundido arranca cuando el clip termina, no antes: se reproduce
 * una sola vez y se queda quieto en su ultimo fotograma, que es el
 * mismo logo al que funde.
 */
const FADE_START_MS = INTRO_MS;
/** Lo que dura el fundido. Debe coincidir con la transicion del CSS. */
const FADE_MS = 1000;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function Splash({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);
  const reduced = useRef(prefersReducedMotion()).current;

  useEffect(() => {
    const timers: number[] = [];

    function finish() {
      if (doneRef.current) return;
      doneRef.current = true;
      setLeaving(true);
      timers.push(window.setTimeout(onDone, FADE_MS));
    }

    // Con "reduce motion" no se hace esperar a nadie.
    timers.push(window.setTimeout(finish, reduced ? 400 : FADE_START_MS));
    window.addEventListener("keydown", finish);
    window.addEventListener("pointerdown", finish);

    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("pointerdown", finish);
    };
  }, [onDone, reduced]);

  return (
    <div className={`splash${leaving ? " leaving" : ""}`} role="presentation" aria-hidden={leaving}>
      {/*
        El intro reproduce la MISMA estructura que la pantalla de
        bienvenida, con todo oculto salvo el clip. Asi el logo cae
        exactamente donde quedara el logo estatico y el fundido no lo
        mueve de sitio, sea cual sea el tamano de la ventana: si se
        compensara con un desplazamiento fijo, solo cuadraria a una
        altura concreta.
      */}
      <div className="splash-topbar-space" aria-hidden="true" />
      <div className="splash-main">
        <div className="welcome splash-frame">
          <img src={intro} alt="OCTA CTRL" className="welcome-logo splash-motion" />
          <p className="welcome-sub" aria-hidden="true">
            {t("welcome.sub")}
          </p>
          <button type="button" className="primary welcome-connect" aria-hidden="true" tabIndex={-1} disabled>
            {t("conn.connect")}
          </button>
          <p className="welcome-hint" aria-hidden="true">
            {t("welcome.hint")}
          </p>
        </div>
      </div>

      <button type="button" className="splash-skip" onClick={() => setLeaving(true)}>
        skip
      </button>
    </div>
  );
}

export { INTRO_MS };
