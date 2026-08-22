import type { CodeSymbol, SymbolKind } from "../../types";
import {
  JAVASCRIPT_RESOLUTION_EXTENSIONS,
  extractJavaScriptImports,
  extractJavaScriptSymbols,
} from "./javascript";
import {
  MAX_SYMBOLS_PER_FILE,
  createSymbol,
  leadingWhitespace,
  resolveProjectSpecifier,
  stripCommentsPreservingLines,
  unique,
  type LanguageAdapter,
} from "./shared";

const TYPESCRIPT_RESOLUTION_EXTENSIONS = [
  "ts",
  "tsx",
  "mts",
  "cts",
  "d.ts",
  ...JAVASCRIPT_RESOLUTION_EXTENSIONS,
];

const DECLARATION_KIND: Record<string, SymbolKind> = {
  interface: "interface",
  type: "type",
  enum: "enum",
  namespace: "namespace",
  module: "namespace",
};

export function extractTypeScriptImports(content: string) {
  const imports = extractJavaScriptImports(content);
  const withoutComments = stripCommentsPreservingLines(content, /\/\*[\s\S]*?\*\//g);
  for (const match of withoutComments.matchAll(
    /^\s*\/\/\/\s*<reference\s+(?:path|types)=["']([^"']+)["']/gm,
  )) {
    imports.push(match[1]);
  }
  return unique(imports);
}

export function extractTypeScriptSymbols(path: string, content: string) {
  const symbols: CodeSymbol[] = extractJavaScriptSymbols(path, content, "TypeScript");
  const seen = new Set(symbols.map((symbol) => symbol.id));
  const activeInterfaceIndents: number[] = [];
  const withoutComments = stripCommentsPreservingLines(content, /\/\*[\s\S]*?\*\//g);

  withoutComments.split("\n").forEach((line, index) => {
    if (symbols.length >= MAX_SYMBOLS_PER_FILE) return;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) return;
    const indent = leadingWhitespace(line);
    while (
      activeInterfaceIndents.length > 0 &&
      indent <= activeInterfaceIndents[activeInterfaceIndents.length - 1] &&
      trimmed.startsWith("}")
    ) {
      activeInterfaceIndents.pop();
    }

    const declaration = trimmed.match(
      /^(?:(?:export|default|declare|abstract)\s+)*(interface|type|enum|namespace|module)\s+([A-Za-z_$][\w$]*)/,
    );
    if (declaration) {
      const kind = DECLARATION_KIND[declaration[1]];
      const symbol = createSymbol(
        path,
        declaration[2],
        kind,
        trimmed.replace(/\s*\{.*$/, "").replace(/\s*=.*$/, ""),
        index + 1,
        "TypeScript",
      );
      if (!seen.has(symbol.id)) {
        symbols.push(symbol);
        seen.add(symbol.id);
      }
      if (declaration[1] === "interface") activeInterfaceIndents.push(indent);
      return;
    }

    if (activeInterfaceIndents.length > 0) {
      const method = trimmed.match(
        /^(?:readonly\s+)?([A-Za-z_$][\w$]*)(?:\s*<[^>{}]+>)?\s*\([^)]*\)\s*[?:]/,
      );
      if (method) {
        const symbol = createSymbol(
          path,
          method[1],
          "method",
          trimmed.replace(/;$/, ""),
          index + 1,
          "TypeScript",
        );
        if (!seen.has(symbol.id)) {
          symbols.push(symbol);
          seen.add(symbol.id);
        }
      }
    }
  });

  return symbols.slice(0, MAX_SYMBOLS_PER_FILE);
}

export const typescriptAdapter: LanguageAdapter = {
  extensions: ["ts", "tsx", "mts", "cts"],
  kind: "typescript",
  analyze(path, content, context) {
    const imports = extractTypeScriptImports(content);
    const importLinks = imports.map((value) => ({
      value,
      targetPath:
        resolveProjectSpecifier(
          path,
          value,
          context,
          TYPESCRIPT_RESOLUTION_EXTENSIONS,
          true,
        ) ?? undefined,
    }));
    return {
      imports,
      importLinks,
      resolvedImports: unique(
        importLinks
          .map((link) => link.targetPath)
          .filter((value): value is string => Boolean(value)),
      ),
      symbols: extractTypeScriptSymbols(path, content),
    };
  },
};
