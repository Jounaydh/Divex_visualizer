import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  cleanWslOutput,
  parseDistributionList,
  wslCommandForProject,
} = require("./wsl.cjs") as {
  cleanWslOutput: (value: string) => string;
  parseDistributionList: (value: string) => Array<{
    name: string;
    system: boolean;
  }>;
  wslCommandForProject: (
    rootPath: string,
    executable?: string,
    args?: string[],
    cwdPath?: string,
  ) => {
    executable: string;
    args: string[];
    displayCwd: string;
    distribution: string;
  } | null;
};

describe("WSL service", () => {
  it("normalizes UTF-16-like WSL command output", () => {
    expect(cleanWslOutput("U\0b\0u\0n\0t\0u\0\r\n")).toBe("Ubuntu\n");
    expect(parseDistributionList("Ubuntu\n\ndocker-desktop\n")).toEqual([
      { name: "Ubuntu", system: false },
      { name: "docker-desktop", system: true },
    ]);
  });

  it("builds a WSL command with a Linux working directory", () => {
    const command = wslCommandForProject(
      "\\\\wsl.localhost\\Ubuntu\\home\\dev\\app",
      "python3",
      ["-m", "pytest"],
      "\\\\wsl.localhost\\Ubuntu\\home\\dev\\app\\tests",
    );
    expect(command).toMatchObject({
      executable: "wsl.exe",
      distribution: "Ubuntu",
      displayCwd: "/home/dev/app/tests",
      args: [
        "--distribution",
        "Ubuntu",
        "--cd",
        "/home/dev/app/tests",
        "--exec",
        "python3",
        "-m",
        "pytest",
      ],
    });
  });
});
