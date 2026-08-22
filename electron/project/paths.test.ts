import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  parseWslUncPath,
  projectEnvironment,
  toWslUncPath,
  validateEntryName,
} = require("./paths.cjs") as {
  parseWslUncPath: (value: string) => {
    distribution: string;
    linuxPath: string;
  } | null;
  projectEnvironment: (value: string) => Record<string, string>;
  toWslUncPath: (distribution: string, linuxPath: string) => string;
  validateEntryName: (name: string) => string;
};

describe("project paths", () => {
  it("converts between WSL UNC and Linux paths", () => {
    const windowsPath = toWslUncPath("Ubuntu", "/home/dev/my-app");
    expect(windowsPath).toBe(
      "\\\\wsl.localhost\\Ubuntu\\home\\dev\\my-app",
    );
    expect(parseWslUncPath(windowsPath)).toEqual({
      distribution: "Ubuntu",
      linuxPath: "/home/dev/my-app",
    });
    expect(projectEnvironment(windowsPath)).toMatchObject({
      kind: "wsl",
      distribution: "Ubuntu",
      linuxPath: "/home/dev/my-app",
    });
  });

  it("does not classify a normal Windows path as WSL", () => {
    expect(parseWslUncPath("C:\\work\\app")).toBeNull();
  });

  it("rejects names that cannot be created reliably on Windows", () => {
    expect(() => validateEntryName("CON.txt")).toThrow("valid on Windows");
    expect(() => validateEntryName("bad:name.py")).toThrow("valid on Windows");
    expect(() => validateEntryName("trailing.")).toThrow("valid on Windows");
    expect(validateEntryName("worker.py")).toBe("worker.py");
  });
});
