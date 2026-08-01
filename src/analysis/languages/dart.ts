import type { CodeSymbol } from "../../types";

const describeSymbol = (kind: CodeSymbol["kind"], name: string) => {
  const noun = kind === "widget" ? "Flutter widget" : kind;
  return `${name} is a ${noun} defined in this file. Select it to inspect its code and relationships.`;
};

export function extractDartImports(content: string) {
  return [...content.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map(
    (match) => match[1],
  );
}

export function extractDartSymbols(
  path: string,
  content: string,
): CodeSymbol[] {
  if (!path.endsWith(".dart")) return [];

  const symbols: CodeSymbol[] = [];
  const lines = content.split("\n");
  const classPattern =
    /^\s*(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$<>, ]*))?/;
  const functionPattern =
    /^\s*(?:Future<[^>]+>|Future<void>|void|Widget|String|int|double|bool|List<[^>]+>|Map<[^>]+>|[A-Z][\w<>?, ]+)\s+([a-zA-Z_$][\w$]*)\s*\(([^;]*)\)\s*(?:async\s*)?(?:\{|=>)/;

  lines.forEach((line, index) => {
    const classMatch = line.match(classPattern);
    if (classMatch) {
      const isWidget = /(?:StatelessWidget|StatefulWidget)/.test(
        classMatch[2] ?? "",
      );
      const kind: CodeSymbol["kind"] = isWidget ? "widget" : "class";
      symbols.push({
        id: `${path}:symbol:${classMatch[1]}:${index + 1}`,
        name: classMatch[1],
        kind,
        signature: line.trim().replace(/\s*\{$/, ""),
        line: index + 1,
        description: describeSymbol(kind, classMatch[1]),
      });
      return;
    }

    const functionMatch = line.match(functionPattern);
    if (
      functionMatch &&
      !["if", "for", "while", "switch"].includes(functionMatch[1])
    ) {
      const name = functionMatch[1];
      const indent = line.length - line.trimStart().length;
      const kind: CodeSymbol["kind"] = indent > 0 ? "method" : "function";
      symbols.push({
        id: `${path}:symbol:${name}:${index + 1}`,
        name,
        kind,
        signature: line.trim().replace(/\s*(?:async\s*)?\{.*$/, ""),
        line: index + 1,
        description: describeSymbol(kind, name),
      });
    }
  });

  return symbols;
}

export function resolveDartImport(
  sourcePath: string,
  importValue: string,
  projectName: string,
  knownPaths: Set<string>,
) {
  if (
    importValue.startsWith("dart:") ||
    importValue.startsWith("package:flutter")
  ) {
    return null;
  }

  if (importValue.startsWith(`package:${projectName}/`)) {
    const candidate = `lib/${importValue.slice(projectName.length + 9)}`;
    return knownPaths.has(candidate) ? candidate : null;
  }

  if (importValue.startsWith("package:")) return null;

  const sourceParts = sourcePath.split("/");
  sourceParts.pop();
  for (const part of importValue.split("/")) {
    if (part === "..") sourceParts.pop();
    else if (part !== ".") sourceParts.push(part);
  }
  const resolved = sourceParts.join("/");
  return knownPaths.has(resolved) ? resolved : null;
}
