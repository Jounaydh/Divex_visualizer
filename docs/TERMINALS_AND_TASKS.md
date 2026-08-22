# Terminals and tasks

Divex provides managed integrated terminals and matching external-terminal
launches. Terminal and task execution is available only for trusted workspaces.

## Shell profiles

On Windows, Divex detects PowerShell, Windows PowerShell, Command Prompt, and
Git Bash. Only installed profiles are shown. A WSL project instead receives
the default shell for its distribution and a Bash login-shell profile. The
selected profile is remembered per workspace and is used by both **New
Terminal** and **Open External Terminal**.

The terminal dock supports multiple tabs, a two-pane split, output search with
`Ctrl+F`, clickable HTTP/HTTPS links, resizing, restart, termination, and live
exit state. Processes remain owned and bounded by the Electron main process.

## Detected and custom tasks

Detected npm, Flutter, Dart, Python, Maven, Gradle, and Make tasks appear in the
task menu. Each task can run in an integrated tab or the selected external
terminal profile.

Choose **Configure custom tasks** to create or open `divex.tasks.json` in the
project root. The format is:

```json
{
  "version": 1,
  "tasks": [
    {
      "id": "quality",
      "label": "Run quality checks",
      "group": "test",
      "command": "python",
      "args": ["-m", "pytest"],
      "cwd": "tests",
      "problemMatcher": "python"
    }
  ]
}
```

`group` may be `build`, `test`, `run`, or `other`. `problemMatcher` may be
`auto`, `dart`, `python`, `typescript`, `java`, or `gcc`. `cwd` is optional and
must remain inside the workspace.

Tasks are executable-plus-argument definitions rather than shell strings. The
renderer sends only a discovered task ID; Electron reloads and validates the
definition before every launch. A configuration may contain at most 64 tasks.

## Build problems

Task output is scanned incrementally for Dart, Python, TypeScript, Java, GCC,
and common `file:line:column` diagnostics. The Problems button shows findings
for the selected terminal. Choosing a problem opens the matching project file
at its reported line. Detection does not change or hide the original terminal
output.
