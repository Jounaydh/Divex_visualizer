# Debugging

Divex includes a managed debugger for Python and Dart/Flutter projects opened
from native Windows folders or WSL. Debug processes run outside React through
the standard Debug Adapter Protocol (DAP), while the renderer receives only
structured session state.

## Start a session

1. Open a Python (`.py` or `.pyw`) or Dart (`.dart`) file in the editor.
2. Click beside a line number to add a breakpoint.
3. Open **Debug** in the left sidebar or press `Ctrl+Shift+D`.
4. Select **Debug filename** or press `F5`.

Breakpoints are saved per project and remain available after restarting Divex.
When execution pauses, Divex opens the paused source line and shows its current
variables and call stack.

## Controls

| Key | Action |
| --- | --- |
| `F5` | Start or continue |
| `Shift+F5` | Stop |
| `F6` | Pause |
| `F10` | Step over |
| `F11` | Step into |
| `Shift+F11` | Step out |
| `Ctrl+Shift+D` | Open Run and Debug |

The Debug sidebar contains nested variables, selectable call-stack frames,
project breakpoints, and bounded stdout/stderr output in the Debug Console.

## Python setup

Python uses `debugpy`. If it is missing, Divex shows **Set up Python debugger**.
That button runs pip only after it is explicitly selected:

- native Windows: `py -3 -m pip install --user debugpy`
- WSL: `python3 -m pip install --user debugpy`

For WSL projects, the adapter and debug target both run inside the selected
distribution. Windows paths are used only to transport files to Electron; DAP
receives Linux paths.

## Dart and Flutter setup

Divex uses `dart debug_adapter` for Dart projects and `flutter debug_adapter`
when a project contains `pubspec.yaml`. Install the appropriate SDK in the same
native or WSL environment as the project.

## Safety boundary

The renderer cannot select an executable or submit a command. Electron accepts
only a contained project file with an approved extension, selects the adapter,
translates native/WSL paths, and owns the child process. Sessions belong to the
window that created them and stop when that window closes.

Java and JavaScript source analysis remains supported, but their debugger
adapters are not connected yet. Adding them should extend the existing DAP
adapter registry rather than exposing arbitrary launch commands.
