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
import * as ace from "ace-builds";
import "ace-builds/src-noconflict/ext-language_tools";
import "ace-builds/src-noconflict/mode-css";
import "ace-builds/src-noconflict/mode-dart";
import "ace-builds/src-noconflict/mode-html";
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/mode-jsx";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-text";
import "ace-builds/src-noconflict/mode-yaml";
import "ace-builds/src-noconflict/theme-one_dark";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { languageLabelForKind } from "../../analysis/languages/metadata";
import type {
  AnalyzedFile,
  CodeSymbol,
  ProjectToolResult,
} from "../../types";
import { parseFlutterDiagnostics } from "./flutterDiagnostics";

interface CodeEditorProps {
  file: AnalyzedFile;
  files: AnalyzedFile[];
  projectName: string;
  rootPath: string;
  revealLine: number | null;
  revealKey: number;
  onClose: () => void;
  onSelectFile: (path: string) => void;
  onPersist: (path: string, content: string) => void;
}

interface EditorDocument {
  file: AnalyzedFile;
  session: ace.Ace.EditSession;
  savedContent: string;
  dirty: boolean;
  cursor: { row: number; column: number };
  scrollTop: number;
  scrollLeft: number;
}

type EditorAction = "save" | "save-all" | "format" | "analyze" | null;

const aceModeForExtension = (extension: string) => {
  const modes: Record<string, string> = {
    cjs: "ace/mode/javascript",
    css: "ace/mode/css",
    dart: "ace/mode/dart",
    htm: "ace/mode/html",
    html: "ace/mode/html",
    java: "ace/mode/java",
    js: "ace/mode/javascript",
    jsx: "ace/mode/jsx",
    json: "ace/mode/json",
    mjs: "ace/mode/javascript",
    py: "ace/mode/python",
    pyw: "ace/mode/python",
    python: "ace/mode/python",
    yaml: "ace/mode/yaml",
    yml: "ace/mode/yaml",
  };
  return modes[extension.toLowerCase()] ?? "ace/mode/text";
};

