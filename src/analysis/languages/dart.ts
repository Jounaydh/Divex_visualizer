import type {
  AnalyzedFile,
  CodeRelationship,
  CodeSymbol,
} from "../../types";

const describeSymbol = (kind: CodeSymbol["kind"], name: string) => {
  const noun = kind === "widget" ? "Flutter widget" : kind;
  return `${name} is a ${noun} defined in this file. Select it to inspect its code and relationships.`;
};

export function extractDartImports(content: string) {
  return [...content.matchAll(/^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/gm)].map(
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

  const findEndLine = (startIndex: number) => {
    let braceDepth = 0;
    let foundOpeningBrace = false;
    for (let index = startIndex; index < lines.length; index += 1) {
      const line = lines[index]
        .replace(/\/\/.*$/, "")
        .replace(/'(?:\\.|[^'\\])*'/g, "''")
        .replace(/"(?:\\.|[^"\\])*"/g, '""');
      for (const character of line) {
        if (character === "{") {
          foundOpeningBrace = true;
          braceDepth += 1;
        } else if (character === "}" && foundOpeningBrace) {
          braceDepth -= 1;
          if (braceDepth === 0) return index + 1;
        }
      }
      if (!foundOpeningBrace && /(?:=>|;)\s*$/.test(line.trim())) {
        return index + 1;
      }
    }
    return startIndex + 1;
  };

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
        endLine: findEndLine(index),
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
        endLine: findEndLine(index),
        description: describeSymbol(kind, name),
      });
    }
  });

  const classSymbols = symbols.filter(
    (symbol) => symbol.kind === "class" || symbol.kind === "widget",
  );
  symbols.forEach((symbol) => {
    if (symbol.kind !== "method") return;
    const owner = classSymbols
      .filter(
        (candidate) =>
          candidate.line < symbol.line && candidate.endLine >= symbol.endLine,
      )
      .sort((a, b) => b.line - a.line)[0];
    if (owner) symbol.parentSymbolId = owner.id;
  });

  return symbols;
}

const DART_CONTROL_WORDS = new Set([
  "assert",
  "catch",
  "do",
  "else",
  "for",
  "if",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "while",
]);

const relationVerb: Record<CodeRelationship["kind"], string> = {
  calls: "calls",
  creates: "creates",
  extends: "inherits behavior from",
  implements: "implements",
  uses: "uses",
};

function stripDartCommentsAndStrings(content: string) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

function relationshipExplanation(
  sourceName: string,
  targetName: string,
  kind: CodeRelationship["kind"],
) {
  return `${sourceName} ${relationVerb[kind]} ${targetName}. This connects the behavior in both code parts.`;
}

