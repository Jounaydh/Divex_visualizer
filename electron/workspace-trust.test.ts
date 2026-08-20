import { mkdtemp, readFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceTrustStore } from "./workspace-trust.cjs";

const temporaryRoots: string[] = [];

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "divex-trust-"));
  temporaryRoots.push(root);
  return {
    root,
    storePath: path.join(root, "settings", "workspace-trust.json"),
  };
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

describe("WorkspaceTrustStore", () => {
  it("defaults every local folder to restricted mode", async () => {
    const { root, storePath } = await fixture();
    const store = new WorkspaceTrustStore({ storePath });

    await expect(store.get(root)).resolves.toMatchObject({ trusted: false });
    await expect(store.requireTrusted(root)).rejects.toThrow("Restricted Mode");
  });

  it("persists trust without storing the workspace path", async () => {
    const { root, storePath } = await fixture();
    const store = new WorkspaceTrustStore({ storePath });

    await expect(store.set(root, true)).resolves.toMatchObject({ trusted: true });
    await expect(store.requireTrusted(root)).resolves.toBe(await realpath(root));
    const serialized = await readFile(storePath, "utf8");
    expect(serialized).not.toContain(root);
  });

  it("revokes an exact folder without trusting its parent or siblings", async () => {
    const { root, storePath } = await fixture();
    const sibling = await mkdtemp(path.join(os.tmpdir(), "divex-trust-sibling-"));
    temporaryRoots.push(sibling);
    const store = new WorkspaceTrustStore({ storePath });

    await store.set(root, true);
    await expect(store.get(sibling)).resolves.toMatchObject({ trusted: false });
    await store.set(root, false);
    await expect(store.get(root)).resolves.toMatchObject({ trusted: false });
  });
});
