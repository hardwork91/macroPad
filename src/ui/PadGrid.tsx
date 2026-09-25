// Grid 2x8 del pad físico. Reutilizado por Slots, Editor y En vivo.
// Índice 0-7 = fila superior, 8-15 = inferior; 15 = Func.

import { FUNC_KEY_INDEX, NUM_KEYS } from "../schema/types";
import { cssColor } from "./utils";

export interface PadCell {
  color?: string | null;
  label?: string;
  sub?: string;
  icon?: string;
  disabled?: boolean;
  selected?: boolean;
  lit?: boolean;
  pressed?: boolean;
  error?: boolean;
  ctrl?: boolean;
  title?: string;
}

interface Props {
  cells: PadCell[];
  onCellClick?: (i: number) => void;
  onCellDown?: (i: number) => void;
  onCellUp?: (i: number) => void;
  draggable?: boolean;
  onSwap?: (from: number, to: number) => void;
  compact?: boolean;
}

export function PadGrid({ cells, onCellClick, onCellDown, onCellUp, draggable, onSwap, compact }: Props) {
  return (
    <div className={`pad-grid${compact ? " compact" : ""}`}>
      {Array.from({ length: NUM_KEYS }, (_, i) => {
        const c = cells[i] ?? {};
        const litColor = c.lit || c.pressed ? cssColor(c.color) : undefined;
        const cls = [
          "pad-cell",
          c.selected && "selected",
          c.disabled && "disabled",
          c.pressed && "pressed",
          c.error && "error",
          c.ctrl && "ctrl",
          (c.lit || c.pressed) && "lit",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={i}
            type="button"
            className={cls}
            title={c.title}
            disabled={c.disabled}
            style={litColor ? ({ "--cell-led": litColor } as React.CSSProperties) : undefined}
            onClick={onCellClick ? () => onCellClick(i) : undefined}
            onPointerDown={onCellDown ? () => onCellDown(i) : undefined}
            onPointerUp={onCellUp ? () => onCellUp(i) : undefined}
            onPointerLeave={onCellUp ? () => onCellUp(i) : undefined}
            draggable={draggable && !c.disabled && i !== FUNC_KEY_INDEX}
            onDragStart={
              draggable
                ? (e) => {
                    e.dataTransfer.setData("text/plain", String(i));
                    e.dataTransfer.effectAllowed = "move";
                  }
                : undefined
            }
            onDragOver={draggable && !c.disabled ? (e) => e.preventDefault() : undefined}
            onDrop={
              draggable && onSwap
                ? (e) => {
                    e.preventDefault();
                    const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
                    if (!Number.isNaN(from) && from !== i) onSwap(from, i);
                  }
                : undefined
            }
          >
            <span className="pad-num">{String(i + 1).padStart(2, "0")}</span>
            {c.icon && <span className="pad-icon">{c.icon}</span>}
            {c.label && <span className="pad-label">{c.label}</span>}
            {c.sub && <span className="pad-sub">{c.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
