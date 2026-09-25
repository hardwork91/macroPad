// Intro de arranque: negro y la animacion de marca, nada mas.
// Se reproduce en cada carga y se puede saltar con cualquier tecla,
// click o el boton de abajo.
//
// El fundido de salida arranca ANTES de que el clip termine y se
// solapa con su ultimo tramo, asi que la interfaz se revela por
// debajo sin que haya un momento muerto en negro.

import { useEffect, useRef, useState } from "react";
import intro from "../assets/octa-intro.webp";

/** Lo que dura el clip. */
const INTRO_MS = 4500;
/** Cuando empieza el fundido: solapado con el final de la animacion. */
const FADE_START_MS = 3500;
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
      <img src={intro} alt="OCTA CTRL" className="splash-motion" />

      <button type="button" className="splash-skip" onClick={() => setLeaving(true)}>
        skip
      </button>
    </div>
  );
}

export { INTRO_MS };
