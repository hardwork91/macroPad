import { KeyDef } from "../schema/types";
import { Issue } from "../schema/validate";
import { TFunc } from "../i18n";

/** hex RRGGBB (contrato) -> color CSS. */
export const cssColor = (hex?: string | null) => (hex ? `#${hex}` : "transparent");

/** color CSS #rrggbb -> hex RRGGBB del contrato. */
export const fromCssColor = (v: string) => v.replace(/^#/, "").toUpperCase();

export function keyIcon(key: KeyDef | undefined): string {
  switch (key?.type) {
    case "note":
      return "♪";
    case "scale_note":
      return "♫";
    case "chord":
      return "♪♪";
    case "cc":
      return "CC";
    case "param":
      return "⚙";
    case "none":
    case undefined:
      return "";
    default:
      return "?";
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function issueText(issue: Issue, t: TFunc): string {
  const msg = t(issue.msgKey, issue.params);
  return issue.path ? `${issue.path}: ${msg}` : msg;
}

/** Luminancia aproximada para decidir texto claro/oscuro sobre un color. */
export function isDarkColor(hex: string): boolean {
  const v = parseInt(hex, 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}
