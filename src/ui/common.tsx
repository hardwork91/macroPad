// Piezas compartidas: modal, lista de issues, inputs tipados.

import { ReactNode } from "react";
import { useI18n } from "../i18n";
import { Issue } from "../schema/validate";
import { cssColor, fromCssColor, issueText } from "./utils";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="ghost icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function IssueList({ issues, compact }: { issues: Issue[]; compact?: boolean }) {
  const { t } = useI18n();
  if (issues.length === 0) return null;
  return (
    <ul className={`issue-list${compact ? " compact" : ""}`}>
      {issues.map((iss, i) => (
        <li key={i} className={iss.level}>
          <span className="issue-badge">{iss.level === "error" ? t("common.error") : t("common.warning")}</span>
          {issueText(iss, t)}
        </li>
      ))}
    </ul>
  );
}

export function ValidationBadge({ issues }: { issues: Issue[] }) {
  const { t } = useI18n();
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  if (errors === 0 && warnings === 0) return <span className="badge ok">✓ {t("common.valid")}</span>;
  return (
    <span className="badge-group">
      {errors > 0 && <span className="badge err">{t("common.nErrors", { n: errors })}</span>}
      {warnings > 0 && <span className="badge warn">{t("common.nWarnings", { n: warnings })}</span>}
    </span>
  );
}

export function NumField({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number | undefined;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!Number.isNaN(v)) onChange(v);
        }}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (hex: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="color-input">
        <input type="color" value={cssColor(value ?? "FFFFFF")} onChange={(e) => onChange(fromCssColor(e.target.value))} />
        <code>{value ?? "—"}</code>
      </span>
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  onBlur,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        type="text"
        className={mono ? "mono" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
