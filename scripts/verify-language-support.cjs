const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "divex-language-check-"),
);

function source(pathname, content) {
  return { path: pathname, content };
}

function names(file) {
  return file.symbols.map((symbol) => `${symbol.kind}:${symbol.name}`);
}

try {
  const compilerPath = require.resolve("typescript/lib/tsc.js", {
    paths: [repositoryRoot],
  });
  const compileResult = spawnSync(
    process.execPath,
    [
      compilerPath,
      "--target",
      "ES2022",
      "--module",
      "CommonJS",
      "--moduleResolution",
      "Node",
      "--rootDir",
      repositoryRoot,
      "--outDir",
      temporaryDirectory,
      "--skipLibCheck",
      "--esModuleInterop",
      "--noEmitOnError",
      "true",
      path.join(repositoryRoot, "src", "analysis", "analyzeProject.ts"),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  if (compileResult.status !== 0) {
    process.stderr.write(compileResult.stdout);
    process.stderr.write(compileResult.stderr);
    process.exitCode = compileResult.status ?? 1;
    return;
  }

  const { analyzeProject } = require(path.join(
    temporaryDirectory,
    "src",
    "analysis",
    "analyzeProject.js",
  ));
  const project = analyzeProject({
    name: "polyglot-demo",
    rootPath: "fixture",
    files: [
      source(
        "lib/main.dart",
        "import 'app.dart';\nvoid main() {}\n",
      ),
      source("lib/app.dart", "class App {}\n"),
      source(
        "python/main.py",
        "from python.service import Service\nVALUE = 3\n\ndef run():\n    return Service()\n",
      ),
      source(
        "python/service.py",
        "class Service:\n    def execute(self):\n        return True\n",
      ),
      source(
        "java/com/example/App.java",
        "package com.example;\nimport com.example.services.Greeter;\npublic class App {\n    public static void main(String[] args) {}\n}\n",
      ),
      source(
        "java/com/example/services/Greeter.java",
        "package com.example.services;\npublic interface Greeter {\n    String greet();\n}\n",
      ),
      source(
        "web/index.html",
        '<link rel="stylesheet" href="./styles/base.css">\n<script type="module" src="./scripts/app.js"></script>\n<main id="app"></main>\n',
      ),
      source(
        "web/scripts/app.js",
        'import { render } from "./render.js";\nexport class App {}\nexport const start = () => render();\n',
      ),
      source(
        "web/scripts/render.js",
        "export function render() { return true; }\n",
      ),
      source(
        "web/styles/base.css",
        '@import "./theme.css";\n#app, .shell {\n  display: block;\n}\n',
      ),
      source(
        "web/styles/theme.css",
        ":root {\n  --surface: #111;\n}\n",
      ),
    ],
  });

  assert.deepEqual(new Set(project.languages), new Set([
    "dart",
    "python",
    "java",
    "javascript",
    "html",
    "css",
  ]));
  assert.equal(project.languageSummary, "6-language");
  assert.equal(project.relationshipCount, 7);

  const byPath = new Map(project.files.map((file) => [file.path, file]));
  assert.deepEqual(byPath.get("lib/main.dart").resolvedImports, [
    "lib/app.dart",
  ]);
  assert.ok(names(byPath.get("lib/app.dart")).includes("class:App"));

  assert.deepEqual(byPath.get("python/main.py").resolvedImports, [
    "python/service.py",
  ]);
  assert.ok(names(byPath.get("python/main.py")).includes("function:run"));
  assert.ok(
    names(byPath.get("python/service.py")).includes("method:execute"),
  );

  assert.deepEqual(
    byPath.get("java/com/example/App.java").resolvedImports,
    ["java/com/example/services/Greeter.java"],
  );
  assert.ok(
    names(byPath.get("java/com/example/services/Greeter.java")).includes(
      "interface:Greeter",
    ),
  );

  assert.deepEqual(byPath.get("web/index.html").resolvedImports, [
    "web/scripts/app.js",
    "web/styles/base.css",
  ]);
  assert.ok(names(byPath.get("web/index.html")).includes("element:#app"));

  assert.deepEqual(byPath.get("web/scripts/app.js").resolvedImports, [
    "web/scripts/render.js",
  ]);
  assert.ok(
    names(byPath.get("web/scripts/app.js")).includes("function:start"),
  );

  assert.deepEqual(byPath.get("web/styles/base.css").resolvedImports, [
    "web/styles/theme.css",
  ]);
  assert.ok(
    names(byPath.get("web/styles/base.css")).includes("selector:#app"),
  );

  process.stdout.write(
    `Verified ${project.languages.length} languages, ${project.files.length} files, and ${project.relationshipCount} local relationships.\n`,
  );
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
