import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Columns2,
  FileCode2,
  GitCompareArrows,
  History,
  ListTree,
  Map as MapIcon,
  Minus,
  Play,
  Pin,
  PinOff,
  Redo2,
  Replace,
  Save,
  Search,
  Settings2,
  Sparkles,
  ShieldCheck,
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
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/mode-tsx";
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
import type {
  AnalyzedFile,
  CodeSymbol,
  EditorRecoveryEntry,
  ProjectToolResult,
} from "../../types";
import { EditorRecoveryDialog } from "./EditorRecoveryDialog";
import { EditorMinimap } from "./EditorMinimap";
import { EditorDiagnosticsPanel, EditorDiffPanel } from "./EditorWorkbenchPanels";
import { aceModeForExtension, closestSymbol, fileLanguage } from "./editorSupport";
import type { EditorAction, EditorDocument, EditorGroup } from "./editorTypes";
import { addRecentlyClosed, hasExternalConflict, replacePreviewTab } from "./editorWorkspace";
import { parseFlutterDiagnostics, type EditorDiagnostic } from "./flutterDiagnostics";
import { useEditorRecovery } from "./useEditorRecovery";

interface CodeEditorProps {
  file: AnalyzedFile;
  files: AnalyzedFile[];
  projectName: string;
  rootPath: string;
  breakpoints: Record<string, number[]>;
  debugLocation: { filePath: string; line: number } | null;
  executionEnabled: boolean;
  revealLine: number | null;
  revealKey: number;
  onClose: () => void;
  onSelectFile: (path: string) => void;
  onPersist: (path: string, content: string) => void;
  onToggleBreakpoint: (path: string, line: number) => void;
}

