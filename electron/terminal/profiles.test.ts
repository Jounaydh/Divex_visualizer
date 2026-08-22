import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { listTerminalProfiles, resolveTerminalProfile } = require("./profiles.cjs") as {
  listTerminalProfiles: (rootPath: string) => Promise<Array<{ id: string; label: string }>>;
  resolveTerminalProfile: (rootPath: string, profileId?: string) => Promise<{ id: string; executable?: string }>;
};

describe("terminal profiles", () => {
  const wslRoot = "\\\\wsl.localhost\\Ubuntu\\home\\dev\\app";

  it("offers project-distribution profiles for WSL workspaces", async () => {
    const profiles = await listTerminalProfiles(wslRoot);
    expect(profiles.map((profile) => profile.id)).toEqual(["wsl-default", "wsl-bash"]);
    expect(profiles[0].label).toContain("Ubuntu");
  });

  it("falls back to the first safe profile for an unknown id", async () => {
    await expect(resolveTerminalProfile(wslRoot, "not-a-profile")).resolves.toMatchObject({
      id: "wsl-default",
    });
  });
});
