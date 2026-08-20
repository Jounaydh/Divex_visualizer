import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileCode2,
  ListTree,
  Minus,
  Play,
  Redo2,
  Replace,
  Save,
  Search,
  Settings2,
  Sparkles,
  Undo2,
  WandSparkles,
  WrapText,
  X,
} from "lucide-react";
import * as monaco from "monaco-editor/editor";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import JsonWorker from "monaco-editor/language/json/json.worker.js?worker";
import "monaco-editor/features/bracketMatching/register.js";
import "monaco-editor/features/clipboard/register.js";
import "monaco-editor/features/codeEditor/register.js";
import "monaco-editor/features/codicon/register.js";
import "monaco-editor/features/comment/register.js";
import "monaco-editor/features/contextmenu/register.js";
import "monaco-editor/features/cursorUndo/register.js";
import "monaco-editor/features/dnd/register.js";
import "monaco-editor/features/find/register.js";
import "monaco-editor/features/folding/register.js";
import "monaco-editor/features/fontZoom/register.js";
import "monaco-editor/features/hover/register.js";
import "monaco-editor/features/indentation/register.js";
import "monaco-editor/features/lineSelection/register.js";
import "monaco-editor/features/linesOperations/register.js";
import "monaco-editor/features/links/register.js";
import "monaco-editor/features/multicursor/register.js";
import "monaco-editor/features/snippet/register.js";
import "monaco-editor/features/stickyScroll/register.js";
import "monaco-editor/features/suggest/register.js";
import "monaco-editor/features/tokenization/register.js";
import "monaco-editor/features/unicodeHighlighter/register.js";
import "monaco-editor/features/wordHighlighter/register.js";
import "monaco-editor/features/wordOperations/register.js";
import "monaco-editor/features/wordPartOperations/register.js";
import "monaco-editor/languages/definitions/dart/register.js";
import "monaco-editor/languages/definitions/java/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/sql/register.js";
import "monaco-editor/languages/definitions/yaml/register.js";
import "monaco-editor/languages/features/json/register.js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AnalyzedFile,
  CodeSymbol,
  ProjectToolResult,
} from "../../types";
import { monacoLanguageForExtension } from "./editorLanguage";
import { parseFlutterDiagnostics } from "./flutterDiagnostics";

interface CodeEditorProps {
  file: AnalyzedFile;
  files: AnalyzedFile[];
  projectName: string;
  rootPath: string;
  revealLine: number | null;
  revealKey: number;
  workspaceTrusted: boolean;
  onClose: () => void;
  onSelectFile: (path: string) => void;
  onPersist: (path: string, content: string) => void;
}

interface EditorDocument {
  file: AnalyzedFile;
  model: monaco.editor.ITextModel;
  savedContent: string;
  dirty: boolean;
  viewState: monaco.editor.ICodeEditorViewState | null;
  changeSubscription: monaco.IDisposable;
}

type EditorAction = "save" | "save-all" | "format" | "analyze" | null;

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (_moduleId: string, label: string) => Worker;
  };
};

monacoGlobal.MonacoEnvironment = {
  getWorker: (_moduleId, label) => {
    if (label === "json") return new JsonWorker();
    return new EditorWorker();
  },
};

function fileLanguage(file: AnalyzedFile) {
  if (file.extension === "dart") return "Dart";
  if (file.extension === "py") return "Python";
  if (file.extension === "sql") return "SQL";
  return file.extension ? file.extension.toUpperCase() : "Plain text";
}

function closestSymbol(symbols: CodeSymbol[], line: number) {
  return (
    symbols
      .filter((symbol) => symbol.line <= line && symbol.endLine >= line)
      .sort(
        (left, right) =>
          left.endLine - left.line - (right.endLine - right.line),
      )[0] ?? null
  );
}

