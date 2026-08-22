import type {
  AnalyzedFile,
  CodeRelationship,
  CodeSymbol,
  RelationshipConfidence,
  SourceRange,
} from "../../types";
import { fileLocation } from "../evidence";

interface SqlForeignKeyDefinition {
  sourceTableName: string;
  sourceColumnName?: string;
  targetTableName: string;
  targetColumnName?: string;
  range: SourceRange;
}

export interface SqlFileAnalysis {
  symbols: CodeSymbol[];
  foreignKeys: SqlForeignKeyDefinition[];
}

const SQL_IDENTIFIER = String.raw`(?:"[^"]+"|\`[^\`]+\`|\[[^\]]+\]|[A-Za-z_$][\w$]*)(?:\.(?:"[^"]+"|\`[^\`]+\`|\[[^\]]+\]|[A-Za-z_$][\w$]*))*`;
const SQL_CONSTRAINT_WORDS = new Set([
  "check",
  "constraint",
  "foreign",
  "primary",
  "unique",
]);

function preserveLinesAsSpaces(value: string) {
  return value.replace(/[^\n]/g, " ");
}

function stripSqlComments(content: string) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, preserveLinesAsSpaces)
    .replace(/--[^\n]*/g, preserveLinesAsSpaces);
}

function stripIdentifierQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function normalizeSqlIdentifier(value: string) {
  return value
    .split(".")
    .map(stripIdentifierQuotes)
    .join(".")
    .toLowerCase();
}

function displaySqlIdentifier(value: string) {
  return value.split(".").map(stripIdentifierQuotes).join(".");
}

function lineStarts(content: string) {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function sourcePosition(starts: number[], index: number) {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= index) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: index - starts[lineIndex] + 1,
  };
}

