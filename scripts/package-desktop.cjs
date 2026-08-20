const { spawnSync } = require("node:child_process");

const builderCli = require.resolve("electron-builder/out/cli/cli.js");
const result = spawnSync(process.execPath, [builderCli, ...process.argv.slice(2)], {
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(`Unable to start electron-builder: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
