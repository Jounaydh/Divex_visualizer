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

export const JAVASCRIPT_RESOLUTION_EXTENSIONS = [
  "ts",
  "tsx",
  "mts",
  "cts",
  "d.ts",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "css",
  "html",
];

export function extractJavaScriptImports(content: string) {
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

export function extractJavaScriptSymbols(
  path: string,
  content: string,
  language = "JavaScript",
) {
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
      /^(?:(?:export|default|abstract|declare)\s+)*class\s+([A-Za-z_$][\w$]*)/,
    );
    if (classMatch) {
      symbols.push(
        createSymbol(
          path,
          classMatch[1],
          "class",
          trimmed.replace(/\s*\{.*$/, ""),
          index + 1,
          language,
        ),
      );
      activeClassIndents.push(indent);
      return;
    }

    const functionMatch = trimmed.match(
      /^(?:(?:export|default|declare)\s+)*(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)(?:\s*<[^>{}]+>)?\s*\(/,
    );
    if (functionMatch) {
      symbols.push(
        createSymbol(
          path,
          functionMatch[1],
          "function",
          trimmed.replace(/\s*\{.*$/, ""),
          index + 1,
          language,
        ),
      );
      return;
    }

    const variableMatch = trimmed.match(
      /^(?:(?:export|declare)\s+)*(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*.*?)?\s*=(?!>)\s*(.*)$/,
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
          language,
        ),
      );
      return;
    }

    if (activeClassIndents.length > 0) {
      const methodMatch = trimmed.match(
        /^(?:(?:public|private|protected|static|abstract|override|async|get|set|readonly)\s+)*([A-Za-z_$][\w$]*)(?:\s*<[^>{}]+>)?\s*\([^)]*\)\s*(?::\s*[^={;]+)?\s*\{/,
      );
      if (
        methodMatch &&
        !["if", "for", "while", "switch", "catch"].includes(methodMatch[1])
      ) {
        symbols.push(
          createSymbol(
            path,
            methodMatch[1],
            methodMatch[1] === "constructor" ? "constructor" : "method",
            trimmed.replace(/\s*\{.*$/, ""),
            index + 1,
            language,
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
