import { describe, expect, it } from "vitest";
import { consumeTerminalProblems } from "./problemMatchers";

describe("terminal problem matchers", () => {
  it("extracts TypeScript and compiler locations", () => {
    const result = consumeTerminalProblems(
      "",
      "src/main.ts(12,7): error TS1005: expected ;\nlib/demo.c:4:2: warning: unused value\n",
      "C:\\work\\app",
      "session",
      "auto",
    );
    expect(result.problems).toMatchObject([
      { path: "src/main.ts", line: 12, column: 7, severity: "error" },
      { path: "lib/demo.c", line: 4, column: 2, severity: "warning" },
    ]);
  });

  it("keeps partial lines and extracts Python tracebacks", () => {
    const first = consumeTerminalProblems("", "  File \"tests/test_app.py\", line ", "/project", "s", "python");
    const second = consumeTerminalProblems(first.remainder, "19, in test_demo\n", "/project", "s", "python");
    expect(second.problems[0]).toMatchObject({ path: "tests/test_app.py", line: 19 });
  });
});
