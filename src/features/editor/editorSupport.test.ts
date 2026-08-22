import { describe, expect, it } from "vitest";
import type { CodeSymbol } from "../../types";
import { aceModeForExtension, closestSymbol } from "./editorSupport";

const symbol = (
  id: string,
  line: number,
  endLine: number,
): CodeSymbol => ({
  id,
  name: id,
  kind: "function",
  signature: `${id}()`,
  line,
  endLine,
  description: id,
});

describe("editor support", () => {
  it.each([
    ["py", "ace/mode/python"],
    ["JAVA", "ace/mode/java"],
    ["html", "ace/mode/html"],
    ["jsx", "ace/mode/jsx"],
    ["ts", "ace/mode/typescript"],
    ["tsx", "ace/mode/tsx"],
    ["css", "ace/mode/css"],
    ["unknown", "ace/mode/text"],
  ])("maps %s files to %s", (extension, mode) => {
    expect(aceModeForExtension(extension)).toBe(mode);
  });

  it("selects the narrowest symbol containing the cursor line", () => {
    expect(
      closestSymbol([symbol("outer", 1, 20), symbol("inner", 5, 8)], 6)?.id,
    ).toBe("inner");
    expect(closestSymbol([symbol("outer", 1, 20)], 30)).toBeNull();
  });
});
