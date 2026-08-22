/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  new URL("../styles.css", import.meta.url),
  "utf8",
);

function declaration(selector: string, property: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = stylesheet.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  )?.[1];
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return block
    ?.match(new RegExp(`${escapedProperty}\\s*:\\s*([^;]+)`))?.[1]
    ?.trim();
}

describe("desktop application shell layout", () => {
  it("keeps the workspace in the flexible row and the terminal below it", () => {
    expect(declaration(".app-shell", "grid-template-rows")).toBe(
      "52px auto minmax(0, 1fr) auto",
    );
    expect(declaration(".workspace-trust-slot", "grid-row")).toBe("2");
    expect(declaration(".workspace", "grid-row")).toBe("3");
    expect(declaration(".terminal-loading", "grid-row")).toBe("4");
    expect(declaration(".terminal-dock", "grid-row")).toBe("4");
  });
});
