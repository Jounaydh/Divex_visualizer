import type {
  AnalyzedFile,
  AnalyzedProject,
  CodeSymbol,
  VisualNodeKind,
} from "../../types";

export type NavigationSearchMode =
  | "files"
  | "symbols"
  | "text"
  | "commands"
  | "references";

export interface NavigationTarget {
  kind: "file" | "symbol" | "text";
  path: string;
  line: number;
  symbolId?: string;
}

export interface NavigationSearchResult {
  id: string;
  kind: "file" | "symbol" | "text" | "reference";
  title: string;
  subtitle: string;
  path: string;
  line: number;
  symbolId?: string;
  symbolKind?: VisualNodeKind;
  preview?: string;
  score: number;
}

function fuzzyScore(value: string, query: string) {
  const candidate = value.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 1;
  if (candidate === normalizedQuery) return 1200;
  if (candidate.startsWith(normalizedQuery)) return 1000;
  const directIndex = candidate.indexOf(normalizedQuery);
  if (directIndex >= 0) return 800 - Math.min(directIndex, 200);

  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((word) => candidate.includes(word))) {
    return 600;
  }

  let queryIndex = 0;
  let gapCost = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] !== normalizedQuery[queryIndex]) continue;
    if (queryIndex > 0) gapCost += index;
    queryIndex += 1;
    if (queryIndex === normalizedQuery.length) {
      return Math.max(100, 400 - gapCost);
    }
  }
  return 0;
}

function sortAndLimit(
  results: NavigationSearchResult[],
  limit: number,
) {
  return results
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.title.localeCompare(right.title) ||
        left.path.localeCompare(right.path),
    )
    .slice(0, limit);
}

function symbolLocation(
  project: AnalyzedProject,
  symbolId: string,
): { file: AnalyzedFile; symbol: CodeSymbol } | null {
  for (const file of project.files) {
    const symbol = file.symbols.find((candidate) => candidate.id === symbolId);
    if (symbol) return { file, symbol };
  }
  return null;
}

export function searchProjectFiles(
  project: AnalyzedProject,
  query: string,
  limit = 80,
) {
  const results = project.files.flatMap((file) => {
    const score = Math.max(
      fuzzyScore(file.name, query) + 50,
      fuzzyScore(file.path, query),
    );
    if (score <= 0) return [];
    return [
      {
        id: `file:${file.path}`,
        kind: "file" as const,
        title: file.name,
        subtitle: file.path,
        path: file.path,
        line: 1,
        score,
      },
    ];
  });
  return sortAndLimit(results, limit);
}

export function searchProjectSymbols(
  project: AnalyzedProject,
  query: string,
  limit = 80,
) {
  const results = project.files.flatMap((file) =>
    file.symbols.flatMap((symbol) => {
      const score = Math.max(
        fuzzyScore(symbol.name, query) + 75,
        fuzzyScore(symbol.signature, query) + 25,
        fuzzyScore(`${file.path} ${symbol.name}`, query),
      );
      if (score <= 0) return [];
      return [
        {
          id: symbol.id,
          kind: "symbol" as const,
          title: symbol.name,
          subtitle: `${symbol.kind} · ${file.path}:${symbol.line}`,
          path: file.path,
          line: symbol.line,
          symbolId: symbol.id,
          symbolKind: symbol.kind,
          preview: symbol.signature,
          score,
        },
      ];
    }),
  );
  return sortAndLimit(results, limit);
}

export function searchProjectText(
  project: AnalyzedProject,
  query: string,
  limit = 80,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];

  const results: NavigationSearchResult[] = [];
  for (const file of project.files) {
    const lines = file.content.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const matchIndex = line.toLowerCase().indexOf(normalizedQuery);
      if (matchIndex < 0) continue;
      results.push({
        id: `text:${file.path}:${index + 1}:${matchIndex}`,
        kind: "text",
        title: file.name,
        subtitle: `${file.path}:${index + 1}`,
        path: file.path,
        line: index + 1,
        preview: line.trim().slice(0, 240),
        score:
          900 -
          Math.min(matchIndex, 200) +
          fuzzyScore(file.name, normalizedQuery) / 10,
      });
      if (results.length >= limit * 4) break;
    }
    if (results.length >= limit * 4) break;
  }
  return sortAndLimit(results, limit);
}