function sourceRange(
  starts: number[],
  startIndex: number,
  endIndex: number,
): SourceRange {
  const start = sourcePosition(starts, startIndex);
  const end = sourcePosition(starts, Math.max(startIndex, endIndex));
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

function matchingParenthesis(content: string, openingIndex: number) {
  let depth = 0;
  let quote = "";
  for (let index = openingIndex; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (character === quote && content[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return content.length - 1;
}

function splitSqlList(content: string, absoluteStart: number) {
  const entries: Array<{ text: string; start: number }> = [];
  let depth = 0;
  let quote = "";
  let entryStart = 0;
  for (let index = 0; index <= content.length; index += 1) {
    const character = content[index] ?? ",";
    if (quote) {
      if (character === quote && content[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      const raw = content.slice(entryStart, index);
      const leading = raw.search(/\S/);
      if (leading >= 0) {
        entries.push({
          text: raw.slice(leading).trimEnd(),
          start: absoluteStart + entryStart + leading,
        });
      }
      entryStart = index + 1;
    }
  }
  return entries;
}

function symbolRange(symbol: CodeSymbol): SourceRange {
  return {
    startLine: symbol.line,
    startColumn: symbol.column ?? 1,
    endLine: symbol.endLine,
    endColumn: symbol.endColumn ?? 1,
  };
}

export function extractSqlSchema(path: string, content: string): SqlFileAnalysis {
  if (!path.toLowerCase().endsWith(".sql")) {
    return { symbols: [], foreignKeys: [] };
  }

  const clean = stripSqlComments(content);
  const starts = lineStarts(content);
  const symbols: CodeSymbol[] = [];
  const foreignKeys: SqlForeignKeyDefinition[] = [];
  const tablePattern = new RegExp(
    String.raw`\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${SQL_IDENTIFIER})\s*\(`,
    "gi",
  );

  for (const tableMatch of clean.matchAll(tablePattern)) {
    const rawTableName = tableMatch[1];
    const tableName = displaySqlIdentifier(rawTableName);
    const tableStart = (tableMatch.index ?? 0) + tableMatch[0].indexOf(rawTableName);
    const openingIndex = (tableMatch.index ?? 0) + tableMatch[0].lastIndexOf("(");
    const closingIndex = matchingParenthesis(clean, openingIndex);
    const tableSourceRange = sourceRange(starts, tableStart, closingIndex);
    const tableId = `${path}:sql:table:${normalizeSqlIdentifier(tableName)}:${tableSourceRange.startLine}`;
    symbols.push({
      id: tableId,
      name: tableName,
      kind: "table",
      signature: `CREATE TABLE ${tableName}`,
      line: tableSourceRange.startLine,
      column: tableSourceRange.startColumn,
      endLine: tableSourceRange.endLine,
      endColumn: tableSourceRange.endColumn,
      description: `${tableName} is a database table declared in ${path}.`,
    });

    const bodyStart = openingIndex + 1;
    const entries = splitSqlList(clean.slice(bodyStart, closingIndex), bodyStart);
    entries.forEach((entry) => {
      const firstWord = entry.text.match(/^([A-Za-z_][\w$]*)/)?.[1]?.toLowerCase();
      const foreignMatch = entry.text.match(
        new RegExp(
          String.raw`(?:CONSTRAINT\s+${SQL_IDENTIFIER}\s+)?FOREIGN\s+KEY\s*\(\s*(${SQL_IDENTIFIER})\s*\)\s+REFERENCES\s+(${SQL_IDENTIFIER})(?:\s*\(\s*(${SQL_IDENTIFIER})\s*\))?`,
          "i",
        ),
      );
      if (foreignMatch) {
        const matchOffset = entry.text.indexOf(foreignMatch[0]);
        foreignKeys.push({
          sourceTableName: tableName,
          sourceColumnName: displaySqlIdentifier(foreignMatch[1]),
          targetTableName: displaySqlIdentifier(foreignMatch[2]),
          targetColumnName: foreignMatch[3]
            ? displaySqlIdentifier(foreignMatch[3])
            : undefined,
          range: sourceRange(
            starts,
            entry.start + matchOffset,
            entry.start + matchOffset + foreignMatch[0].length,
          ),
        });
        return;
      }
      if (!firstWord || SQL_CONSTRAINT_WORDS.has(firstWord)) return;

      const columnMatch = entry.text.match(
        new RegExp(String.raw`^(${SQL_IDENTIFIER})\s+([A-Za-z][\w]*(?:\s*\([^)]*\))?)`, "i"),
      );
      if (!columnMatch) return;
      const rawColumnName = columnMatch[1];
      const columnName = displaySqlIdentifier(rawColumnName);
      const columnOffset = entry.text.indexOf(rawColumnName);
      const columnSourceRange = sourceRange(
        starts,
        entry.start + columnOffset,
        entry.start + entry.text.length,
      );
      const columnId = `${path}:sql:column:${normalizeSqlIdentifier(tableName)}.${normalizeSqlIdentifier(columnName)}:${columnSourceRange.startLine}`;
      const primaryKey = /\bPRIMARY\s+KEY\b/i.test(entry.text);
      const nullable = !/\bNOT\s+NULL\b/i.test(entry.text) && !primaryKey;
      symbols.push({
        id: columnId,
        name: columnName,
        kind: "column",
        signature: entry.text.replace(/\s+/g, " "),
        line: columnSourceRange.startLine,
        column: columnSourceRange.startColumn,
        endLine: columnSourceRange.endLine,
        endColumn: columnSourceRange.endColumn,
        parentSymbolId: tableId,
        description: `${columnName} is a ${columnMatch[2]} column in ${tableName}.`,
        dataType: columnMatch[2].toUpperCase(),
        nullable,
        primaryKey,
      });

      const inlineReference = entry.text.match(
        new RegExp(
          String.raw`\bREFERENCES\s+(${SQL_IDENTIFIER})(?:\s*\(\s*(${SQL_IDENTIFIER})\s*\))?`,
          "i",
        ),
      );
      if (inlineReference) {
        const matchOffset = entry.text.indexOf(inlineReference[0]);
        foreignKeys.push({
          sourceTableName: tableName,
          sourceColumnName: columnName,
          targetTableName: displaySqlIdentifier(inlineReference[1]),
          targetColumnName: inlineReference[2]
            ? displaySqlIdentifier(inlineReference[2])
            : undefined,
          range: sourceRange(
            starts,
            entry.start + matchOffset,
            entry.start + matchOffset + inlineReference[0].length,
          ),
        });
      }
    });
  }

  return { symbols, foreignKeys };
}

function tableCandidates(files: AnalyzedFile[]) {
  const byName = new Map<string, Array<{ file: AnalyzedFile; symbol: CodeSymbol }>>();
  files.forEach((file) => {
    file.symbols
      .filter((symbol) => symbol.kind === "table")
      .forEach((symbol) => {
        const names = new Set([
          normalizeSqlIdentifier(symbol.name),
          normalizeSqlIdentifier(symbol.name.split(".").at(-1) ?? symbol.name),
        ]);
        names.forEach((name) => {
          const matches = byName.get(name) ?? [];
          matches.push({ file, symbol });
          byName.set(name, matches);
        });
      });
  });
  return byName;
}

function findTable(
  candidates: ReturnType<typeof tableCandidates>,
  name: string,
) {
  const matches = candidates.get(normalizeSqlIdentifier(name)) ?? [];
  return matches.length === 1 ? matches[0] : undefined;
}

function findColumn(file: AnalyzedFile, table: CodeSymbol, name?: string) {
  if (!name) return undefined;
  const normalized = normalizeSqlIdentifier(name);
  return file.symbols.find(
    (symbol) =>
      symbol.kind === "column" &&
      symbol.parentSymbolId === table.id &&
      normalizeSqlIdentifier(symbol.name) === normalized,
  );
}

export function resolveSqlForeignKeys(
  files: AnalyzedFile[],
  analysisByPath: ReadonlyMap<string, SqlFileAnalysis>,
): CodeRelationship[] {
  const candidates = tableCandidates(files);
  const relationships: CodeRelationship[] = [];

  files.forEach((sourceFile) => {
    const analysis = analysisByPath.get(sourceFile.path);
    analysis?.foreignKeys.forEach((foreignKey, index) => {
      const sourceTable = findTable(candidates, foreignKey.sourceTableName);
      if (!sourceTable) return;
      const sourceColumn = findColumn(
        sourceTable.file,
        sourceTable.symbol,
        foreignKey.sourceColumnName,
      );
      const targetTable = findTable(candidates, foreignKey.targetTableName);
      const targetColumn = targetTable
        ? findColumn(targetTable.file, targetTable.symbol, foreignKey.targetColumnName)
        : undefined;
      const sourceSymbol = sourceColumn ?? sourceTable.symbol;
      const targetSymbol = targetColumn ?? targetTable?.symbol;
      const confidence: RelationshipConfidence = targetSymbol ? "exact" : "inferred";
      const targetName = targetColumn
        ? `${targetTable?.symbol.name}.${targetColumn.name}`
        : foreignKey.targetTableName;
      relationships.push({
        id: `database:reference:${sourceSymbol.id}:${targetSymbol?.id ?? normalizeSqlIdentifier(targetName)}:${index}`,
        sourceId: sourceSymbol.id,
        targetId:
          targetSymbol?.id ??
          `external-database-table:${normalizeSqlIdentifier(foreignKey.targetTableName)}`,
        sourcePath: sourceFile.path,
        targetPath: targetTable?.file.path,
        targetName,
        kind: "references",
        line: foreignKey.range.startLine,
        confidence,
        explanation: `${sourceSymbol.name} references ${targetName} through a foreign key.`,
        evidence: {
          provider: "sql-schema-parser",
          confidence,
          source: fileLocation(sourceFile, foreignKey.range, sourceSymbol.id),
          target: targetSymbol && targetTable
            ? fileLocation(targetTable.file, symbolRange(targetSymbol), targetSymbol.id)
            : { uri: `database:${foreignKey.targetTableName}` },
          detail: targetSymbol
            ? "The SQL foreign-key declaration resolved to a table or column in this project."
            : "The SQL foreign-key declaration targets a table outside the discovered project schema.",
        },
      });
    });
  });
  return relationships;
}

interface AccessMatch {
  kind: "reads" | "writes";
  tableName: string;
  index: number;
  length: number;
  provider: "sql-query-parser" | "dart-database-detector";
  confidence: RelationshipConfidence;
}

function databaseAccessMatches(file: AnalyzedFile): AccessMatch[] {
  const matches: AccessMatch[] = [];
  const patterns: Array<{
    kind: "reads" | "writes";
    pattern: RegExp;
    provider: AccessMatch["provider"];
    confidence: RelationshipConfidence;
  }> = [
    {
      kind: "reads",
      pattern: new RegExp(String.raw`\bSELECT\b[\s\S]{0,500}?\bFROM\s+(${SQL_IDENTIFIER})`, "gi"),
      provider: file.kind === "sql" ? "sql-query-parser" : "dart-database-detector",
      confidence: "exact",
    },
    {
      kind: "writes",
      pattern: new RegExp(String.raw`\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(${SQL_IDENTIFIER})`, "gi"),
      provider: file.kind === "sql" ? "sql-query-parser" : "dart-database-detector",
      confidence: "exact",
    },
  ];
  if (file.kind === "dart") {
    patterns.push(
      {
        kind: "reads",
        pattern: /\.\s*(?:query|rawQuery)\s*\(\s*['"]([A-Za-z_$][\w$]*)['"]/gi,
        provider: "dart-database-detector",
        confidence: "inferred",
      },
      {
        kind: "writes",
        pattern: /\.\s*(?:insert|update|delete)\s*\(\s*['"]([A-Za-z_$][\w$]*)['"]/gi,
        provider: "dart-database-detector",
        confidence: "inferred",
      },
    );
  }
  patterns.forEach(({ kind, pattern, provider, confidence }) => {
    for (const match of file.content.matchAll(pattern)) {
      matches.push({
        kind,
        tableName: displaySqlIdentifier(match[1]),
        index: match.index ?? 0,
        length: match[0].length,
        provider,
        confidence,
      });
    }
  });
  return matches;
}

export function extractDatabaseAccessRelationships(
  files: AnalyzedFile[],
): CodeRelationship[] {
  const candidates = tableCandidates(files);
  const relationships: CodeRelationship[] = [];
  const seen = new Set<string>();
  files.forEach((sourceFile) => {
    if (sourceFile.kind !== "dart" && sourceFile.kind !== "sql") return;
    const starts = lineStarts(sourceFile.content);
    databaseAccessMatches(sourceFile).forEach((access) => {
      const target = findTable(candidates, access.tableName);
      if (!target) return;
      const range = sourceRange(starts, access.index, access.index + access.length);
      const owner = sourceFile.symbols
        .filter(
          (symbol) =>
            symbol.kind !== "table" &&
            symbol.kind !== "column" &&
            symbol.line <= range.startLine &&
            symbol.endLine >= range.endLine,
        )
        .sort((left, right) => left.endLine - left.line - (right.endLine - right.line))[0];
      const sourceId = owner?.id ?? sourceFile.id;
      const key = `${sourceId}:${target.symbol.id}:${access.kind}:${range.startLine}`;
      if (seen.has(key)) return;
      seen.add(key);
      relationships.push({
        id: `database:access:${key}`,
        sourceId,
        targetId: target.symbol.id,
        sourcePath: sourceFile.path,
        targetPath: target.file.path,
        targetName: target.symbol.name,
        kind: access.kind,
        line: range.startLine,
        confidence: access.confidence,
        explanation: `${owner?.name ?? sourceFile.name} ${access.kind} data in ${target.symbol.name}.`,
        evidence: {
          provider: access.provider,
          confidence: access.confidence,
          source: fileLocation(sourceFile, range, owner?.id),
          target: fileLocation(target.file, symbolRange(target.symbol), target.symbol.id),
          detail:
            access.confidence === "exact"
              ? "An explicit SQL statement names this discovered table."
              : "A common Dart database API call appears to name this discovered table.",
        },
      });
    });
  });
  return relationships;
}
