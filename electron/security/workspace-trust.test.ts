import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const { createWorkspaceTrustService, normalizeStore } = require("./workspace-trust.cjs");

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "divex-trust-"));
  temporaryDirectories.push(directory);
  const workspace = path.join(directory, "workspace");
  await fs.mkdir(workspace);
  const storagePath = path.join(directory, "state", "workspace-trust.json");
  return {
    workspace,
    storagePath,
    service: createWorkspaceTrustService({ storagePath }),
  };
}

describe("workspace trust service", () => {
  it("starts unknown and blocks execution until an explicit trust choice", async () => {
    const { service, workspace } = await fixture();
    await expect(service.getStatus(workspace)).resolves.toMatchObject({
      state: "unknown",
      trusted: false,
      permissions: expect.arrayContaining([
        expect.objectContaining({ id: "source", enabled: true }),
        expect.objectContaining({ id: "scripts", enabled: false }),
        expect.objectContaining({ id: "extensions", enabled: false }),
      ]),
    });
    await expect(service.requireTrusted(workspace)).rejects.toThrow(
      "Restricted Mode",
    );
  });

  it("persists trusted and restricted decisions per workspace", async () => {
    const { service, storagePath, workspace } = await fixture();
    await service.setTrusted(workspace, true);
    const reloaded = createWorkspaceTrustService({ storagePath });
    await expect(reloaded.requireTrusted(workspace)).resolves.toBe(
      path.resolve(workspace),
    );
    await expect(reloaded.getStatus(workspace)).resolves.toMatchObject({
      permissions: expect.arrayContaining([
        expect.objectContaining({ id: "scripts", enabled: true }),
        expect.objectContaining({ id: "extensions", enabled: false }),
      ]),
    });
    await reloaded.setTrusted(workspace, false);
    await expect(reloaded.getStatus(workspace)).resolves.toMatchObject({
      state: "restricted",
      trusted: false,
    });
  });

  it("rejects malformed persisted entries", () => {
    expect(
      normalizeStore({
        version: 1,
        workspaces: [{ rootPath: 42, trusted: "yes" }],
      }).workspaces,
    ).toEqual([]);
  });
});
