import type { CodeSymbol } from "../../types";
import {
  MAX_SYMBOLS_PER_FILE,
  createSymbol,
  leadingWhitespace,
  resolveProjectSpecifier,
  stripCommentsPreservingLines,
  unique,
  type LanguageAdapter,
} from "./shared";

const JAVASCRIPT_RESOLUTION_EXTENSIONS = [
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "css",
  "html",
];

function extractJavaScriptImports(content: string) {
  const imports: string[] = [];
  const withoutBlockComments = stripCommentsPreservingLines(
    content,
    /\/\*[\s\S]*?\*\//g,
  );
  for (const match of withoutBlockComments.matchAll(
    /\b(?:import|export)\s+(?:[^\n'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  )) {
    imports.push(match[1]);
  }
  for (const match of withoutBlockComments.matchAll(
    /\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  )) {
    imports.push(match[1]);
  }
  return unique(imports);
}

function extractJavaScriptSymbols(path: string, content: string) {
  const symbols: CodeSymbol[] = [];
  const activeClassIndents: number[] = [];
  const contentWithoutBlockComments = stripCommentsPreservingLines(
    content,
    /\/\*[\s\S]*?\*\//g,
  );

  contentWithoutBlockComments.split("\n").forEach((line, index) => {
    if (symbols.length >= MAX_SYMBOLS_PER_FILE) return;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) return;
    const indent = leadingWhitespace(line);
    while (
      activeClassIndents.length > 0 &&
      indent <= activeClassIndents[activeClassIndents.length - 1] &&
      trimmed.startsWith("}")
    ) {
      activeClassIndents.pop();
    }

    const classMatch = trimmed.match(
      /^(?:(?:export\s+)?(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/,
    );
    if (classMatch) {
      symbols.push(
        createSymbol(
          path,
          classMatch[1],
          "class",
          trimmed.replace(/\s*\{.*$/, ""),
          index + 1,
          "JavaScript",
        ),
      );
      activeClassIndents.push(indent);
      return;
    }

    const functionMatch = trimmed.match(
      /^(?:(?:export\s+)?(?:default\s+)?)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)\s*\(/,
    );
    if (functionMatch) {
      symbols.push(
        createSymbol(
          path,
          functionMatch[1],
          "function",
          trimmed.replace(/\s*\{.*$/, ""),
          index + 1,
          "JavaScript",
        ),
      );
      return;
    }

    const variableMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/,
    );
    if (variableMatch) {
      const functionValue =
        /^(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(
          variableMatch[2],
        ) || /^(?:async\s+)?function\b/.test(variableMatch[2]);
      symbols.push(
        createSymbol(
          path,
          variableMatch[1],
          functionValue ? "function" : "variable",
          trimmed.replace(/\s*\{.*$/, ""),
          index + 1,
          "JavaScript",
        ),
      );
      return;
    }

    if (activeClassIndents.length > 0) {
      const methodMatch = trimmed.match(
        /^(?:(?:static|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/,
      );
      if (
        methodMatch &&
        !["if", "for", "while", "switch", "catch"].includes(methodMatch[1])
      ) {
        symbols.push(
          createSymbol(
            path,
            methodMatch[1],
            "method",
            trimmed.replace(/\s*\{.*$/, ""),
            index + 1,
            "JavaScript",
          ),
        );
      }
    }
  });

  return symbols;
}

export const javascriptAdapter: LanguageAdapter = {
  extensions: ["js", "jsx", "mjs", "cjs"],
  kind: "javascript",
  analyze(path, content, context) {
    const imports = extractJavaScriptImports(content);
    const importLinks = imports.map((value) => ({
      value,
      targetPath:
        resolveProjectSpecifier(
          path,
          value,
          context,
          JAVASCRIPT_RESOLUTION_EXTENSIONS,
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
      symbols: extractJavaScriptSymbols(path, content),
    };
  },
};
