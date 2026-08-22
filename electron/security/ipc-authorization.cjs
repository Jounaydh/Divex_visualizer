const path = require("node:path");
const { fileURLToPath } = require("node:url");

const MINI_CHANNELS = new Set([
  "app:get-mini-window-state",
  "app:reload-renderer",
  "app:report-renderer-error",
  "app:set-mini-always-on-top",
  "project:choose",
  "project:open-entry",
  "project:refresh",
  "project:unwatch",
  "project:watch",
]);

function normalizedPath(candidate) {
  const resolved = path.resolve(candidate);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isAllowedRendererUrl(frameUrl, options) {
  try {
    const parsed = new URL(frameUrl);
    if (options.isDevelopment) {
      return parsed.protocol === "http:" && parsed.origin === "http://localhost:5173";
    }
    return (
      parsed.protocol === "file:" &&
      normalizedPath(fileURLToPath(parsed)) === normalizedPath(options.rendererPath)
    );
  } catch {
    return false;
  }
}

function createIpcAuthorization(options) {
  const authorized = new Map();

  const register = (webContents, role) => {
    if (!webContents || !Number.isInteger(webContents.id)) {
      throw new Error("Cannot authorize an invalid renderer.");
    }
    if (role !== "main" && role !== "mini") {
      throw new Error("Cannot authorize an unknown renderer role.");
    }
    authorized.set(webContents.id, { role, webContents, projectRoot: null });
    webContents.once?.("destroyed", () => authorized.delete(webContents.id));
  };

  const setProject = (webContents, rootPath) => {
    const entry = webContents ? authorized.get(webContents.id) : null;
    if (!entry || entry.webContents !== webContents) {
      throw new Error("Cannot scope a project to an unauthorized renderer.");
    }
    if (typeof rootPath !== "string" || !path.isAbsolute(rootPath)) {
      throw new Error("Cannot scope an invalid project root.");
    }
    entry.projectRoot = normalizedPath(rootPath);
  };

  const assertProject = (event, rootPath) => {
    const entry = event?.sender ? authorized.get(event.sender.id) : null;
    if (
      !entry ||
      typeof rootPath !== "string" ||
      !path.isAbsolute(rootPath) ||
      entry.projectRoot !== normalizedPath(rootPath)
    ) {
      throw new Error("Blocked IPC outside this window's active project.");
    }
  };

  const assertEvent = (event, channel) => {
    const sender = event?.sender;
    const frame = event?.senderFrame;
    const entry = sender ? authorized.get(sender.id) : null;
    if (!entry || entry.webContents !== sender || sender.isDestroyed?.()) {
      throw new Error("Blocked IPC from an unauthorized renderer.");
    }
    if (!frame || frame !== sender.mainFrame) {
      throw new Error("Blocked IPC from a non-main renderer frame.");
    }
    if (!isAllowedRendererUrl(frame.url, options)) {
      throw new Error("Blocked IPC from an unexpected renderer URL.");
    }
    if (entry.role === "mini" && !MINI_CHANNELS.has(channel)) {
      throw new Error(`Blocked ${channel} from the restricted Mini renderer.`);
    }
    return entry.role;
  };

  return { assertEvent, assertProject, register, setProject };
}

module.exports = {
  MINI_CHANNELS,
  createIpcAuthorization,
  isAllowedRendererUrl,
};
