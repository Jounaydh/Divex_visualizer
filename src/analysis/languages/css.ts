import type { CodeSymbol } from "../../types";
import {
  MAX_SYMBOLS_PER_FILE,
  createSymbol,
  lineNumberAt,
  resolveProjectSpecifier,
  stripCommentsPreservingLines,
  unique,
  type LanguageAdapter,
} from "./shared";

function extractCssImports(content: string) {
  return unique(
    [
      ...content.matchAll(
        /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^'")\s;]+))\s*\)?/gi,
      ),
    ]
      .map((match) => match[1] ?? match[2] ?? match[3])
      .filter(Boolean),
  );
}

function extractCssSymbols(path: string, content: string) {
  const symbols: CodeSymbol[] = [];
  const seenSelectors = new Set<string>();
  const withoutComments = stripCommentsPreservingLines(
    content,
    /\/\*[\s\S]*?\*\//g,
  ).replace(/@import[^;]+;/gi, (match) =>
    match.replace(/[^\r\n]/g, " "),
  );

  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    if (symbols.length >= MAX_SYMBOLS_PER_FILE) break;
    const selectorGroup = match[1].trim();
    if (
      !selectorGroup ||
      selectorGroup.startsWith("@") ||
      selectorGroup.includes(";")
    ) {
      continue;
    }
    const line = lineNumberAt(withoutComments, match.index);
    for (const rawSelector of selectorGroup.split(",")) {
      const selector = rawSelector.replace(/\s+/g, " ").trim();
      if (
        !selector ||
        selector === "from" ||
        selector === "to" ||
        /^\d+(?:\.\d+)?%$/.test(selector) ||
        seenSelectors.has(selector)
      ) {
        continue;
      }
      seenSelectors.add(selector);
      symbols.push(
        createSymbol(
          path,
          selector,
          "selector",
          `${selector} {`,
          line,
          "CSS",
        ),
      );
      if (symbols.length >= MAX_SYMBOLS_PER_FILE) break;
    }
  }

  return symbols;
}

export const cssAdapter: LanguageAdapter = {
  extensions: ["css"],
  kind: "css",
  analyze(path, content, context) {
    const imports = extractCssImports(content);
    const importLinks = imports.map((value) => ({
      value,
      targetPath:
        resolveProjectSpecifier(
          path,
          value,
          context,
          ["css"],
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
      symbols: extractCssSymbols(path, content),
    };
  },
};