export function CodeEditor({
  file,
  files,
  projectName,
  rootPath,
  breakpoints,
  debugLocation,
  executionEnabled,
  revealLine,
  revealKey,
  onClose,
  onSelectFile,
  onPersist,
  onToggleBreakpoint,
}: CodeEditorProps) {
  const isMac = window.divex?.platform === "darwin";
  const [openTabs, setOpenTabs] = useState<string[]>([file.path]);
  const [, setRevision] = useState(0);
  const [pinnedTabs, setPinnedTabs] = useState<Set<string>>(() => new Set());
  const [previewPath, setPreviewPath] = useState<string | null>(file.path);
  const [recentlyClosed, setRecentlyClosed] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [secondaryPath, setSecondaryPath] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<EditorGroup>("primary");
  const [showMinimap, setShowMinimap] = useState(true);
  const [workbenchPanel, setWorkbenchPanel] = useState<"diff" | "diagnostics" | null>(null);
  const [diagnostics, setDiagnostics] = useState<EditorDiagnostic[]>([]);
  const [pendingReveal, setPendingReveal] = useState<{ path: string; line: number } | null>(null);
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
  const editorHostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ace.Ace.Editor | null>(null);
  const secondaryEditorHostRef = useRef<HTMLDivElement>(null);
  const secondaryEditorRef = useRef<ace.Ace.Editor | null>(null);
  const secondaryPathRef = useRef<string | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const outlineMenuRef = useRef<HTMLDivElement>(null);
  const documentsRef = useRef(new Map<string, EditorDocument>());
  const activePathRef = useRef(file.path);
  const openTabsRef = useRef(openTabs);
  const pinnedTabsRef = useRef(pinnedTabs);
  const previewPathRef = useRef(previewPath);
  const diagnosticsRef = useRef(diagnostics);
  const suppressedDocumentsRef = useRef(new Set<string>());
  const debugLineRowsRef = useRef(new Map<ace.Ace.EditSession, number>());
  const onToggleBreakpointRef = useRef(onToggleBreakpoint);
  const saveCommandRef = useRef<() => Promise<ProjectToolResult | void>>(
    async () => undefined,
  );
  const secondarySaveCommandRef = useRef<() => Promise<ProjectToolResult | void>>(
    async () => undefined,
  );
  const filesByPath = useMemo(
    () => new Map(files.map((candidate) => [candidate.path, candidate])),
    [files],
  );
  openTabsRef.current = openTabs;
  pinnedTabsRef.current = pinnedTabs;
  previewPathRef.current = previewPath;
  secondaryPathRef.current = secondaryPath;
  diagnosticsRef.current = diagnostics;
  onToggleBreakpointRef.current = onToggleBreakpoint;
  const {
    clearRecoverySnapshot,
    queueRecoverySnapshot,
    recoveries,
    recoveryStatus,
    setRecoveries,
    setRecoveryStatus,
    writeRecoverySnapshot,
  } = useEditorRecovery({ rootPath, filesByPath, documentsRef, setResult });

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
        if (ownedDocument.dirty) {
          setPinnedTabs((current) => {
            if (current.has(nextFile.path)) return current;
            return new Set(current).add(nextFile.path);
          });
          setPreviewPath((current) => current === nextFile.path ? null : current);
        }
        queueRecoverySnapshot(ownedDocument);
        setRevision((current) => current + 1);
      });
      documentsRef.current.set(nextFile.path, document);
    } else {
      document.file = nextFile;
      document.session.setMode(aceModeForExtension(nextFile.extension));
      if (hasExternalConflict(document, nextFile.content)) {
        const conflictChanged =
          !document.conflict || document.externalContent !== nextFile.content;
        document.externalContent = nextFile.content;
        document.conflict = true;
        if (conflictChanged) setRevision((current) => current + 1);
      } else if (!document.dirty && document.savedContent !== nextFile.content) {
        suppressedDocumentsRef.current.add(nextFile.path);
        document.session.setValue(nextFile.content);
        document.session.getUndoManager().reset();
        suppressedDocumentsRef.current.delete(nextFile.path);
        document.savedContent = nextFile.content;
        document.externalContent = undefined;
        document.conflict = false;
      }
    }
    const annotations = diagnosticsRef.current
      .filter((diagnostic) => diagnostic.path === nextFile.path || diagnostic.path.endsWith(`/${nextFile.path}`))
      .map((diagnostic) => ({
        row: Math.max(0, diagnostic.line - 1),
        column: Math.max(0, diagnostic.column - 1),
        text: `${diagnostic.message} (${diagnostic.code})`,
        type: diagnostic.severity,
      }));
    document.session.setAnnotations(annotations);
    return document;
  }, [queueRecoverySnapshot]);

  const rememberActiveView = useCallback(() => {
    const editor = editorRef.current;
    const activeDocument = documentsRef.current.get(activePathRef.current);
    if (!editor || !activeDocument) return;
    activeDocument.cursor = editor.getCursorPosition();
    activeDocument.scrollTop = activeDocument.session.getScrollTop();
    activeDocument.scrollLeft = activeDocument.session.getScrollLeft();
  }, []);

  useEffect(() => {
    if (!splitOpen || !secondaryEditorHostRef.current) return;
    const editor = ace.edit(secondaryEditorHostRef.current);
    secondaryEditorRef.current = editor;
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
      fontSize: `${fontSize}px`,
      highlightActiveLine: true,
      highlightSelectedWord: true,
      mergeUndoDeltas: "always",
      scrollPastEnd: 0.28,
      showFoldWidgets: true,
      showPrintMargin: false,
      wrap,
    });
    editor.renderer.setPadding(13);
    editor.renderer.setScrollMargin(10, 90, 0, 0);
    const handleCursor = () => setCursor(editor.getCursorPosition());
    const handleFocus = () => {
      setActiveGroup("secondary");
      setCursor(editor.getCursorPosition());
    };
    const handleGutterMouseDown = (event: ace.Ace.MouseEvent) => {
      const target = event.domEvent.target as HTMLElement | null;
      if (!target?.classList.contains("ace_gutter-cell") || !secondaryPathRef.current) return;
      event.stop();
      onToggleBreakpointRef.current(secondaryPathRef.current, event.getDocumentPosition().row + 1);
    };
    editor.selection.on("changeCursor", handleCursor);
    editor.on("focus", handleFocus);
    (editor.on as unknown as (event: string, callback: (mouseEvent: ace.Ace.MouseEvent) => void) => void)("guttermousedown", handleGutterMouseDown);
    editor.commands.addCommand({
      name: "divexSaveSecondary",
      bindKey: { mac: "Command-S", win: "Ctrl-S" },
      exec: () => void secondarySaveCommandRef.current(),
    });
    const splitFile = secondaryPathRef.current ? filesByPath.get(secondaryPathRef.current) : null;
    if (splitFile) editor.setSession(ensureDocument(splitFile).session);
    editor.resize(true);
    return () => {
      editor.selection.off("changeCursor", handleCursor);
      editor.off("focus", handleFocus);
      (editor.off as unknown as (event: string, callback: (mouseEvent: ace.Ace.MouseEvent) => void) => void)("guttermousedown", handleGutterMouseDown);
      // Ace destroys the attached EditSession when an editor is destroyed.
      // Detach first because split groups deliberately share document sessions.
      editor.setSession(ace.createEditSession(""));
      editor.destroy();
      secondaryEditorRef.current = null;
    };
  // The secondary Ace instance is created only when the split opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitOpen]);

  useEffect(() => {
    if (!splitOpen || !secondaryPath) return;
    const splitFile = filesByPath.get(secondaryPath);
    const editor = secondaryEditorRef.current;
    if (!splitFile || !editor) return;
    const document = ensureDocument(splitFile);
    editor.setSession(document.session);
    editor.textInput.getElement().setAttribute("aria-label", `Editing ${splitFile.name} in split editor`);
    editor.resize(true);
  }, [ensureDocument, filesByPath, secondaryPath, splitOpen]);

  const activateDocument = useCallback(
    (nextFile: AnalyzedFile) => {
      const editor = editorRef.current;
      const document = ensureDocument(nextFile);
      const wasOpen = openTabsRef.current.includes(nextFile.path);
      if (!wasOpen) {
        const previousPreview = previewPathRef.current;
        const previewDocument = previousPreview
          ? documentsRef.current.get(previousPreview)
          : undefined;
        setOpenTabs((current) =>
          replacePreviewTab(
            current,
            nextFile.path,
            previousPreview,
            pinnedTabsRef.current,
            Boolean(previewDocument?.dirty),
          ),
        );
        if (
          previousPreview &&
          previousPreview !== nextFile.path &&
          !pinnedTabsRef.current.has(previousPreview) &&
          !previewDocument?.dirty &&
          secondaryPathRef.current !== previousPreview
        ) {
          documentsRef.current.delete(previousPreview);
        }
        setPreviewPath(nextFile.path);
      }
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
    const handleFocus = () => setActiveGroup("primary");
    const handleGutterMouseDown = (event: ace.Ace.MouseEvent) => {
      const target = event.domEvent.target as HTMLElement | null;
      if (!target?.classList.contains("ace_gutter-cell")) return;
      event.stop();
      const row = event.getDocumentPosition().row;
      onToggleBreakpointRef.current(activePathRef.current, row + 1);
    };
    editor.selection.on("changeCursor", handleCursor);
    editor.on("focus", handleFocus);
    (
      editor.on as unknown as (
        event: string,
        callback: (mouseEvent: ace.Ace.MouseEvent) => void,
      ) => void
    )("guttermousedown", handleGutterMouseDown);
    editor.commands.addCommand({
      name: "divexSave",
      bindKey: { mac: "Command-S", win: "Ctrl-S" },
      exec: () => void saveCommandRef.current(),
    });
    activateDocument(file);

    return () => {
      editor.selection.off("changeCursor", handleCursor);
      editor.off("focus", handleFocus);
      (
        editor.off as unknown as (
          event: string,
          callback: (mouseEvent: ace.Ace.MouseEvent) => void,
        ) => void
      )("guttermousedown", handleGutterMouseDown);
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
    documentsRef.current.forEach((document, path) => {
      const previousDebugRow = debugLineRowsRef.current.get(document.session);
      if (previousDebugRow !== undefined) {
        document.session.removeGutterDecoration(previousDebugRow, "ace_debug-line");
        debugLineRowsRef.current.delete(document.session);
      }
      document.session.clearBreakpoints();
      (breakpoints[path] ?? []).forEach((line) => {
        document.session.setBreakpoint(line - 1, "ace_breakpoint");
      });
      if (debugLocation?.filePath === path && debugLocation.line > 0) {
        const row = debugLocation.line - 1;
        document.session.addGutterDecoration(row, "ace_debug-line");
        debugLineRowsRef.current.set(document.session, row);
      }
    });
  }, [breakpoints, debugLocation, openTabs]);

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
    secondaryEditorRef.current?.setFontSize(fontSize);
    secondaryEditorRef.current?.setShowInvisibles(showInvisibles);
    documentsRef.current.forEach((document) => {
      document.session.setUseWrapMode(wrap);
      document.session.setTabSize(tabSize);
    });
    editor.resize(true);
    secondaryEditorRef.current?.resize(true);
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
    if (document.conflict) {
      setWorkbenchPanel("diff");
      return {
        success: false,
        output: `${document.file.name} changed outside Divex. Compare it, then choose Keep mine or Reload disk before saving.`,
      };
    }
    const content = document.session.getValue();
    let saveResult: ProjectToolResult;
    try {
      saveResult =
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
    } catch (error) {
      saveResult = {
        success: false,
        output:
          error instanceof Error
            ? `${error.message} Your unsaved buffer remains recovery-protected.`
            : "The file could not be saved. Your unsaved buffer remains recovery-protected.",
      };
    }
    if (saveResult.success) {
      document.savedContent = content;
      document.dirty = false;
      document.externalContent = undefined;
      document.conflict = false;
      onPersist(path, content);
      await clearRecoverySnapshot(path).catch(() => undefined);
      const hasOtherDirtyDocument = [...documentsRef.current.values()].some(
        (candidate) => candidate !== document && candidate.dirty,
      );
      setRecoveryStatus(hasOtherDirtyDocument ? "protected" : "idle");
      setRevision((current) => current + 1);
    } else {
      await writeRecoverySnapshot(document);
    }
    return saveResult;
  };

  const saveCurrentFile = async () => {
    setAction("save");
    try {
      const activePath =
        activeGroup === "secondary" && secondaryPathRef.current
          ? secondaryPathRef.current
          : activePathRef.current;
      const saveResult = await persistDocument(activePath);
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
      document.externalContent = undefined;
      document.conflict = false;
    } else {
      document.dirty = content !== document.savedContent;
    }
    setRevision((current) => current + 1);
  };

  const formatDart = async () => {
    if (activeEditorFile.extension !== "dart") return;
    if (!window.divex || rootPath === "Demo project") {
      setResult({
        success: false,
        output: "Open a Flutter project folder to use the local Dart formatter.",
      });
      return;
    }
    const document = ensureDocument(activeEditorFile);
    setAction("format");
    try {
      const formatResult = await window.divex.formatDartFile({
        rootPath,
        filePath: activeEditorFile.path,
        content: document.session.getValue(),
      });
      setResult(formatResult);
      if (formatResult.success && formatResult.content !== undefined) {
        replaceDocumentContent(document, formatResult.content, true);
        onPersist(activeEditorFile.path, formatResult.content);
        await clearRecoverySnapshot(activeEditorFile.path).catch(() => undefined);
        setRecoveryStatus("idle");
      }
    } finally {
      setAction(null);
    }
  };

  const applyDiagnostics = (output: string) => {
    const nextDiagnostics = parseFlutterDiagnostics(output);
    diagnosticsRef.current = nextDiagnostics;
    setDiagnostics(nextDiagnostics);
    documentsRef.current.forEach((document) =>
      document.session.clearAnnotations(),
    );
    nextDiagnostics.forEach((diagnostic) => {
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
    setWorkbenchPanel("diagnostics");
  };

  const analyzeFlutter = async () => {
    if (!executionEnabled) {
      setResult({
        success: false,
        output: "Trust this workspace before running project analysis tools.",
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
    void clearRecoverySnapshot(path).catch(() => undefined);
    setRecentlyClosed((current) => addRecentlyClosed(current, path));
    setPinnedTabs((current) => {
      if (!current.has(path)) return current;
      const next = new Set(current);
      next.delete(path);
      return next;
    });
    setPreviewPath((current) => current === path ? null : current);
    if (secondaryPathRef.current === path) {
      setSecondaryPath(null);
      setSplitOpen(false);
      setActiveGroup("primary");
    }
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

  const applyRecovery = (entry: EditorRecoveryEntry) => {
    const recoveredFile = filesByPath.get(entry.filePath);
    if (!recoveredFile) {
      setResult({
        success: false,
        output: `${entry.filePath} is no longer present in the opened project. Keep the recovery entry until the file is restored.`,
      });
      return false;
    }
    const document = ensureDocument(recoveredFile);
    replaceDocumentContent(document, entry.content, false);
    setOpenTabs((current) =>
      current.includes(entry.filePath)
        ? current
        : [...current, entry.filePath],
    );
    setPinnedTabs((current) => new Set(current).add(entry.filePath));
    setPreviewPath((current) => current === entry.filePath ? null : current);
    setRecoveryStatus("protected");
    return true;
  };

  const restoreRecovery = (entry: EditorRecoveryEntry) => {
    if (!applyRecovery(entry)) return;
    setRecoveries((current) =>
      current.filter((candidate) => candidate.filePath !== entry.filePath),
    );
    if (entry.filePath !== file.path) onSelectFile(entry.filePath);
  };

  const restoreAllRecoveries = () => {
    const restored = recoveries.filter(applyRecovery);
    setRecoveries((current) =>
      current.filter(
        (entry) =>
          !restored.some((candidate) => candidate.filePath === entry.filePath),
      ),
    );
    const first = restored[0];
    if (first && first.filePath !== file.path) onSelectFile(first.filePath);
  };

  const discardRecovery = async (entry: EditorRecoveryEntry) => {
    let cleared = true;
    await clearRecoverySnapshot(entry.filePath).catch((error) => {
      cleared = false;
      setResult({
        success: false,
        output:
          error instanceof Error
            ? error.message
            : "The recovery snapshot could not be discarded.",
      });
    });
    if (!cleared) return;
    setRecoveries((current) =>
      current.filter((candidate) => candidate.filePath !== entry.filePath),
    );
  };

  const discardAllRecoveries = async () => {
    await Promise.all(recoveries.map(discardRecovery));
    setRecoveries([]);
    setRecoveryStatus("idle");
  };

  const goToSymbol = (symbol: CodeSymbol) => {
    const editor = activeGroup === "secondary"
      ? secondaryEditorRef.current
      : editorRef.current;
    if (!editor) return;
    editor.gotoLine(symbol.line, 0, true);
    editor.clearSelection();
    editor.focus();
    setOutlineOpen(false);
  };

  const openInSplit = (path: string) => {
    const splitFile = filesByPath.get(path);
    if (!splitFile) return;
    ensureDocument(splitFile);
    setOpenTabs((current) => current.includes(path) ? current : [...current, path]);
    setPinnedTabs((current) => new Set(current).add(path));
    setPreviewPath((current) => current === path ? null : current);
    setSecondaryPath(path);
    setSplitOpen(true);
    setActiveGroup("secondary");
  };

  const togglePinned = (path: string) => {
    setPinnedTabs((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setPreviewPath((current) => current === path ? null : current);
  };

  const reopenClosedFile = (path: string) => {
    const reopened = filesByPath.get(path);
    if (!reopened) {
      setRecentlyClosed((current) => current.filter((candidate) => candidate !== path));
      setResult({ success: false, output: `${path} is no longer in this workspace.` });
      return;
    }
    setRecentlyClosed((current) => current.filter((candidate) => candidate !== path));
    setPinnedTabs((current) => new Set(current).add(path));
    setPreviewPath((current) => current === path ? null : current);
    onSelectFile(path);
    setHistoryOpen(false);
  };

  const reloadConflictFromDisk = async (document: EditorDocument) => {
    if (document.externalContent === undefined) return;
    replaceDocumentContent(document, document.externalContent, true);
    await clearRecoverySnapshot(document.file.path).catch(() => undefined);
    setResult({ success: true, output: `Reloaded ${document.file.name} from disk.` });
  };

  const keepConflictBuffer = (document: EditorDocument) => {
    if (document.externalContent === undefined) return;
    document.savedContent = document.externalContent;
    document.externalContent = undefined;
    document.conflict = false;
    document.dirty = document.session.getValue() !== document.savedContent;
    queueRecoverySnapshot(document);
    setRevision((current) => current + 1);
    setResult({ success: true, output: `Kept your editor changes for ${document.file.name}. Save to replace the disk version.` });
  };

  const openDiagnostic = (diagnostic: EditorDiagnostic) => {
    const matchingFile = files.find((candidate) =>
      diagnostic.path === candidate.path || diagnostic.path.endsWith(`/${candidate.path}`),
    );
    if (!matchingFile) return;
    setPendingReveal({ path: matchingFile.path, line: diagnostic.line });
    setActiveGroup("primary");
    onSelectFile(matchingFile.path);
  };

  useEffect(() => {
    if (!pendingReveal || pendingReveal.path !== file.path) return;
    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.gotoLine(pendingReveal.line, 0, true);
      editorRef.current?.focus();
      setPendingReveal(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [file.path, pendingReveal]);

  useEffect(() => {
    const reopen = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "t") return;
      const path = recentlyClosed[0];
      if (!path) return;
      event.preventDefault();
      reopenClosedFile(path);
    };
    window.addEventListener("keydown", reopen);
    return () => window.removeEventListener("keydown", reopen);
  });

  saveCommandRef.current = () => persistDocument(activePathRef.current);
  secondarySaveCommandRef.current = () => secondaryPathRef.current
    ? persistDocument(secondaryPathRef.current)
    : Promise.resolve({ success: false, output: "No split editor is open." });

  const activeEditorPath =
    activeGroup === "secondary" && secondaryPath
      ? secondaryPath
      : file.path;
  const activeEditorFile = filesByPath.get(activeEditorPath) ?? file;
  const activeDocument = documentsRef.current.get(activeEditorPath);
  const secondaryDocument = secondaryPath
    ? documentsRef.current.get(secondaryPath)
    : null;
  const conflictDiagnostics: EditorDiagnostic[] = [...documentsRef.current.values()]
    .filter((document) => document.conflict)
    .map((document) => ({
      severity: "warning",
      message: "File changed outside Divex while this editor buffer has unsaved changes.",
      path: document.file.path,
      line: 1,
      column: 1,
      code: "external-change",
    }));
  const workspaceDiagnostics = [...conflictDiagnostics, ...diagnostics];
  const dirtyCount = [...documentsRef.current.values()].filter(
    (document) => document.dirty,
  ).length;
  const activeSymbol = closestSymbol(activeEditorFile.symbols, cursor.row + 1);
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
          <strong>{activeEditorFile.name}</strong>
          <span>{activeEditorFile.path}{activeGroup === "secondary" ? " · split" : ""}</span>
        </div>
        <div className="flutter-badge">
          <Sparkles size={12} />
          {activeEditorFile.extension === "dart"
            ? "Dart · Flutter"
            : fileLanguage(activeEditorFile)}
        </div>
        <div className="editor-actions">
          <button
            type="button"
            title="Undo"
            aria-label="Undo"
            onClick={() => (activeGroup === "secondary" ? secondaryEditorRef.current : editorRef.current)?.undo()}
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            title="Redo"
            aria-label="Redo"
            onClick={() => (activeGroup === "secondary" ? secondaryEditorRef.current : editorRef.current)?.redo()}
          >
            <Redo2 size={13} />
          </button>
          <button
            type="button"
            title={isMac ? "Find (⌘F)" : "Find (Ctrl+F)"}
            aria-label="Find in file"
            onClick={() => (activeGroup === "secondary" ? secondaryEditorRef.current : editorRef.current)?.execCommand("find")}
          >
            <Search size={13} />
          </button>
          <button
            type="button"
            title={isMac ? "Replace (⌥⌘F)" : "Replace (Ctrl+H)"}
            aria-label="Replace in file"
            onClick={() => (activeGroup === "secondary" ? secondaryEditorRef.current : editorRef.current)?.execCommand("replace")}
          >
            <Replace size={13} />
          </button>
          <button
            type="button"
            title={splitOpen ? "Close split editor" : "Split editor"}
            aria-label={splitOpen ? "Close split editor" : "Split editor"}
            className={splitOpen ? "active" : ""}
            onClick={() => {
              if (splitOpen) {
                setSplitOpen(false);
                setSecondaryPath(null);
                setActiveGroup("primary");
              } else openInSplit(activeEditorFile.path);
            }}
          >
            <Columns2 size={13} />
          </button>
          <button
            type="button"
            title="Compare editor buffer with saved or external version"
            aria-label="Open diff editor"
            className={workbenchPanel === "diff" ? "active" : ""}
            onClick={() => setWorkbenchPanel((current) => current === "diff" ? null : "diff")}
          >
            <GitCompareArrows size={13} />
          </button>
          <button
            type="button"
            title="Workspace diagnostics"
            aria-label="Workspace diagnostics"
            className={workbenchPanel === "diagnostics" ? "active" : ""}
            onClick={() => setWorkbenchPanel((current) => current === "diagnostics" ? null : "diagnostics")}
          >
            <CircleAlert size={13} />
          </button>
          <div className="editor-toolbar-menu">
            <button
              type="button"
              title={isMac ? "Recently closed (⇧⌘T)" : "Recently closed (Ctrl+Shift+T)"}
              aria-label="Recently closed files"
              className={historyOpen ? "active" : ""}
              onClick={() => setHistoryOpen((current) => !current)}
            >
              <History size={13} />
            </button>
            {historyOpen && (
              <div className="editor-history-popover">
                <strong>Recently closed</strong>
                {recentlyClosed.length === 0 ? <span>No recently closed files.</span> : recentlyClosed.map((path) => (
                  <button type="button" key={path} onClick={() => reopenClosedFile(path)}>
                    <FileCode2 size={11} /><span>{filesByPath.get(path)?.name ?? path}<small>{path}</small></span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
                  <input
                    type="checkbox"
                    checked={showMinimap}
                    onChange={(event) => setShowMinimap(event.target.checked)}
                  />
                  <MapIcon size={13} />
                  Show minimap
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
            disabled={action !== null || activeEditorFile.extension !== "dart"}
          >
            <WandSparkles size={14} />
            <span>{action === "format" ? "Formatting…" : "Format"}</span>
          </button>
          <button
            type="button"
            title={
              activeEditorFile.kind === "dart"
                ? "Analyze Flutter project"
                : "Flutter analysis is available for Dart projects"
            }
            onClick={() => void analyzeFlutter()}
            disabled={
              action !== null || activeEditorFile.kind !== "dart" || !executionEnabled
            }
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
              aria-selected={path === file.path && activeGroup === "primary"}
              className={`${path === file.path ? "active" : ""} ${pinnedTabs.has(path) ? "pinned" : ""} ${previewPath === path ? "preview" : ""}`}
              key={path}
              title={path}
              onClick={() => {
                setActiveGroup("primary");
                if (path === file.path) editorRef.current?.focus();
                else onSelectFile(path);
              }}
              onDoubleClick={() => {
                setPinnedTabs((current) => new Set(current).add(path));
                setPreviewPath((current) => current === path ? null : current);
              }}
            >
              <FileCode2 size={12} />
              <span>{tabFile.name}</span>
              {document?.dirty && <i title="Unsaved changes" />}
              {pinnedTabs.has(path) ? (
                <PinOff className="editor-tab-pin" size={10} aria-label={`Unpin ${tabFile.name}`} onClick={(event) => { event.stopPropagation(); togglePinned(path); }} />
              ) : (
                <Pin className="editor-tab-pin" size={10} aria-label={`Pin ${tabFile.name}`} onClick={(event) => { event.stopPropagation(); togglePinned(path); }} />
              )}
              <Columns2 className="editor-tab-split" size={10} aria-label={`Open ${tabFile.name} in split editor`} onClick={(event) => { event.stopPropagation(); openInSplit(path); }} />
              <X
                className="editor-tab-close"
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
        {activeEditorFile.path.split("/").map((part, index) => (
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
            disabled={activeEditorFile.symbols.length === 0}
            onClick={() => {
              setSettingsOpen(false);
              setOutlineOpen((current) => !current);
            }}
          >
            <ListTree size={12} />
            {activeEditorFile.symbols.length} symbols
            <ChevronDown size={10} />
          </button>
          {outlineOpen && (
            <div className="editor-outline-popover">
              <strong>Symbols in {activeEditorFile.name}</strong>
              {activeEditorFile.symbols.map((symbol) => (
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

      <div className={`editor-workspace ${activeDocument?.conflict ? "with-conflict" : ""}`}>
        {activeDocument?.conflict && (
          <div className="editor-conflict-banner" role="alert">
            <CircleAlert size={13} />
            <span><strong>Changed outside Divex</strong>Your unsaved buffer was kept.</span>
            <button type="button" onClick={() => setWorkbenchPanel("diff")}>Compare</button>
            <button type="button" onClick={() => keepConflictBuffer(activeDocument)}>Keep mine</button>
            <button type="button" onClick={() => void reloadConflictFromDisk(activeDocument)}>Reload disk</button>
          </div>
        )}
        <div className={`editor-body editor-groups ${splitOpen ? "split" : ""}`}>
          <div className={`editor-group ${activeGroup === "primary" ? "active" : ""}`} onPointerDown={() => setActiveGroup("primary")}>
            <div
              className="code-editor-host"
              ref={editorHostRef}
              aria-label={`Code editor for ${file.name}`}
            />
            {showMinimap && (
              <EditorMinimap
                content={documentsRef.current.get(file.path)?.session.getValue() ?? file.content}
                activeLine={activeGroup === "primary" ? cursor.row + 1 : 1}
                onNavigate={(line) => {
                  editorRef.current?.gotoLine(line, 0, true);
                  editorRef.current?.focus();
                }}
              />
            )}
          </div>
          {splitOpen && secondaryPath && secondaryDocument && (
            <div className={`editor-group secondary ${activeGroup === "secondary" ? "active" : ""}`} onPointerDown={() => setActiveGroup("secondary")}>
              <header>
                <FileCode2 size={11} />
                <span>{secondaryDocument.file.name}<small>{secondaryPath}</small></span>
                {secondaryDocument.dirty && <i title="Unsaved changes" />}
                <button type="button" aria-label="Close split editor" onClick={() => { setSplitOpen(false); setSecondaryPath(null); setActiveGroup("primary"); }}><X size={11} /></button>
              </header>
              <div className="secondary-editor-host-wrap">
                <div className="code-editor-host" ref={secondaryEditorHostRef} aria-label={`Code editor for ${secondaryDocument.file.name} in split editor`} />
                {showMinimap && (
                  <EditorMinimap
                    content={secondaryDocument.session.getValue()}
                    activeLine={activeGroup === "secondary" ? cursor.row + 1 : 1}
                    onNavigate={(line) => {
                      secondaryEditorRef.current?.gotoLine(line, 0, true);
                      secondaryEditorRef.current?.focus();
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {workbenchPanel === "diff" && activeDocument && (
          <EditorDiffPanel
            fileName={activeEditorFile.name}
            leftLabel={activeDocument.conflict ? "External disk version" : "Last saved version"}
            leftContent={activeDocument.externalContent ?? activeDocument.savedContent}
            rightContent={activeDocument.session.getValue()}
            onClose={() => setWorkbenchPanel(null)}
          />
        )}
        {workbenchPanel === "diagnostics" && (
          <EditorDiagnosticsPanel
            diagnostics={workspaceDiagnostics}
            onOpen={openDiagnostic}
            onClose={() => setWorkbenchPanel(null)}
          />
        )}
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
        <span>{fileLanguage(activeEditorFile)}</span>
        <span>UTF-8</span>
        <span>Spaces: {tabSize}</span>
        <span>{wrap ? "Word wrap" : "No wrap"}</span>
        {workspaceDiagnostics.length > 0 && (
          <span className="editor-problems">
            <CircleAlert size={10} />
            {workspaceDiagnostics.length} problem{workspaceDiagnostics.length === 1 ? "" : "s"}
          </span>
        )}
        {recoveryStatus !== "idle" && (
          <span className={`editor-recovery-state ${recoveryStatus}`}>
            {recoveryStatus === "error" ? (
              <CircleAlert size={10} />
            ) : (
              <ShieldCheck size={10} />
            )}
            {recoveryStatus === "saving"
              ? "Protecting edits…"
              : recoveryStatus === "protected"
                ? "Recovery protected"
                : "Recovery unavailable"}
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

      <EditorRecoveryDialog
        entries={recoveries}
        filesByPath={filesByPath}
        onRestore={restoreRecovery}
        onDiscard={(entry) => void discardRecovery(entry)}
        onRestoreAll={restoreAllRecoveries}
        onDiscardAll={() => void discardAllRecoveries()}
      />

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
