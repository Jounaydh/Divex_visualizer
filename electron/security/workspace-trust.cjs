const fs = require("node:fs/promises");
const path = require("node:path");
const { validateProjectRoot } = require("../project/paths.cjs");
const { extensionPolicyStatus } = require("./extension-policy.cjs");

const TRUST_FILE_VERSION = 1;
const MAX_TRUSTED_WORKSPACES = 250;

function normalizeTrustPath(rootPath) {
  const resolved = validateProjectRoot(rootPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function emptyStore() {
  return { version: TRUST_FILE_VERSION, workspaces: [] };
}

function permissionDetails(trusted) {
  const extensions = extensionPolicyStatus();
  return [
    {
      id: "source",
      label: "Read and edit project files",
      enabled: true,
      detail: "Maps, search, editing, recovery, and file management stay available.",
    },
    {
      id: "scripts",
      label: "Run project scripts and tasks",
      enabled: Boolean(trusted),
      detail:
        "Includes npm scripts, divex.tasks.json commands, active files, build tools, and analyzers. They run with your operating-system account and may access files or the network.",
    },
    {
      id: "terminals",
      label: "Open integrated and external terminals",
      enabled: Boolean(trusted),
      detail: "Terminal commands inherit your user account permissions and project environment.",
    },
    {
      id: "debugging",
      label: "Start debuggers and install debug tools",
      enabled: Boolean(trusted),
      detail: "Debug adapters execute project code and can inspect the running process.",
    },
    {
      id: "external",
      label: "Launch files and links in external applications",
      enabled: Boolean(trusted),
      detail: "External applications receive the selected project path or validated HTTP/HTTPS link.",
    },
    {
      id: "extensions",
      label: "Run third-party extensions",
      enabled: extensions.thirdPartyExtensions,
      detail: extensions.reason,
    },
  ];
}

function normalizeStore(value) {
  if (!value || value.version !== TRUST_FILE_VERSION || !Array.isArray(value.workspaces)) {
    return emptyStore();
  }
  return {
    version: TRUST_FILE_VERSION,
    workspaces: value.workspaces
      .filter(
        (entry) =>
          entry &&
          typeof entry.rootPath === "string" &&
          typeof entry.trusted === "boolean",
      )
      .slice(-MAX_TRUSTED_WORKSPACES)
      .map((entry) => ({
        rootPath: entry.rootPath,
        trusted: entry.trusted,
        decidedAt:
          typeof entry.decidedAt === "string"
            ? entry.decidedAt
            : new Date(0).toISOString(),
      })),
  };
}

function createWorkspaceTrustService({ storagePath }) {
  let storePromise;

  const resolveStoragePath = () =>
    typeof storagePath === "function" ? storagePath() : storagePath;

  const load = async () => {
    if (!storePromise) {
      storePromise = fs
        .readFile(resolveStoragePath(), "utf8")
        .then((content) => normalizeStore(JSON.parse(content)))
        .catch((error) => {
          if (error?.code !== "ENOENT") {
            console.error("Divex could not load workspace trust.", error);
          }
          return emptyStore();
        });
    }
    return storePromise;
  };

  const persist = async (store) => {
    const filePath = resolveStoragePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(store, null, 2), "utf8");
    await fs.rename(temporaryPath, filePath);
  };

  const getStatus = async (rootPath) => {
    const normalizedRoot = normalizeTrustPath(rootPath);
    const store = await load();
    const entry = store.workspaces.find(
      (candidate) => candidate.rootPath === normalizedRoot,
    );
    return {
      rootPath: validateProjectRoot(rootPath),
      state: entry ? (entry.trusted ? "trusted" : "restricted") : "unknown",
      trusted: Boolean(entry?.trusted),
      decidedAt: entry?.decidedAt,
      permissions: permissionDetails(Boolean(entry?.trusted)),
    };
  };

  const setTrusted = async (rootPath, trusted) => {
    const normalizedRoot = normalizeTrustPath(rootPath);
    const store = await load();
    const nextEntry = {
      rootPath: normalizedRoot,
      trusted: Boolean(trusted),
      decidedAt: new Date().toISOString(),
    };
    const nextStore = {
      version: TRUST_FILE_VERSION,
      workspaces: [
        ...store.workspaces.filter(
          (candidate) => candidate.rootPath !== normalizedRoot,
        ),
        nextEntry,
      ].slice(-MAX_TRUSTED_WORKSPACES),
    };
    storePromise = Promise.resolve(nextStore);
    await persist(nextStore);
    return getStatus(rootPath);
  };

  const requireTrusted = async (rootPath) => {
    const status = await getStatus(rootPath);
    if (!status.trusted) {
      throw new Error(
        "This workspace is in Restricted Mode. Trust it before running tasks, terminals, scripts, or debugging.",
      );
    }
    return status.rootPath;
  };

  return { getStatus, requireTrusted, setTrusted };
}

module.exports = {
  TRUST_FILE_VERSION,
  createWorkspaceTrustService,
  normalizeStore,
  normalizeTrustPath,
  permissionDetails,
};
