// Intro de arranque: negro y la animacion de marca, nada mas.
// Se reproduce entera en cada carga; se puede saltar con cualquier
// tecla, click o el boton de abajo.

import { useEffect, useRef, useState } from "react";
import intro from "../assets/octa-intro.webp";

/** Lo que dura el clip. */
const INTRO_MS = 4500;

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
    function finish() {
      if (doneRef.current) return;
      doneRef.current = true;
      setLeaving(true);
      window.setTimeout(onDone, 420); // que termine el fundido
    }

    // Con "reduce motion" el clip se ve un instante y se aparta:
    // quien pide menos movimiento no quiere 4,5 s de animacion.
    const timer = window.setTimeout(finish, reduced ? 700 : INTRO_MS);
    window.addEventListener("keydown", finish);
    window.addEventListener("pointerdown", finish);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("pointerdown", finish);
    };
  }, [onDone, reduced]);

  return (
    <div className={`splash${leaving ? " leaving" : ""}`} role="presentation">
      <img src={intro} alt="OCTA CTRL" className="splash-motion" />

      <button type="button" className="splash-skip" onClick={() => setLeaving(true)}>
        skip
      </button>
    </div>
  );
}