function fileLanguage(file: AnalyzedFile) {
  return languageLabelForKind(file.kind, file.extension);
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
  onClose,
  onSelectFile,
  onPersist,
}: CodeEditorProps) {
  const isMac = window.divex?.platform === "darwin";
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
  const editorRef = useRef<ace.Ace.Editor | null>(null);
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
      const session = ace.createEditSession(nextFile.content);
      session.setMode(aceModeForExtension(nextFile.extension));
      session.setUseWorker(false);
      session.setTabSize(2);
      session.setUseSoftTabs(true);
      document = {
        file: nextFile,
        session,
        savedContent: nextFile.content,
        dirty: false,
        cursor: { row: 0, column: 0 },
        scrollTop: 0,
        scrollLeft: 0,
      };
      const ownedDocument = document;
      session.on("change", () => {
        if (suppressedDocumentsRef.current.has(nextFile.path)) return;
        ownedDocument.dirty =
          ownedDocument.session.getValue() !== ownedDocument.savedContent;
        setRevision((current) => current + 1);
      });
      documentsRef.current.set(nextFile.path, document);
    } else {
      document.file = nextFile;
      document.session.setMode(aceModeForExtension(nextFile.extension));
      if (!document.dirty && document.savedContent !== nextFile.content) {
        suppressedDocumentsRef.current.add(nextFile.path);
        document.session.setValue(nextFile.content);
        document.session.getUndoManager().reset();
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
    activeDocument.cursor = editor.getCursorPosition();
    activeDocument.scrollTop = activeDocument.session.getScrollTop();
    activeDocument.scrollLeft = activeDocument.session.getScrollLeft();
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
      editor.setSession(document.session);
      editor.textInput
        .getElement()
        .setAttribute("aria-label", `Editing ${nextFile.name}`);
      editor.moveCursorTo(document.cursor.row, document.cursor.column);
      editor.clearSelection();
      document.session.setScrollTop(document.scrollTop);
      document.session.setScrollLeft(document.scrollLeft);
      setCursor(document.cursor);
      editor.resize(true);
      editor.focus();
      setRevision((current) => current + 1);
    },
    [ensureDocument, rememberActiveView],
  );

  useEffect(() => {
    if (!editorHostRef.current) return;
    const editor = ace.edit(editorHostRef.current);
    editorRef.current = editor;
    editor.setTheme("ace/theme/one_dark");
    editor.setOptions({
      animatedScroll: true,
      behavioursEnabled: true,
      displayIndentGuides: true,
      dragEnabled: true,
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      enableMultiselect: true,
      fontFamily: '"SFMono-Regular", "Cascadia Code", Consolas, monospace',
      fontSize: "11px",
      highlightActiveLine: true,
      highlightSelectedWord: true,
      mergeUndoDeltas: "always",
      scrollPastEnd: 0.28,
      showFoldWidgets: true,
      showPrintMargin: false,
      wrap: false,
    });
    editor.renderer.setPadding(13);
    editor.renderer.setScrollMargin(10, 90, 0, 0);
    const handleCursor = () => setCursor(editor.getCursorPosition());
    editor.selection.on("changeCursor", handleCursor);
    editor.commands.addCommand({
      name: "divexSave",
      bindKey: { mac: "Command-S", win: "Ctrl-S" },
      exec: () => void saveCommandRef.current(),
    });
    activateDocument(file);

    return () => {
      editor.selection.off("changeCursor", handleCursor);
      editor.destroy();
      editorRef.current = null;
      documentsRef.current.clear();
    };
    // Ace is created once; files switch by changing EditSession.
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
          editor.session.getLength(),
        );
        editor.resize(true);
        editor.gotoLine(line, 0, true);
        editor.clearSelection();
        setCursor(editor.getCursorPosition());
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
    editor.setFontSize(fontSize);
    editor.setShowInvisibles(showInvisibles);
    documentsRef.current.forEach((document) => {
      document.session.setUseWrapMode(wrap);
      document.session.setTabSize(tabSize);
    });
    editor.resize(true);
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
    const content = document.session.getValue();
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
    document.session.setValue(content);
    document.session.getUndoManager().reset();
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
    if (file.extension !== "dart") return;
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
        content: document.session.getValue(),
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
      document.session.clearAnnotations(),
    );
    diagnostics.forEach((diagnostic) => {
      const matchingFile = files.find(
        (candidate) =>
          diagnostic.path === candidate.path ||
          diagnostic.path.endsWith(`/${candidate.path}`),
      );
      if (!matchingFile) return;
      const document = documentsRef.current.get(matchingFile.path);
      if (!document) return;
      const current = document.session.getAnnotations() ?? [];
      document.session.setAnnotations([
        ...current,
        {
          row: Math.max(0, diagnostic.line - 1),
          column: Math.max(0, diagnostic.column - 1),
          text: `${diagnostic.message} (${diagnostic.code})`,
          type: diagnostic.severity,
        },
      ]);
    });
    setProblemCount(diagnostics.length);
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
    editor.gotoLine(symbol.line, 0, true);
    editor.clearSelection();
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
            onClick={() => editorRef.current?.undo()}
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            title="Redo"
            aria-label="Redo"
            onClick={() => editorRef.current?.redo()}
          >
            <Redo2 size={13} />
          </button>
          <button
            type="button"
            title={isMac ? "Find (⌘F)" : "Find (Ctrl+F)"}
            aria-label="Find in file"
            onClick={() => editorRef.current?.execCommand("find")}
          >
            <Search size={13} />
          </button>
          <button
            type="button"
            title={isMac ? "Replace (⌥⌘F)" : "Replace (Ctrl+H)"}
            aria-label="Replace in file"
            onClick={() => editorRef.current?.execCommand("replace")}
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
            disabled={action !== null || file.extension !== "dart"}
          >
            <WandSparkles size={14} />
            <span>{action === "format" ? "Formatting…" : "Format"}</span>
          </button>
          <button
            type="button"
            title={
              file.kind === "dart"
                ? "Analyze Flutter project"
                : "Flutter analysis is available for Dart projects"
            }
            onClick={() => void analyzeFlutter()}
            disabled={action !== null || file.kind !== "dart"}
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