export function CodeEditor({
  file,
  files,
  projectName,
  rootPath,
  revealLine,
  revealKey,
  workspaceTrusted,
  onClose,
  onSelectFile,
  onPersist,
}: CodeEditorProps) {
  const [openTabs, setOpenTabs] = useState<string[]>([file.path]);
  const [, setRevision] = useState(0);
  const [action, setAction] = useState<EditorAction>(null);
  const [result, setResult] = useState<ProjectToolResult | null>(null);
  const [cursor, setCursor] = useState({ row: 0, column: 0 });
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingClosePath, setPendingClosePath] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(11);
  const [wrap, setWrap] = useState(false);
  const [showInvisibles, setShowInvisibles] = useState(false);
  const [tabSize, setTabSize] = useState(2);
  const [problemCount, setProblemCount] = useState(0);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const outlineMenuRef = useRef<HTMLDivElement>(null);
  const documentsRef = useRef(new Map<string, EditorDocument>());
  const activePathRef = useRef(file.path);
  const openTabsRef = useRef(openTabs);
  const suppressedDocumentsRef = useRef(new Set<string>());
  const saveCommandRef = useRef<() => Promise<ProjectToolResult | void>>(
    async () => undefined,
  );
  const filesByPath = useMemo(
    () => new Map(files.map((candidate) => [candidate.path, candidate])),
    [files],
  );
  openTabsRef.current = openTabs;

  const ensureDocument = useCallback((nextFile: AnalyzedFile) => {
    let document = documentsRef.current.get(nextFile.path);
    if (!document) {
      const model = monaco.editor.createModel(
        nextFile.content,
        monacoLanguageForExtension(nextFile.extension),
        monaco.Uri.from({
          scheme: "inmemory",
          authority: "divex",
          path: `/${nextFile.path}`,
        }),
      );
      model.updateOptions({ insertSpaces: true, tabSize: 2 });
      document = {
        file: nextFile,
        model,
        savedContent: nextFile.content,
        dirty: false,
        viewState: null,
        changeSubscription: { dispose: () => undefined },
      };
      const ownedDocument = document;
      ownedDocument.changeSubscription = model.onDidChangeContent(() => {
        if (suppressedDocumentsRef.current.has(nextFile.path)) return;
        ownedDocument.dirty =
          ownedDocument.model.getValue() !== ownedDocument.savedContent;
        setRevision((current) => current + 1);
      });
      documentsRef.current.set(nextFile.path, document);
    } else {
      document.file = nextFile;
      monaco.editor.setModelLanguage(
        document.model,
        monacoLanguageForExtension(nextFile.extension),
      );
      if (!document.dirty && document.savedContent !== nextFile.content) {
        suppressedDocumentsRef.current.add(nextFile.path);
        document.model.setValue(nextFile.content);
        suppressedDocumentsRef.current.delete(nextFile.path);
        document.savedContent = nextFile.content;
      }
    }
    return document;
  }, []);

  const rememberActiveView = useCallback(() => {
    const editor = editorRef.current;
    const activeDocument = documentsRef.current.get(activePathRef.current);
    if (!editor || !activeDocument) return;
    activeDocument.viewState = editor.saveViewState();
  }, []);

  const activateDocument = useCallback(
    (nextFile: AnalyzedFile) => {
      const editor = editorRef.current;
      const document = ensureDocument(nextFile);
      setOpenTabs((current) =>
        current.includes(nextFile.path)
          ? current
          : [...current, nextFile.path],
      );
      if (!editor) {
        activePathRef.current = nextFile.path;
        return;
      }
      rememberActiveView();
      activePathRef.current = nextFile.path;
      editor.setModel(document.model);
      editor.updateOptions({ ariaLabel: `Editing ${nextFile.name}` });
      if (document.viewState) editor.restoreViewState(document.viewState);
      else editor.setPosition({ lineNumber: 1, column: 1 });
      const position = editor.getPosition();
      setCursor({
        row: Math.max(0, (position?.lineNumber ?? 1) - 1),
        column: Math.max(0, (position?.column ?? 1) - 1),
      });
      editor.layout();
      editor.focus();
      setRevision((current) => current + 1);
    },
    [ensureDocument, rememberActiveView],
  );

  useEffect(() => {
    if (!editorHostRef.current) return;
    monaco.editor.defineTheme("divex-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0f1013",
        "editor.foreground": "#d7dae0",
        "editor.lineHighlightBackground": "#ffffff08",
        "editor.selectionBackground": "#ffffff2b",
        "editor.inactiveSelectionBackground": "#ffffff18",
        "editorCursor.foreground": "#ffffff",
        "editorGutter.background": "#111216",
        "editorLineNumber.foreground": "#50535c",
        "editorLineNumber.activeForeground": "#a8abb3",
        "editorIndentGuide.background1": "#ffffff0d",
        "editorIndentGuide.activeBackground1": "#ffffff24",
      },
    });
    const editor = monaco.editor.create(editorHostRef.current, {
      ariaLabel: `Editing ${file.name}`,
      automaticLayout: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      dragAndDrop: true,
      folding: true,
      fontFamily: '"SFMono-Regular", "Cascadia Code", Consolas, monospace',
      fontLigatures: true,
      fontSize: 11,
      formatOnPaste: true,
      guides: { indentation: true },
      minimap: { enabled: false },
      mouseWheelZoom: true,
      multiCursorModifier: "alt",
      padding: { top: 10, bottom: 90 },
      renderLineHighlight: "all",
      roundedSelection: true,
      scrollBeyondLastLine: true,
      smoothScrolling: true,
      stickyScroll: { enabled: true },
      suggest: { preview: true, showWords: true },
      tabSize: 2,
      theme: "divex-dark",
      wordWrap: "off",
    });
    editorRef.current = editor;
    const cursorSubscription = editor.onDidChangeCursorPosition((event) =>
      setCursor({
        row: Math.max(0, event.position.lineNumber - 1),
        column: Math.max(0, event.position.column - 1),
      }),
    );
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => void saveCommandRef.current(),
    );
    activateDocument(file);

    return () => {
      cursorSubscription.dispose();
      editor.dispose();
      editorRef.current = null;
      documentsRef.current.forEach((document) => {
        document.changeSubscription.dispose();
        document.model.dispose();
      });
      documentsRef.current.clear();
    };
    // Monaco is created once; files switch by changing text models.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    activateDocument(file);
  }, [activateDocument, file]);

  useEffect(() => {
    setResult(null);
  }, [file.path]);

  useEffect(() => {
    openTabsRef.current.forEach((path) => {
      const currentFile = filesByPath.get(path);
      if (currentFile) ensureDocument(currentFile);
    });
  }, [ensureDocument, filesByPath]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !revealLine) return;
    let revealFrame = 0;
    const contentFrame = window.requestAnimationFrame(() => {
      revealFrame = window.requestAnimationFrame(() => {
        const line = Math.min(
          Math.max(1, revealLine),
          editor.getModel()?.getLineCount() ?? 1,
        );
        editor.layout();
        editor.setPosition({ lineNumber: line, column: 1 });
        editor.revealLineInCenter(line, monaco.editor.ScrollType.Smooth);
        setCursor({ row: line - 1, column: 0 });
        editor.focus();
      });
    });
    return () => {
      window.cancelAnimationFrame(contentFrame);
      window.cancelAnimationFrame(revealFrame);
    };
  }, [file.path, revealKey, revealLine]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({
      fontSize,
      renderWhitespace: showInvisibles ? "all" : "selection",
      tabSize,
      wordWrap: wrap ? "on" : "off",
    });
    documentsRef.current.forEach((document) => {
      document.model.updateOptions({ insertSpaces: true, tabSize });
    });
    editor.layout();
  }, [fontSize, openTabs, showInvisibles, tabSize, wrap]);

  useEffect(() => {
    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => {
      if (
        ![...documentsRef.current.values()].some(
          (document) => document.dirty,
        )
      ) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnAboutUnsavedChanges);
    return () =>
      window.removeEventListener("beforeunload", warnAboutUnsavedChanges);
  }, []);

  useEffect(() => {
    if (!settingsOpen && !outlineOpen) return;

    const closeDetachedMenus = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (settingsOpen && !settingsMenuRef.current?.contains(target)) {
        setSettingsOpen(false);
      }
      if (outlineOpen && !outlineMenuRef.current?.contains(target)) {
        setOutlineOpen(false);
      }
    };
    const closeMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      setOutlineOpen(false);
    };

    document.addEventListener("pointerdown", closeDetachedMenus, true);
    document.addEventListener("keydown", closeMenusOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeDetachedMenus, true);
      document.removeEventListener("keydown", closeMenusOnEscape);
    };
  }, [outlineOpen, settingsOpen]);

  const persistDocument = async (path: string) => {
    const document = documentsRef.current.get(path);
    if (!document) {
      return { success: false, output: "That editor document is not open." };
    }
    const content = document.model.getValue();
    const saveResult =
      !window.divex || rootPath === "Demo project"
        ? {
            success: true,
            output: "Saved in this Divex demo session.",
          }
        : await window.divex.saveProjectFile({
            rootPath,
            filePath: path,
            content,
          });
    if (saveResult.success) {
      document.savedContent = content;
      document.dirty = false;
      onPersist(path, content);
      setRevision((current) => current + 1);
    }
    return saveResult;
  };

  const saveCurrentFile = async () => {
    setAction("save");
    try {
      const saveResult = await persistDocument(file.path);
      setResult(saveResult);
      return saveResult;
    } finally {
      setAction(null);
    }
  };

  const saveAllDocuments = async (showResult = true) => {
    const dirtyDocuments = [...documentsRef.current.values()].filter(
      (document) => document.dirty,
    );
    let lastResult: ProjectToolResult = {
      success: true,
      output:
        dirtyDocuments.length === 0
          ? "All open files are already saved."
          : `Saved ${dirtyDocuments.length} open file${dirtyDocuments.length === 1 ? "" : "s"}.`,
    };
    for (const document of dirtyDocuments) {
      const saveResult = await persistDocument(document.file.path);
      if (!saveResult.success) {
        lastResult = saveResult;
        break;
      }
    }
    if (showResult) setResult(lastResult);
    return lastResult;
  };

  const saveAll = async () => {
    setAction("save-all");
    try {
      return await saveAllDocuments();
    } finally {
      setAction(null);
    }
  };

  const replaceDocumentContent = (
    document: EditorDocument,
    content: string,
    saved: boolean,
  ) => {
    suppressedDocumentsRef.current.add(document.file.path);
    document.model.setValue(content);
    suppressedDocumentsRef.current.delete(document.file.path);
    if (saved) {
      document.savedContent = content;
      document.dirty = false;
    } else {
      document.dirty = content !== document.savedContent;
    }
    setRevision((current) => current + 1);
  };

  const formatDart = async () => {
    if (file.extension !== "dart" || !workspaceTrusted) return;
    if (!window.divex || rootPath === "Demo project") {
      setResult({
        success: false,
        output: "Open a Flutter project folder to use the local Dart formatter.",
      });
      return;
    }
    const document = ensureDocument(file);
    setAction("format");
    try {
      const formatResult = await window.divex.formatDartFile({
        rootPath,
        filePath: file.path,
        content: document.model.getValue(),
      });
      setResult(formatResult);
      if (formatResult.success && formatResult.content !== undefined) {
        replaceDocumentContent(document, formatResult.content, true);
        onPersist(file.path, formatResult.content);
      }
    } finally {
      setAction(null);
    }
  };

  const applyDiagnostics = (output: string) => {
    const diagnostics = parseFlutterDiagnostics(output);
    documentsRef.current.forEach((document) =>
      monaco.editor.setModelMarkers(document.model, "divex-flutter", []),
    );
    const markersByPath = new Map<string, monaco.editor.IMarkerData[]>();
    diagnostics.forEach((diagnostic) => {
      const matchingFile = files.find(
        (candidate) =>
          diagnostic.path === candidate.path ||
          diagnostic.path.endsWith(`/${candidate.path}`),
      );
      if (!matchingFile) return;
      const document = documentsRef.current.get(matchingFile.path);
      if (!document) return;
      const lineNumber = Math.min(
        Math.max(1, diagnostic.line),
        document.model.getLineCount(),
      );
      const startColumn = Math.min(
        Math.max(1, diagnostic.column),
        document.model.getLineMaxColumn(lineNumber),
      );
      const severity =
        diagnostic.severity === "error"
          ? monaco.MarkerSeverity.Error
          : diagnostic.severity === "warning"
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info;
      const markers = markersByPath.get(matchingFile.path) ?? [];
      markers.push({
        code: diagnostic.code,
        endColumn: Math.min(
          document.model.getLineMaxColumn(lineNumber),
          startColumn + 1,
        ),
        endLineNumber: lineNumber,
        message: diagnostic.message,
        severity,
        source: "flutter analyze",
        startColumn,
        startLineNumber: lineNumber,
      });
      markersByPath.set(matchingFile.path, markers);
    });
    markersByPath.forEach((markers, path) => {
      const document = documentsRef.current.get(path);
      if (document) {
        monaco.editor.setModelMarkers(document.model, "divex-flutter", markers);
      }
    });
    setProblemCount(diagnostics.length);
  };

  const analyzeFlutter = async () => {
    if (!workspaceTrusted) {
      setResult({
        success: false,
        output: "Trust this workspace before running Flutter analysis.",
      });
      return;
    }
    if (!window.divex || rootPath === "Demo project") {
      setResult({
        success: false,
        output: "Open a Flutter project folder to run Flutter analysis.",
      });
      return;
    }
    setAction("analyze");
    try {
      const saveResult = await saveAllDocuments(false);
      if (!saveResult.success) {
        setResult(saveResult);
        return;
      }
      const analyzeResult = await window.divex.analyzeFlutter({ rootPath });
      setResult(analyzeResult);
      applyDiagnostics(analyzeResult.output);
    } finally {
      setAction(null);
    }
  };

  const finishClosingTab = (path: string) => {
    const currentTabs = openTabsRef.current;
    const closingIndex = currentTabs.indexOf(path);
    const nextTabs = currentTabs.filter((candidate) => candidate !== path);
    setOpenTabs(nextTabs);
    setPendingClosePath(null);
    const closingDocument = documentsRef.current.get(path);
    closingDocument?.changeSubscription.dispose();
    closingDocument?.model.dispose();
    if (path !== file.path) {
      documentsRef.current.delete(path);
      return;
    }
    const nextPath =
      nextTabs[Math.min(closingIndex, nextTabs.length - 1)] ??
      nextTabs[nextTabs.length - 1];
    documentsRef.current.delete(path);
    if (nextPath) onSelectFile(nextPath);
    else onClose();
  };

  const requestCloseTab = (path: string) => {
    const document = documentsRef.current.get(path);
    if (document?.dirty) setPendingClosePath(path);
    else finishClosingTab(path);
  };

  const saveAndClosePendingTab = async () => {
    if (!pendingClosePath) return;
    setAction("save");
    try {
      const saveResult = await persistDocument(pendingClosePath);
      setResult(saveResult);
      if (saveResult.success) finishClosingTab(pendingClosePath);
    } finally {
      setAction(null);
    }
  };

  const goToSymbol = (symbol: CodeSymbol) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setPosition({ lineNumber: symbol.line, column: symbol.column });
    editor.revealLineInCenter(symbol.line, monaco.editor.ScrollType.Smooth);
    editor.focus();
    setOutlineOpen(false);
  };

  saveCommandRef.current = saveCurrentFile;

  const activeDocument = documentsRef.current.get(file.path);
  const dirtyCount = [...documentsRef.current.values()].filter(
    (document) => document.dirty,
  ).length;
  const activeSymbol = closestSymbol(file.symbols, cursor.row + 1);
  const pendingDocument = pendingClosePath
    ? documentsRef.current.get(pendingClosePath)
    : null;

  return (
    <section className="code-editor-shell">
      <header className="code-editor-header">
        <button
          type="button"
          className="editor-back"
          aria-label="Back to visualizer"
          title="Back to visualizer"
          onClick={onClose}
        >
          <ArrowLeft size={15} />
          <span>Visualizer</span>
        </button>
        <div className="editor-file-title">
          <strong>{file.name}</strong>
          <span>{file.path}</span>
        </div>
        <div className="flutter-badge">
          <Sparkles size={12} />
          {file.extension === "dart"
            ? "Dart · Flutter"
            : fileLanguage(file)}
        </div>
        <div className="editor-actions">
          <button
            type="button"
            title="Undo"
            aria-label="Undo"
            onClick={() =>
              editorRef.current?.trigger("divex-toolbar", "undo", null)
            }
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            title="Redo"
            aria-label="Redo"
            onClick={() =>
              editorRef.current?.trigger("divex-toolbar", "redo", null)
            }
          >
            <Redo2 size={13} />
          </button>
          <button
            type="button"
            title="Find (⌘F)"
            aria-label="Find in file"
            onClick={() =>
              void editorRef.current?.getAction("actions.find")?.run()
            }
          >
            <Search size={13} />
          </button>
          <button
            type="button"
            title="Replace (⌥⌘F)"
            aria-label="Replace in file"
            onClick={() =>
              void editorRef.current
                ?.getAction("editor.action.startFindReplaceAction")
                ?.run()
            }
          >
            <Replace size={13} />
          </button>
          <div className="editor-toolbar-menu" ref={settingsMenuRef}>
            <button
              type="button"
              title="Editor settings"
              aria-label="Editor settings"
              className={settingsOpen ? "active" : ""}
              onClick={() => {
                setOutlineOpen(false);
                setSettingsOpen((current) => !current);
              }}
            >
              <Settings2 size={13} />
            </button>
            {settingsOpen && (
              <div className="editor-settings-popover">
                <strong>Editor preferences</strong>
                <div>
                  <span>Font size</span>
                  <button
                    type="button"
                    aria-label="Decrease editor font size"
                    onClick={() =>
                      setFontSize((current) => Math.max(9, current - 1))
                    }
                  >
                    <Minus size={12} />
                  </button>
                  <small>{fontSize}px</small>
                  <button
                    type="button"
                    aria-label="Increase editor font size"
                    onClick={() =>
                      setFontSize((current) => Math.min(20, current + 1))
                    }
                  >
                    +
                  </button>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={wrap}
                    onChange={(event) => setWrap(event.target.checked)}
                  />
                  <WrapText size={13} />
                  Wrap long lines
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showInvisibles}
                    onChange={(event) =>
                      setShowInvisibles(event.target.checked)
                    }
                  />
                  <FileCode2 size={13} />
                  Show whitespace
                </label>
                <label>
                  <span>Tab size</span>
                  <select
                    value={tabSize}
                    onChange={(event) =>
                      setTabSize(Number.parseInt(event.target.value, 10))
                    }
                  >
                    <option value={2}>2 spaces</option>
                    <option value={4}>4 spaces</option>
                  </select>
                </label>
              </div>
            )}
          </div>
          <button
            type="button"
            title="Format Dart file"
            onClick={() => void formatDart()}
            disabled={
              action !== null ||
              file.extension !== "dart" ||
              !workspaceTrusted
            }
          >
            <WandSparkles size={14} />
            <span>{action === "format" ? "Formatting…" : "Format"}</span>
          </button>
          <button
            type="button"
            title="Analyze Flutter project"
            onClick={() => void analyzeFlutter()}
            disabled={action !== null || !workspaceTrusted}
          >
            <Play size={14} />
            <span>{action === "analyze" ? "Analyzing…" : "Analyze"}</span>
          </button>
          <button
            type="button"
            title="Save all open files"
            onClick={() => void saveAll()}
            disabled={action !== null || dirtyCount === 0}
          >
            <Save size={14} />
            <span>{action === "save-all" ? "Saving…" : "Save all"}</span>
          </button>
          <button
            type="button"
            className="editor-save"
            title="Save current file"
            onClick={() => void saveCurrentFile()}
            disabled={action !== null || !activeDocument?.dirty}
          >
            <Save size={14} />
            <span>{action === "save" ? "Saving…" : "Save"}</span>
          </button>
        </div>
      </header>

      <div className="editor-tabs" role="tablist">
        {openTabs.map((path) => {
          const document = documentsRef.current.get(path);
          const tabFile = document?.file ?? filesByPath.get(path);
          if (!tabFile) return null;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={path === file.path}
              className={path === file.path ? "active" : ""}
              key={path}
              title={path}
              onClick={() => {
                if (path === file.path) editorRef.current?.focus();
                else onSelectFile(path);
              }}
            >
              <FileCode2 size={12} />
              <span>{tabFile.name}</span>
              {document?.dirty && <i title="Unsaved changes" />}
              <X
                size={11}
                aria-label={`Close ${tabFile.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  requestCloseTab(path);
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="editor-breadcrumbs">
        <span className="status-dot" />
        <strong>{projectName}</strong>
        {file.path.split("/").map((part, index) => (
          <span className="editor-breadcrumb-part" key={`${part}:${index}`}>
            <ChevronRight size={10} />
            {part}
          </span>
        ))}
        {activeSymbol && (
          <span className="editor-breadcrumb-part symbol">
            <ChevronRight size={10} />
            {activeSymbol.kind} {activeSymbol.name}
          </span>
        )}
        <i />
        <div className="editor-outline-menu" ref={outlineMenuRef}>
          <button
            type="button"
            disabled={file.symbols.length === 0}
            onClick={() => {
              setSettingsOpen(false);
              setOutlineOpen((current) => !current);
            }}
          >
            <ListTree size={12} />
            {file.symbols.length} symbols
            <ChevronDown size={10} />
          </button>
          {outlineOpen && (
            <div className="editor-outline-popover">
              <strong>Symbols in {file.name}</strong>
              {file.symbols.map((symbol) => (
                <button
                  type="button"
                  key={symbol.id}
                  onClick={() => goToSymbol(symbol)}
                >
                  <span>{symbol.name}</span>
                  <small>
                    {symbol.kind} · Ln {symbol.line}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
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
        <span>{fileLanguage(file)}</span>
        <span>UTF-8</span>
        <span>Spaces: {tabSize}</span>
        <span>{wrap ? "Word wrap" : "No wrap"}</span>
        {problemCount > 0 && (
          <span className="editor-problems">
            <CircleAlert size={10} />
            {problemCount} problem{problemCount === 1 ? "" : "s"}
          </span>
        )}
        <span className="editor-status-spacer" />
        <span>
          Ln {cursor.row + 1}, Col {cursor.column + 1}
        </span>
        <span>
          {dirtyCount > 0
            ? `${dirtyCount} unsaved`
            : "All open files saved"}
        </span>
      </footer>

      {pendingDocument && (
        <div className="editor-close-backdrop" role="presentation">
          <section
            className="editor-close-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Save changes to ${pendingDocument.file.name}`}
          >
            <CircleAlert size={20} />
            <h3>Save changes to {pendingDocument.file.name}?</h3>
            <p>
              Closing this tab without saving will discard its editor buffer.
            </p>
            <div>
              <button
                type="button"
                onClick={() => setPendingClosePath(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => finishClosingTab(pendingDocument.file.path)}
              >
                Don’t save
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void saveAndClosePendingTab()}
              >
                Save and close
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
