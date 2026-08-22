import type {
  TerminalProblem,
  TerminalProblemMatcher,
} from "../../types";

const ANSI_ESCAPE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g;

interface ParsedLocation {
  path: string;
  line: number;
  column?: number;
  severity: TerminalProblem["severity"];
  message: string;
}

function severity(value?: string): TerminalProblem["severity"] {
  const normalized = value?.toLowerCase();
  if (normalized?.includes("warn")) return "warning";
  if (normalized?.includes("info") || normalized?.includes("note")) return "info";
  return "error";
}

function cleanPath(value: string, rootPath: string) {
  let candidate = value.trim().replace(/^['"]|['"]$/g, "").replaceAll("\\", "/");
  const root = rootPath.replaceAll("\\", "/").replace(/\/$/, "");
  if (candidate.toLowerCase().startsWith(`${root.toLowerCase()}/`)) {
    candidate = candidate.slice(root.length + 1);
  }
  candidate = candidate.replace(/^\.\//, "");
  return candidate;
}

function parseLine(line: string, matcher: TerminalProblemMatcher): ParsedLocation | null {
  const clean = line.replace(ANSI_ESCAPE, "").trim();
  if (!clean) return null;

  const python = clean.match(/^\s*File\s+["'](.+?)["'],\s+line\s+(\d+)/i);
  if (python && (matcher === "auto" || matcher === "python")) {
    return { path: python[1], line: Number(python[2]), severity: "error", message: "Python traceback" };
  }

  const parenthesized = clean.match(/^(.+?)\((\d+),(\d+)\):\s*(?:(error|warning|info)\b[: ]*)?(.*)$/i);
  if (parenthesized && ["auto", "typescript", "java"].includes(matcher)) {
    return {
      path: parenthesized[1],
      line: Number(parenthesized[2]),
      column: Number(parenthesized[3]),
      severity: severity(parenthesized[4]),
      message: parenthesized[5] || clean,
    };
  }

  const bracketed = clean.match(/^(?:\[ERROR\]\s*)?(.+?):\[(\d+),(\d+)\]\s*(.*)$/i);
  if (bracketed && ["auto", "java"].includes(matcher)) {
    return {
      path: bracketed[1],
      line: Number(bracketed[2]),
      column: Number(bracketed[3]),
      severity: "error",
      message: bracketed[4] || clean,
    };
  }

  const colon = clean.match(/^(.+?):(\d+)(?::(\d+))?\s*(?::|[-•])?\s*(?:(error|warning|info|note)\b[: ]*)?(.*)$/i);
  if (!colon) return null;
  const filePath = colon[1].trim();
  if (!/[./\\]/.test(filePath)) return null;
  return {
    path: filePath,
    line: Number(colon[2]),
    column: colon[3] ? Number(colon[3]) : undefined,
    severity: severity(colon[4]),
    message: colon[5] || clean,
  };
}

export function consumeTerminalProblems(
  previousRemainder: string,
  data: string,
  rootPath: string,
  sessionId: string,
  matcher: TerminalProblemMatcher = "auto",
) {
  const combined = `${previousRemainder}${data}`;
  const lines = combined.split(/\r?\n/);
  const remainder = lines.pop() ?? "";
  const problems = lines.flatMap((line, index) => {
    const parsed = parseLine(line, matcher);
    if (!parsed || !Number.isFinite(parsed.line) || parsed.line < 1) return [];
    const problem: TerminalProblem = {
      id: `${sessionId}:${Date.now()}:${index}:${parsed.path}:${parsed.line}`,
      sessionId,
      path: cleanPath(parsed.path, rootPath),
      line: parsed.line,
      column: parsed.column,
      severity: parsed.severity,
      message: parsed.message.trim() || "Build problem",
    };
    return [problem];
  });
  return { remainder: remainder.slice(-8192), problems };
}
