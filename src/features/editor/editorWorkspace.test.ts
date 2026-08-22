import { describe, expect, it } from "vitest";
import type { EditorDocument } from "./editorTypes";
import { addRecentlyClosed, buildSideBySideDiff, hasExternalConflict, replacePreviewTab } from "./editorWorkspace";

describe("editor workspace state", () => {
  it("replaces only an unpinned clean preview tab", () => {
    expect(replacePreviewTab(["a.ts", "fixed.ts"], "b.ts", "a.ts", new Set(["fixed.ts"]), false)).toEqual(["b.ts", "fixed.ts"]);
    expect(replacePreviewTab(["a.ts"], "b.ts", "a.ts", new Set(), true)).toEqual(["a.ts", "b.ts"]);
    expect(replacePreviewTab(["a.ts"], "b.ts", "a.ts", new Set(["a.ts"]), false)).toEqual(["a.ts", "b.ts"]);
  });

  it("keeps recently closed files unique and bounded", () => {
    expect(addRecentlyClosed(["b", "a", "c"], "a", 3)).toEqual(["a", "b", "c"]);
  });

  it("marks changed side-by-side lines", () => {
    expect(buildSideBySideDiff("one\ntwo", "one\nchanged")).toEqual([
      { line: 1, left: "one", right: "one", changed: false },
      { line: 2, left: "two", right: "changed", changed: true },
    ]);
  });

  it("reports only a real three-way external edit conflict", () => {
    const document = {
      dirty: true,
      savedContent: "saved",
      session: { getValue: () => "my edit" },
    } as EditorDocument;
    expect(hasExternalConflict(document, "external edit")).toBe(true);
    expect(hasExternalConflict({ ...document, dirty: false }, "external edit")).toBe(false);
    expect(hasExternalConflict(document, "saved")).toBe(false);
    expect(hasExternalConflict(document, "my edit")).toBe(false);
  });
});
