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

const HTML_RESOLUTION_EXTENSIONS = [
  "html",
  "htm",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "css",
];

function attributeValue(tag: string, attribute: string) {
  const match = tag.match(
    new RegExp(
      `\\b${attribute}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`,
      "i",
    ),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function extractHtmlReferences(content: string) {
  const references: string[] = [];
  for (const match of content.matchAll(/<script\b[^>]*>/gi)) {
    const source = attributeValue(match[0], "src");
    if (source) references.push(source);
  }
  for (const match of content.matchAll(/<link\b[^>]*>/gi)) {
    const relationship = attributeValue(match[0], "rel")?.toLowerCase();
    const href = attributeValue(match[0], "href");
    if (href && relationship?.split(/\s+/).includes("stylesheet")) {
      references.push(href);
    }
  }
  return unique(references);
}

function extractHtmlSymbols(path: string, content: string) {
  const symbols: CodeSymbol[] = [];
  const seenCustomElements = new Set<string>();
  const withoutComments = stripCommentsPreservingLines(
    content,
    /<!--[\s\S]*?-->/g,
  );

  for (const match of withoutComments.matchAll(
    /<([a-z][\w:-]*)(?:\s[^<>]*?)?>/gi,
  )) {
    if (symbols.length >= MAX_SYMBOLS_PER_FILE) break;
    const tag = match[0];
    const tagName = match[1].toLowerCase();
    const id = attributeValue(tag, "id");
    const line = lineNumberAt(withoutComments, match.index);
    if (id) {
      symbols.push(
        createSymbol(
          path,
          `#${id}`,
          "element",
          tag.length > 160 ? `${tag.slice(0, 157)}...` : tag,
          line,
          "HTML",
        ),
      );
    }
    if (tagName.includes("-") && !seenCustomElements.has(tagName)) {
      seenCustomElements.add(tagName);
      symbols.push(
        createSymbol(
          path,
          `<${tagName}>`,
          "element",
          tag.length > 160 ? `${tag.slice(0, 157)}...` : tag,
          line,
          "HTML",
        ),
      );
    }
  }

  return symbols.slice(0, MAX_SYMBOLS_PER_FILE);
}

export const htmlAdapter: LanguageAdapter = {
  extensions: ["html", "htm"],
  kind: "html",
  analyze(path, content, context) {
    const imports = extractHtmlReferences(content);
    const importLinks = imports.map((value) => ({
      value,
      targetPath:
        resolveProjectSpecifier(
          path,
          value,
          context,
          HTML_RESOLUTION_EXTENSIONS,
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
      symbols: extractHtmlSymbols(path, content),
    };
  },
};
