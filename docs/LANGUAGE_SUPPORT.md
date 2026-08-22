# Language support

Divex uses lightweight adapters to turn different source languages into one
shared project graph. They are designed for visual study and navigation; they
are not replacements for compilers or language servers.

| Language | Files | Symbols | Local dependencies | Deeper logic graph |
| --- | --- | --- | --- | --- |
| Dart / Flutter | `.dart` | Classes, widgets, functions, methods, constructors, variables | Imports | Yes |
| Python | `.py`, `.pyw` | Classes, functions, async functions, methods, module variables | `import` and `from … import` | Imports and containment |
| Java | `.java` | Classes, interfaces, constructors, methods, variables | Package imports and local types | Imports and containment |
| JavaScript | `.js`, `.mjs`, `.cjs`, `.jsx` | Classes, functions, methods, variables | Static local imports | Imports and containment |
| TypeScript / TSX | `.ts`, `.tsx`, `.mts`, `.cts`, `.d.ts` | Classes, interfaces, types, enums, namespaces, constructors, functions, methods, typed variables, TSX components | Static imports, type imports, exports, dynamic imports, triple-slash references | Imports and containment |
| HTML | `.html`, `.htm` | Named/id elements | Scripts, styles, and local links | Imports and containment |
| CSS | `.css` | Selectors and variables | `@import` | Imports and containment |

Ace provides syntax modes for these languages. Configuration files used by
Python projects—including TOML, INI, CFG, and requirements text—are also loaded
and editable.

## Python behavior

Python support includes:

- project-language detection and Python labels throughout the UI
- syntax highlighting for `.py` and `.pyw`
- class, function, `async def`, method, and module-variable extraction
- absolute and relative project import resolution
- Project-map dependency links and symbol cards
- file/symbol/text navigation and inspector details
- native Windows execution with `python`
- WSL execution with `python3` and Linux file paths
- detected compile checks for Python projects
- detected pytest tasks when `tests/`, `pytest.ini`, or `tox.ini` exists
- recognition of `pyproject.toml`, `requirements.txt`, `setup.py`, and `Pipfile`

Current Python analysis is intentionally static and lightweight. It does not
yet understand runtime imports, metaclasses, decorators as semantic entities,
type inference, virtual-environment packages, or Pyright/Pylance diagnostics.

## TypeScript behavior

TypeScript support includes:

- project scanning, live refresh, language summaries, and TypeScript labels
- TypeScript and TSX Ace modes for `.ts`, `.tsx`, `.mts`, and `.cts`
- classes, interfaces, type aliases, enums, namespaces, constructors,
  functions, methods, typed variables, and typed arrow components
- local import/export, dynamic import, type-only import, index-file, mixed
  JavaScript/TypeScript, and declaration-file resolution
- file, symbol, definition, reference, outline, inspector, and map navigation
- a detected `TypeScript: Check` task for projects with `tsconfig.json`
- active-file execution for erasable `.ts`, `.mts`, and `.cts` syntax through
  Node.js 22 type stripping
- TypeScript build diagnostics in the terminal Problems list
- `.ts` and `.tsx` choices in the project default new-file setting

This is lightweight static analysis. Full type inference, path mapping from
every `tsconfig.json` variant, completion, rename, code actions, semantic
diagnostics, and call hierarchy require the planned TypeScript language server.
Running or type-checking TypeScript inside WSL requires Node.js 22 and the
project's TypeScript package inside that distribution. Divex does not mix the
Windows Node.js toolchain into Linux projects.

## Adding or extending an adapter

1. Add or edit a file under `src/analysis/languages/`.
2. Register extensions in `registry.ts` and `metadata.ts`.
3. Add scan coverage in `electron/project/file-policy.cjs`.
4. Add the Ace mode mapping in `src/features/editor/CodeEditor.tsx`.
5. Return only shared symbols and dependency links from the adapter.
6. Add a focused Vitest file beside the adapter.
7. Extend `scripts/verify-language-support.cjs`.
8. Run `npm run test:languages` and `npm run check`.

Language-specific parsing must not be added to map or inspector components.
