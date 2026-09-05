import { KeyDef, KeySnippet, SCHEMA_VERSION, ToolFile, VarDef, referencedVars } from "./types";

/** Exporta una tecla como snippet autocontenido (§3.4). */
export function buildKeySnippet(tool: ToolFile, keyIndex: number): KeySnippet {
  const key = tool.keys[keyIndex] as KeyDef;
  const requiredVars: Record<string, VarDef> = {};
  for (const name of referencedVars(key, tool.vars)) {
    if (tool.vars[name]) requiredVars[name] = tool.vars[name];
  }
  return { schemaVersion: SCHEMA_VERSION, keySnippet: true, key: structuredClone(key), requiredVars };
}

export interface SnippetMergePlan {
  /** Vars que faltan en la tool destino y se añadirían. */
  missing: string[];
  /** Vars que existen con definición distinta (requieren confirmación). */
  conflicting: string[];
}

export function planSnippetMerge(tool: ToolFile, snippet: KeySnippet): SnippetMergePlan {
  const missing: string[] = [];
  const conflicting: string[] = [];
  for (const [name, def] of Object.entries(snippet.requiredVars)) {
    const existing = tool.vars[name];
    if (!existing) missing.push(name);
    else if (JSON.stringify(existing) !== JSON.stringify(def)) conflicting.push(name);
  }
  return { missing, conflicting };
}

/**
 * Aplica el snippet: pega la tecla y fusiona vars.
 * `overwriteConflicts` decide qué hacer con vars ya existentes distintas.
 */
export function applySnippet(
  tool: ToolFile,
  keyIndex: number,
  snippet: KeySnippet,
  overwriteConflicts: boolean,
): ToolFile {
  const vars = { ...tool.vars };
  for (const [name, def] of Object.entries(snippet.requiredVars)) {
    if (!vars[name] || overwriteConflicts) vars[name] = structuredClone(def);
  }
  const keys = tool.keys.slice();
  keys[keyIndex] = structuredClone(snippet.key);
  return { ...tool, vars, keys };
}
