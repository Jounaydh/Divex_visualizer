const fs = require("node:fs/promises");

const originalRename = fs.rename.bind(fs);
fs.rename = async (source, destination) => {
  const isWindowsStagingRename =
    process.platform === "win32" &&
    String(source).endsWith("win-unpacked.tmp") &&
    String(destination).endsWith("win-unpacked");

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await originalRename(source, destination);
    } catch (error) {
      const shouldRetry =
        isWindowsStagingRename &&
        (error?.code === "EPERM" || error?.code === "EBUSY") &&
        attempt < 5;
      if (!shouldRetry) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, 400 * (attempt + 1)),
      );
    }
  }
};

const { Arch } = require("builder-util");
const { build, Platform } = require("electron-builder");

const requestedTargets = process.argv.slice(2);
const targets = Platform.WINDOWS.createTarget(
  requestedTargets.length > 0 ? requestedTargets : undefined,
  Arch.x64,
);

build({ targets }).catch((error) => {
  console.error(error);
  process.exit(1);
});
