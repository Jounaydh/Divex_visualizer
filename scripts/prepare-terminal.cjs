const fs = require("node:fs");
const path = require("node:path");

if (process.platform !== "win32") {
  const helperPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "node-pty",
    "prebuilds",
    `${process.platform}-${process.arch}`,
    "spawn-helper",
  );
  if (fs.existsSync(helperPath)) {
    fs.chmodSync(helperPath, 0o755);
  }
}
