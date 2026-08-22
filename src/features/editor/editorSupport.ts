import { languageLabelForKind } from "../../analysis/languages/metadata";
import type { AnalyzedFile, CodeSymbol } from "../../types";

export function aceModeForExtension(extension: string) {
  const modes: Record<string, string> = {
    cjs: "ace/mode/javascript",
    css: "ace/mode/css",
    dart: "ace/mode/dart",
    htm: "ace/mode/html",
    html: "ace/mode/html",
    java: "ace/mode/java",
    js: "ace/mode/javascript",
    jsx: "ace/mode/jsx",
    json: "ace/mode/json",
    mjs: "ace/mode/javascript",
    ts: "ace/mode/typescript",
    mts: "ace/mode/typescript",
    cts: "ace/mode/typescript",
    tsx: "ace/mode/tsx",
    py: "ace/mode/python",
    pyw: "ace/mode/python",
    python: "ace/mode/python",
    yaml: "ace/mode/yaml",
    yml: "ace/mode/yaml",
  };
  return modes[extension.toLowerCase()] ?? "ace/mode/text";
}

export function fileLanguage(file: AnalyzedFile) {
  return languageLabelForKind(file.kind, file.extension);
}

export function closestSymbol(symbols: CodeSymbol[], line: number) {
  return (
    symbols
      .filter((symbol) => symbol.line <= line && symbol.endLine >= line)
      .sort(
        (left, right) =>
          left.endLine - left.line - (right.endLine - right.line),
      )[0] ?? null
  );
}
