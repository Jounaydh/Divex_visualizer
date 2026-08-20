import { describe, expect, it } from "vitest";
import { monacoLanguageForExtension } from "./editorLanguage";

describe("Monaco language selection", () => {
  it.each([
    ["dart", "dart"],
    ["java", "java"],
    ["py", "python"],
    ["python", "python"],
    ["sql", "sql"],
    ["json", "json"],
    ["yaml", "yaml"],
    ["yml", "yaml"],
  ])("maps .%s files to %s", (extension, expected) => {
    expect(monacoLanguageForExtension(extension)).toBe(expected);
  });

  it("falls back to plain text without guessing", () => {
    expect(monacoLanguageForExtension("unknown")).toBe("plaintext");
  });
});

