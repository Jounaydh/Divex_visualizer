import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Play,
  Save,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import * as ace from "ace-builds";
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/mode-dart";
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-text";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/theme-one_dark";
import { useEffect, useRef, useState } from "react";
import type { AnalyzedFile, ProjectToolResult } from "../types";

interface CodeEditorProps {
  file: AnalyzedFile;
  projectName: string;
  rootPath: string;
  onClose: () => void;
  onPersist: (path: string, content: string) => void;
}

type EditorAction = "save" | "format" | "analyze" | null;

const aceModeForExtension = (extension: string) => {
  const modes: Record<string, string> = {
    dart: "ace/mode/dart",
    java: "ace/mode/java",
    json: "ace/mode/json",
    py: "ace/mode/python",
    python: "ace/mode/python",
    yaml: "ace/mode/yaml",
    yml: "ace/mode/yaml",
  };
  return modes[extension.toLowerCase()] ?? "ace/mode/text";
};

export function CodeEditor({
  file,
  projectName,
  rootPath,
  onClose,
  onPersist,
}: CodeEditorProps) {
  const [value, setValue] = useState(file.content);
  const [dirty, setDirty] = useState(false);
  const [action, setAction] = useState<EditorAction>(null);
  const [result, setResult] = useState<ProjectToolResult | null>(null);
  const [cursorPosition, setCursorPosition] = useState("Ln 1, Col 1");
  const editorHostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ace.Ace.Editor | null>(null);
  const suppressEditorChangeRef = useRef(false);
  const saveCommandRef = useRef<() => Promise<ProjectToolResult | void>>(
    async () => undefined,
  );
  const isDart = file.extension === "dart";
  const saveShortcut =
    window.divex?.platform === "darwin" ? "⌘S" : "Ctrl+S";
  const currentEditorValue = () => editorRef.current?.getValue() ?? value;

  const replaceEditorValue = (nextValue: string) => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== nextValue) {
      suppressEditorChangeRef.current = true;
      editor.setValue(nextValue, -1);
      suppressEditorChangeRef.current = false;
    }
    setValue(nextValue);
  };

  useEffect(() => {
    if (!editorHostRef.current) return;

    const editor = ace.edit(editorHostRef.current);
    editorRef.current = editor;
    editor.setTheme("ace/theme/one_dark");
    editor.session.setMode(aceModeForExtension(file.extension));
    editor.session.setUseWorker(false);
    editor.session.setTabSize(2);
    editor.session.setUseSoftTabs(true);
    editor.setValue(file.content, -1);
    editor.setOptions({
      animatedScroll: true,
      displayIndentGuides: true,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      fontFamily: '"SFMono-Regular", "Cascadia Code", Consolas, monospace',
      fontSize: "11px",
      highlightActiveLine: true,
      highlightSelectedWord: true,
      scrollPastEnd: 0.18,
      showFoldWidgets: true,
      showPrintMargin: false,
      wrap: false,
    });
    editor.renderer.setPadding(12);
    editor.renderer.setScrollMargin(10, 70, 0, 0);
    editor.textInput
      .getElement()
      .setAttribute("aria-label", `Editing ${file.name}`);

    const handleChange = () => {
      if (suppressEditorChangeRef.current) return;
      setValue(editor.getValue());
      setDirty(true);
    };
    const handleCursor = () => {
      const cursor = editor.getCursorPosition();
      setCursorPosition(`Ln ${cursor.row + 1}, Col ${cursor.column + 1}`);
    };

    editor.session.on("change", handleChange);
    editor.selection.on("changeCursor", handleCursor);
    editor.commands.addCommand({
      name: "divexSave",
      bindKey: { mac: "Command-S", win: "Ctrl-S" },
      exec: () => void saveCommandRef.current(),
    });

    return () => {
      editor.session.off("change", handleChange);
      editor.selection.off("changeCursor", handleCursor);
      editor.destroy();
      editorRef.current = null;
    };
    // The editor instance is reused while switching between files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor) {
      editor.session.setMode(aceModeForExtension(file.extension));
      editor.textInput
        .getElement()
        .setAttribute("aria-label", `Editing ${file.name}`);
    }
    replaceEditorValue(file.content);
    setDirty(false);
    setResult(null);
    setCursorPosition("Ln 1, Col 1");
  }, [file.content, file.id]);

  const saveCurrentFile = async () => {
    const content = currentEditorValue();
    setAction("save");
    try {
      if (!window.divex || rootPath === "Demo project") {
        onPersist(file.path, content);
        setDirty(false);
        const demoResult = {
          success: true,
          output: "Saved in this Divex demo session.",
        };
        setResult(demoResult);
        return demoResult;
      }

      const saveResult = await window.divex.saveProjectFile({
        rootPath,
        filePath: file.path,
        content,
      });
      setResult(saveResult);
      if (saveResult.success) {
        onPersist(file.path, content);
        setDirty(false);
      }
      return saveResult;
    } finally {
      setAction(null);
    }
  };

  const formatDart = async () => {
    if (!isDart) {
      setResult({
        success: false,
        output: "Dart formatting is only available for .dart files.",
      });
      return;
    }
    if (!window.divex || rootPath === "Demo project") {
      setResult({
        success: false,
        output: "Open a Flutter project folder to use the local Dart formatter.",
      });
      return;
    }

    setAction("format");
    try {
      const content = currentEditorValue();
      const formatResult = await window.divex.formatDartFile({
        rootPath,
        filePath: file.path,
        content,
      });
      setResult(formatResult);
      if (formatResult.success && formatResult.content !== undefined) {
        replaceEditorValue(formatResult.content);
        onPersist(file.path, formatResult.content);
        setDirty(false);
      }
    } finally {
      setAction(null);
    }
  };

  const analyzeFlutter = async () => {
    if (!window.divex || rootPath === "Demo project") {
      setResult({
        success: false,
        output: "Open a Flutter project folder to run Flutter analysis.",
      });
      return;
    }

    setAction("analyze");
    try {
      if (dirty) {
        const content = currentEditorValue();
        const saveResult = await window.divex.saveProjectFile({
          rootPath,
          filePath: file.path,
          content,
        });
        if (!saveResult.success) {
          setResult(saveResult);
          return;
        }
        onPersist(file.path, content);
        setDirty(false);
      }
      const analyzeResult = await window.divex.analyzeFlutter({ rootPath });
      setResult(analyzeResult);
    } finally {
      setAction(null);
    }
  };

  saveCommandRef.current = saveCurrentFile;

  return (
    <section className="code-editor-shell">
      <header className="code-editor-header">
        <button type="button" className="editor-back" onClick={onClose}>
          <ArrowLeft size={15} />
          Visualizer
        </button>
        <div className="editor-file-title">
          <strong>{file.name}</strong>
          <span>{file.path}</span>
        </div>
        <div className="flutter-badge">
          <Sparkles size={12} />
          {isDart ? "Dart · Flutter" : file.extension.toUpperCase()}
        </div>
        <div className="editor-actions">
          <button
            type="button"
            onClick={formatDart}
            disabled={action !== null || !isDart}
          >
            <WandSparkles size={14} />
            {action === "format" ? "Formatting…" : "Format"}
          </button>
          <button
            type="button"
            onClick={analyzeFlutter}
            disabled={action !== null}
          >
            <Play size={14} />
            {action === "analyze" ? "Analyzing…" : "Flutter Analyze"}
          </button>
          <button
            type="button"
            className="editor-save"
            onClick={saveCurrentFile}
            disabled={action !== null}
          >
            <Save size={14} />
            {action === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="editor-project-strip">
        <span className="status-dot" />
        <strong>{projectName}</strong>
        <span>Flutter workspace</span>
        <i />
        <span>{dirty ? "Unsaved changes" : "All changes saved"}</span>
      </div>

      <div className="editor-body">
        <div
          className="code-editor-host"
          ref={editorHostRef}
          aria-label={`Code editor for ${file.name}`}
        />
      </div>

      {result && (
        <div
          className={`editor-output ${
            result.success ? "output-success" : "output-error"
          }`}
        >
          {result.success ? (
            <CheckCircle2 size={14} />
          ) : (
            <CircleAlert size={14} />
          )}
          <pre>{result.output}</pre>
          <button
            type="button"
            aria-label="Close output"
            onClick={() => setResult(null)}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <footer className="editor-statusbar">
        <span>{isDart ? "Dart" : file.extension || "Plain text"}</span>
        <span>UTF-8</span>
        <span>Spaces: 2</span>
        <span className="editor-status-spacer" />
        <span>{cursorPosition}</span>
        <span>{saveShortcut} to save</span>
      </footer>
    </section>
  );
}
