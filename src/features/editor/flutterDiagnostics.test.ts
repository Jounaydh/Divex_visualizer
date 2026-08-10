import { describe, expect, it } from "vitest";
import { parseFlutterDiagnostics } from "./flutterDiagnostics";

describe("Flutter diagnostics", () => {
  it("extracts analyzer severity, location, message, and code", () => {
    expect(
      parseFlutterDiagnostics(
        [
          "Analyzing ocean_log...",
          "  error • Undefined name 'missing' • lib/main.dart:8:5 • undefined_identifier",
          "warning • Unused import • lib/app.dart:2:1 • unused_import",
          "2 issues found.",
        ].join("\n"),
      ),
    ).toEqual([
      {
        severity: "error",
        message: "Undefined name 'missing'",
        path: "lib/main.dart",
        line: 8,
        column: 5,
        code: "undefined_identifier",
      },
      {
        severity: "warning",
        message: "Unused import",
        path: "lib/app.dart",
        line: 2,
        column: 1,
        code: "unused_import",
      },
    ]);
  });

  it("ignores non-diagnostic command output", () => {
    expect(parseFlutterDiagnostics("No issues found!")).toEqual([]);
  });
});