export function extractDartRelationships(
  files: AnalyzedFile[],
): CodeRelationship[] {
  const dartFiles = files.filter((file) => file.kind === "dart");
  const fileByPath = new Map(dartFiles.map((file) => [file.path, file]));
  const fileBySymbolId = new Map<string, AnalyzedFile>();
  const symbolsByName = new Map<string, CodeSymbol[]>();
  dartFiles.forEach((file) => {
    file.symbols.forEach((symbol) => {
      fileBySymbolId.set(symbol.id, file);
      const matches = symbolsByName.get(symbol.name) ?? [];
      matches.push(symbol);
      symbolsByName.set(symbol.name, matches);
    });
  });

  const relationships: CodeRelationship[] = [];
  const seen = new Set<string>();
  const linkedTargetIdsBySource = new Map<string, Set<string>>();
  const accessibleTargets = new Map<string, CodeSymbol[]>();

  const addRelationship = ({
    source,
    sourceFile,
    target,
    targetName,
    targetPath,
    kind,
    line,
    confidence,
  }: {
    source: CodeSymbol;
    sourceFile: AnalyzedFile;
    target?: CodeSymbol;
    targetName: string;
    targetPath?: string;
    kind: CodeRelationship["kind"];
    line: number;
    confidence: CodeRelationship["confidence"];
  }) => {
    const targetId =
      target?.id ?? `external-api:${targetName.replace(/[^\w$.-]+/g, "-")}`;
    const key = `${source.id}:${targetId}:${kind}`;
    if (seen.has(key) || source.id === targetId) return;
    seen.add(key);
    const linkedTargets = linkedTargetIdsBySource.get(source.id) ?? new Set();
    linkedTargets.add(targetId);
    linkedTargetIdsBySource.set(source.id, linkedTargets);
    relationships.push({
      id: `logic:${key}`,
      sourceId: source.id,
      targetId,
      sourcePath: sourceFile.path,
      targetPath: target
        ? fileBySymbolId.get(target.id)?.path
        : targetPath,
      targetName,
      kind,
      line,
      confidence,
      explanation: relationshipExplanation(
        source.name,
        targetName,
        kind,
      ),
    });
  };

  const findTargets = (
    name: string,
    sourceFile: AnalyzedFile,
    source: CodeSymbol,
  ) => {
    const cacheKey = `${sourceFile.path}\u0000${name}`;
    let candidates = accessibleTargets.get(cacheKey);
    if (!candidates) {
      const accessiblePaths = new Set([
        sourceFile.path,
        ...sourceFile.resolvedImports,
      ]);
      candidates = (symbolsByName.get(name) ?? []).filter((candidate) => {
        const candidateFile = fileBySymbolId.get(candidate.id);
        return candidateFile && accessiblePaths.has(candidateFile.path);
      });
      accessibleTargets.set(cacheKey, candidates);
    }
    const sameOwner = candidates.find(
      (candidate) =>
        source.parentSymbolId &&
        candidate.parentSymbolId === source.parentSymbolId,
    );
    if (sameOwner) return [sameOwner];
    const local = candidates.filter(
      (candidate) => fileBySymbolId.get(candidate.id)?.path === sourceFile.path,
    );
    if (local.length === 1) return local;
    return candidates;
  };

  dartFiles.forEach((file) => {
    const lines = file.content.split("\n");
    const externalImport = file.importLinks.find(
      (link) => !link.targetPath,
    )?.value;

    file.symbols.forEach((source) => {
      if (source.kind === "class" || source.kind === "widget") {
        const inheritancePatterns: Array<{
          kind: "extends" | "implements";
          pattern: RegExp;
        }> = [
          { kind: "extends", pattern: /\bextends\s+([A-Za-z_$][\w$]*)/ },
          {
            kind: "implements",
            pattern: /\bimplements\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)/,
          },
        ];
        inheritancePatterns.forEach(({ kind, pattern }) => {
          const match = source.signature.match(pattern);
          if (!match) return;
          match[1].split(",").forEach((rawName) => {
            const targetName = rawName.trim();
            const targets = findTargets(targetName, file, source);
            if (targets.length === 0) {
              addRelationship({
                source,
                sourceFile: file,
                targetName,
                targetPath: externalImport,
                kind,
                line: source.line,
                confidence: "inferred",
              });
            } else {
              targets.forEach((target) =>
                addRelationship({
                  source,
                  sourceFile: file,
                  target,
                  targetName,
                  kind,
                  line: source.line,
                  confidence: targets.length === 1 ? "exact" : "inferred",
                }),
              );
            }
          });
        });
        return;
      }

      const rawBody = lines
        .slice(Math.max(0, source.line - 1), source.endLine)
        .join("\n");
      const openingBrace = rawBody.indexOf("{");
      const arrow = rawBody.indexOf("=>");
      const bodyStart =
        openingBrace >= 0
          ? openingBrace + 1
          : arrow >= 0
            ? arrow + 2
            : rawBody.indexOf("\n") + 1;
      const body = stripDartCommentsAndStrings(rawBody.slice(bodyStart));
      const callPattern =
        /(?:\b[A-Za-z_$][\w$]*\s*\.\s*)?\b([A-Za-z_$][\w$]*)\s*(?:<[^;\n()]+>)?\s*\(/g;

      let previousMatchIndex = 0;
      let bodyLineOffset = 0;
      for (const match of body.matchAll(callPattern)) {
        const targetName = match[1];
        if (DART_CONTROL_WORDS.has(targetName)) continue;
        const targets = findTargets(targetName, file, source);
        const targetKind = targets[0]?.kind;
        const kind: CodeRelationship["kind"] =
          targetKind === "class" ||
          targetKind === "widget" ||
          /^[A-Z]/.test(targetName)
            ? "creates"
            : "calls";
        const matchIndex = match.index ?? previousMatchIndex;
        bodyLineOffset += (
          body.slice(previousMatchIndex, matchIndex).match(/\n/g) ?? []
        ).length;
        previousMatchIndex = matchIndex;
        const line = source.line + bodyLineOffset;

        if (targets.length === 0) {
          addRelationship({
            source,
            sourceFile: file,
            targetName,
            targetPath: externalImport,
            kind,
            line,
            confidence: "inferred",
          });
        } else {
          targets.forEach((target) =>
            addRelationship({
              source,
              sourceFile: file,
              target,
              targetName,
              kind,
              line,
              confidence: targets.length === 1 ? "exact" : "inferred",
            }),
          );
        }
      }

      const linkedTargetIds =
        linkedTargetIdsBySource.get(source.id) ?? new Set<string>();
      const referencedNames = new Set(
        [...body.matchAll(/\b[A-Za-z_$][\w$]*\b/g)].map(
          (match) => match[0],
        ),
      );
      const candidateIds = new Set<string>();
      [
        ...file.symbols,
        ...file.resolvedImports.flatMap(
          (path) => fileByPath.get(path)?.symbols ?? [],
        ),
      ]
        .filter(
          (candidate) =>
            (candidate.kind === "class" || candidate.kind === "widget") &&
            candidate.id !== source.id &&
            !linkedTargetIds.has(candidate.id) &&
            !candidateIds.has(candidate.id) &&
            referencedNames.has(candidate.name),
        )
        .forEach((target) => {
          candidateIds.add(target.id);
          addRelationship({
            source,
            sourceFile: file,
            target,
            targetName: target.name,
            kind: "uses",
            line: source.line,
            confidence: "exact",
          });
        });
    });
  });

  return relationships;
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