export function findProjectReferences(
  project: AnalyzedProject,
  nodeId: string | null,
  limit = 100,
) {
  if (!nodeId) return [];
  const results: NavigationSearchResult[] = [];
  const resultLocations = new Set<string>();
  const selectedFile = project.files.find((file) => file.id === nodeId);
  const selectedSymbol = symbolLocation(project, nodeId);

  if (selectedFile) {
    project.files.forEach((file) => {
      if (!file.resolvedImports.includes(selectedFile.path)) return;
      const line =
        file.content
          .split("\n")
          .findIndex((contentLine) =>
            contentLine.includes(selectedFile.name.replace(/\.dart$/, "")),
          ) + 1 || 1;
      resultLocations.add(`${file.path}:${line}`);
      results.push({
        id: `reference:import:${file.path}:${selectedFile.path}`,
        kind: "reference",
        title: file.name,
        subtitle: `imports ${selectedFile.name} · ${file.path}:${line}`,
        path: file.path,
        line,
        preview: `${file.name} imports ${selectedFile.name}`,
        score: 900,
      });
    });
  }

  project.relationships.forEach((relationship) => {
    if (relationship.targetId !== nodeId) return;
    const source = symbolLocation(project, relationship.sourceId);
    if (!source) return;
    const locationKey = `${source.file.path}:${relationship.line}`;
    if (resultLocations.has(locationKey)) return;
    resultLocations.add(locationKey);
    results.push({
      id: `reference:${relationship.id}`,
      kind: "reference",
      title: source.symbol.name,
      subtitle: `${relationship.kind} · ${source.file.path}:${relationship.line}`,
      path: source.file.path,
      line: relationship.line,
      symbolId: source.symbol.id,
      symbolKind: source.symbol.kind,
      preview: relationship.explanation,
      score: relationship.confidence === "exact" ? 1000 : 800,
    });
  });

  if (selectedSymbol) {
    const escapedName = selectedSymbol.symbol.name.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const usagePattern = new RegExp(`\\b${escapedName}\\b`);
    for (const file of project.files) {
      const lines = file.content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const line = index + 1;
        if (
          (file.id === selectedSymbol.file.id &&
            line === selectedSymbol.symbol.line) ||
          !usagePattern.test(lines[index])
        ) {
          continue;
        }
        const locationKey = `${file.path}:${line}`;
        if (resultLocations.has(locationKey)) continue;
        resultLocations.add(locationKey);
        results.push({
          id: `reference:usage:${nodeId}:${file.path}:${line}`,
          kind: "reference",
          title: selectedSymbol.symbol.name,
          subtitle: `usage · ${file.path}:${line}`,
          path: file.path,
          line,
          preview: lines[index].trim().slice(0, 240),
          score: 700,
        });
        if (results.length >= limit * 2) break;
      }
      if (results.length >= limit * 2) break;
    }
  }

  return sortAndLimit(results, limit);
}

export function navigationTarget(
  result: NavigationSearchResult,
): NavigationTarget {
  return {
    kind: result.kind === "reference" ? "text" : result.kind,
    path: result.path,
    line: result.line,
    symbolId: result.symbolId,
  };
}

export function definitionTarget(
  project: AnalyzedProject,
  nodeId: string | null,
): NavigationTarget | null {
  if (!nodeId) return null;
  const file = project.files.find((candidate) => candidate.id === nodeId);
  if (file) return { kind: "file", path: file.path, line: 1 };
  const location = symbolLocation(project, nodeId);
  if (!location) return null;
  return {
    kind: "symbol",
    path: location.file.path,
    line: location.symbol.line,
    symbolId: location.symbol.id,
  };
}
