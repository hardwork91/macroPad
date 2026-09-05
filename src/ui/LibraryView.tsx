// Biblioteca: tools locales, importar/exportar, duplicar, validación.

import { useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { ToolFile } from "../schema/types";
import { Issue, validateTool } from "../schema/validate";
import { useAppStore } from "../store/appStore";
import { IssueList, Modal, ValidationBadge } from "./common";
import { downloadJson } from "./utils";

export function LibraryView() {
  const { t } = useI18n();
  const { tools, device, selectTool, setView, createTool, duplicateTool, deleteTool } = useAppStore();
  const [importOpen, setImportOpen] = useState(false);

  const list = Object.values(tools);

  return (
    <div className="view library-view">
      <div className="library-head">
        <h2>{t("library.title")}</h2>
        <div className="library-actions">
          <button type="button" onClick={() => setImportOpen(true)}>
            {t("common.import")}
          </button>
          <button type="button" className="primary" onClick={() => createTool()}>
            + {t("library.newTool")}
          </button>
        </div>
      </div>

      <div className="library-grid">
        {list.map((tool) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            onEdit={() => {
              selectTool(tool.id);
              setView("editor");
            }}
            onDuplicate={() => duplicateTool(tool.id)}
            onExport={() => downloadJson(`${tool.id}.json`, tool)}
            onDelete={() => {
              if (window.confirm(t("library.deleteConfirm", { name: tool.name }))) deleteTool(tool.id);
            }}
          />
        ))}
        {list.length === 0 && <p className="muted">{t("library.empty")}</p>}
      </div>

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function ToolCard({
  tool,
  onEdit,
  onDuplicate,
  onExport,
  onDelete,
}: {
  tool: ToolFile;
  onEdit: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const { device } = useAppStore();
  const issues = useMemo(() => validateTool(tool, device).issues, [tool, device]);

  return (
    <div className="tool-card" style={{ "--tool-color": `#${tool.color}` } as React.CSSProperties}>
      <div className="tool-card-head">
        <span className="tool-swatch" />
        <div>
          <h3>{tool.name}</h3>
          <code className="muted">{tool.id}</code>
          {tool.author && <p className="muted small">{tool.author}</p>}
        </div>
      </div>
      <ValidationBadge issues={issues} />
      <div className="tool-card-actions">
        <button type="button" className="primary" onClick={onEdit}>
          {t("common.edit")}
        </button>
        <button type="button" onClick={onDuplicate}>
          {t("library.duplicate")}
        </button>
        <button type="button" onClick={onExport}>
          {t("common.export")}
        </button>
        <button type="button" className="ghost danger-text" onClick={onDelete}>
          {t("common.delete")}
        </button>
      </div>
    </div>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { tools, device, importTool, toast } = useAppStore();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ issues: Issue[]; tool: ToolFile | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function validate(raw: string) {
    setText(raw);
    if (!raw.trim()) {
      setResult(null);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setResult({ issues: [{ level: "error", path: "", msgKey: "val.jsonParse" }], tool: null });
      return;
    }
    setResult(validateTool(parsed, device));
  }

  async function pickFile(f: File | undefined) {
    if (!f) return;
    validate(await f.text());
  }

  const canImport = result?.tool != null && !result.issues.some((i) => i.level === "error");

  function doImport() {
    const tool = result!.tool!;
    if (tools[tool.id] && !window.confirm(t("library.overwriteConfirm", { id: tool.id }))) return;
    importTool(tool);
    toast("success", t("library.imported", { name: tool.name }));
    onClose();
  }

  return (
    <Modal title={t("library.importTitle")} onClose={onClose} wide>
      <p className="muted small">{t("library.importHint")}</p>
      <div className="import-actions">
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()}>
          {t("library.chooseFile")}
        </button>
      </div>
      <textarea
        className="json-edit"
        rows={12}
        spellCheck={false}
        placeholder={t("library.pastePlaceholder")}
        value={text}
        onChange={(e) => validate(e.target.value)}
      />
      {result && <IssueList issues={result.issues} compact />}
      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onClose}>
          {t("common.cancel")}
        </button>
        <button type="button" className="primary" disabled={!canImport} onClick={doImport}>
          {t("common.import")}
        </button>
      </div>
    </Modal>
  );
}
