export interface EditorDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  path: string;
  line: number;
  column: number;
  code: string;
}

const DIAGNOSTIC_PATTERN =
  /^\s*(error|warning|info)\s+•\s+(.+?)\s+•\s+(.+?):(\d+):(\d+)\s+•\s+(.+?)\s*$/i;

export function parseFlutterDiagnostics(output: string) {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(DIAGNOSTIC_PATTERN);
    if (!match) return [];
    return [
      {
        severity: match[1].toLowerCase() as EditorDiagnostic["severity"],
        message: match[2].trim(),
        path: match[3].trim().replaceAll("\\", "/"),
        line: Number.parseInt(match[4], 10),
        column: Number.parseInt(match[5], 10),
        code: match[6].trim(),
      },
    ];
  });
}
