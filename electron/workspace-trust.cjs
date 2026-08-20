const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const STORE_VERSION = 1;

function trustKey(rootPath) {
  return crypto.createHash("sha256").update(rootPath).digest("hex");
}

class WorkspaceTrustStore {
  constructor({ storePath }) {
    this.storePath = storePath;
    this.writeQueue = Promise.resolve();
  }

  async resolveRoot(rootPath) {
    if (typeof rootPath !== "string" || !path.isAbsolute(rootPath)) {
      throw new Error("Open a local project folder before changing workspace trust.");
    }
    const resolved = path.resolve(rootPath);
    try {
      return await fs.realpath(resolved);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error("The workspace folder no longer exists.");
      }
      throw error;
    }
  }

  async readStore() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.storePath, "utf8"));
      if (parsed?.version !== STORE_VERSION || typeof parsed.entries !== "object") {
        return { version: STORE_VERSION, entries: {} };
      }
      return { version: STORE_VERSION, entries: parsed.entries };
    } catch (error) {
      if (error?.code === "ENOENT" || error instanceof SyntaxError) {
        return { version: STORE_VERSION, entries: {} };
      }
      throw error;
    }
  }

  async get(rootPath) {
    const canonicalRoot = await this.resolveRoot(rootPath);
    const store = await this.readStore();
    return {
      trusted: Boolean(store.entries[trustKey(canonicalRoot)]),
      rootPath: canonicalRoot,
    };
  }

  async set(rootPath, trusted) {
    const canonicalRoot = await this.resolveRoot(rootPath);
    const operation = async () => {
      const store = await this.readStore();
      const key = trustKey(canonicalRoot);
      if (trusted) {
        store.entries[key] = {
          trustedAt: new Date().toISOString(),
        };
      } else {
        delete store.entries[key];
      }
      await fs.mkdir(path.dirname(this.storePath), { recursive: true });
      const temporaryPath = `${this.storePath}.${process.pid}.tmp`;
      await fs.writeFile(
        temporaryPath,
        JSON.stringify(store, null, 2),
        { encoding: "utf8", mode: 0o600 },
      );
      await fs.rename(temporaryPath, this.storePath);
      return { trusted: Boolean(trusted), rootPath: canonicalRoot };
    };
    this.writeQueue = this.writeQueue.then(operation, operation);
    return this.writeQueue;
  }

  async requireTrusted(rootPath) {
    const status = await this.get(rootPath);
    if (!status.trusted) {
      throw new Error(
        "Restricted Mode blocked this action. Trust this workspace before running project code, terminals, Git, or external tools.",
      );
    }
    return status.rootPath;
  }
}

module.exports = { WorkspaceTrustStore, trustKey };

