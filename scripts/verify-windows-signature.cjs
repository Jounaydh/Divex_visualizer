const { execFileSync } = require("node:child_process");
const path = require("node:path");
const packageJson = require("../package.json");

if (process.platform !== "win32") {
  console.error("Windows signature verification must run on Windows.");
  process.exit(1);
}

const releaseDirectory = path.resolve(__dirname, "..", "release");
const artifacts = [
  `Divex Visualizer-Setup-${packageJson.version}-x64.exe`,
  `Divex Visualizer-Portable-${packageJson.version}-x64.exe`,
];

let failed = false;
for (const artifact of artifacts) {
  const artifactPath = path.join(releaseDirectory, artifact);
  const quotedArtifactPath = artifactPath.replaceAll("'", "''");
  const command = [
    `$signature = Get-AuthenticodeSignature -LiteralPath '${quotedArtifactPath}'`,
    "[Console]::WriteLine($signature.Status)",
  ].join("; ");
  let status = "Unknown";
  try {
    status = execFileSync(
      "pwsh.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { encoding: "utf8", windowsHide: true },
    ).trim();
  } catch (error) {
    status = error?.stdout?.trim() || error?.message || "Verification failed";
  }
  const valid = status === "Valid";
  console.log(`${valid ? "PASS" : "FAIL"} ${artifact}: ${status}`);
  failed ||= !valid;
}

if (failed) {
  console.error(
    "A trusted code-signing certificate is required. Set electron-builder's CSC_LINK and CSC_KEY_PASSWORD variables, rebuild with npm run dist:win:signed, and retry.",
  );
  process.exit(1);
}
