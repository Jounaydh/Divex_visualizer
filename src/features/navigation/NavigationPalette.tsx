import {
  Braces,
  Command,
  CornerDownLeft,
  FileCode2,
  FileSearch,
  Network,
  Search,
  TextSearch,
  X,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AnalyzedProject } from "../../types";
import {
  findProjectReferences,
  navigationTarget,
  searchProjectFiles,
  searchProjectSymbols,
  searchProjectText,
  type NavigationSearchMode,
  type NavigationSearchResult,
  type NavigationTarget,
} from "./navigationIndex";

export interface NavigationCommand {
  id: string;
  title: string;
  description: string;
  shortcut?: string;
  keywords?: string;
  disabled?: boolean;
  run: () => void;
}

interface NavigationPaletteProps {
  open: boolean;
  mode: NavigationSearchMode;
  project: AnalyzedProject;
  referenceNodeId: string | null;
  commands: readonly NavigationCommand[];
  onModeChange: (mode: NavigationSearchMode) => void;
  onNavigate: (target: NavigationTarget) => void;
  onClose: () => void;
}

type PaletteItem =
  | {
      type: "navigation";
      result: NavigationSearchResult;
    }
  | {
      type: "command";
      command: NavigationCommand;
    };

const MODES: Array<{
  id: NavigationSearchMode;
  label: string;
  Icon: typeof FileSearch;
}> = [
  { id: "files", label: "Files", Icon: FileSearch },
  { id: "symbols", label: "Symbols", Icon: Braces },
  { id: "text", label: "Text", Icon: TextSearch },
  { id: "commands", label: "Commands", Icon: Command },
  { id: "references", label: "References", Icon: Network },
];

const PLACEHOLDERS: Record<NavigationSearchMode, string> = {
  files: "Type a file name or path…",
  symbols: "Type a function, class, method, or widget…",
  text: "Search text across every loaded source file…",
  commands: "Type an action, view, or setting…",
  references: "Filter references to the selected code…",
};

function commandMatches(command: NavigationCommand, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return `${command.title} ${command.description} ${command.keywords ?? ""}`
    .toLowerCase()
    .includes(normalized);
}

function resultMatches(result: NavigationSearchResult, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return `${result.title} ${result.subtitle} ${result.preview ?? ""}`
    .toLowerCase()
    .includes(normalized);
}

function itemId(item: PaletteItem) {
  return item.type === "command"
    ? `command:${item.command.id}`
    : item.result.id;
}

function ResultIcon({ item }: { item: PaletteItem }) {
  if (item.type === "command") return <Command size={15} />;
  if (item.result.kind === "file") return <FileCode2 size={15} />;
  if (item.result.kind === "symbol") return <Braces size={15} />;
  if (item.result.kind === "reference") return <Network size={15} />;
  return <TextSearch size={15} />;
}

export function NavigationPalette({
  open,
  mode,
  project,
  referenceNodeId,
  commands,
  onModeChange,
  onNavigate,
  onClose,
}: NavigationPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<PaletteItem[]>(() => {
    if (mode === "commands") {
      return commands
        .filter((command) => !command.disabled)
        .filter((command) => commandMatches(command, deferredQuery))
        .map((command) => ({ type: "command", command }));
    }
    if (mode === "references") {
      return findProjectReferences(project, referenceNodeId)
        .filter((result) => resultMatches(result, deferredQuery))
        .map((result) => ({ type: "navigation", result }));
    }

    const results =
      mode === "files"
        ? searchProjectFiles(project, deferredQuery)
        : mode === "symbols"
          ? searchProjectSymbols(project, deferredQuery)
          : searchProjectText(project, deferredQuery);
    return results.map((result) => ({ type: "navigation", result }));
  }, [commands, deferredQuery, mode, project, referenceNodeId]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [mode, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [deferredQuery]);

  useEffect(() => {
    if (activeIndex < items.length) return;
    setActiveIndex(Math.max(0, items.length - 1));
  }, [activeIndex, items.length]);

  if (!open) return null;

  const choose = (item: PaletteItem) => {
    if (item.type === "command") {
      onClose();
      item.command.run();
    } else {
      onNavigate(navigationTarget(item.result));
      onClose();
    }
  };

  return (
    <div
      className="navigation-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="navigation-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Project navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) =>
              Math.min(items.length - 1, current + 1),
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(0, current - 1));
          } else if (event.key === "Enter" && items[activeIndex]) {
            event.preventDefault();
            choose(items[activeIndex]);
          }
        }}
      >
        <div className="navigation-search">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={PLACEHOLDERS[mode]}
            aria-label={PLACEHOLDERS[mode]}
          />
          <button type="button" aria-label="Close navigation" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        <nav className="navigation-modes" aria-label="Search category">
          {MODES.map(({ id, label, Icon }) => (
            <button
              type="button"
              className={mode === id ? "active" : ""}
              disabled={id === "references" && !referenceNodeId}
              key={id}
              onClick={() => onModeChange(id)}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </nav>

        <div className="navigation-results" role="listbox">
          {items.length === 0 ? (
            <div className="navigation-empty">
              <Search size={20} />
              <strong>
                {mode === "text" && query.trim().length < 2
                  ? "Type at least two characters"
                  : mode === "references" && !referenceNodeId
                    ? "Select a file or code symbol first"
                    : "No matching project locations"}
              </strong>
              <span>
                Try a shorter name, another category, or a different command.
              </span>
            </div>
          ) : (
            items.map((item, index) => {
              const title =
                item.type === "command"
                  ? item.command.title
                  : item.result.title;
              const subtitle =
                item.type === "command"
                  ? item.command.description
                  : item.result.subtitle;
              const preview =
                item.type === "navigation"
                  ? item.result.preview
                  : undefined;
              const shortcut =
                item.type === "command"
                  ? item.command.shortcut
                  : item.result.line > 1
                    ? `Ln ${item.result.line}`
                    : undefined;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`navigation-result ${
                    index === activeIndex ? "active" : ""
                  }`}
                  key={itemId(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(item)}
                >
                  <span className="navigation-result-icon">
                    <ResultIcon item={item} />
                  </span>
                  <span className="navigation-result-copy">
                    <strong>{title}</strong>
                    <small>{subtitle}</small>
                    {preview && <code>{preview}</code>}
                  </span>
                  {shortcut && <kbd>{shortcut}</kbd>}
                </button>
              );
            })
          )}
        </div>

        <footer className="navigation-footer">
          <span>
            <kbd>↑↓</kbd> navigate
          </span>
          <span>
            <CornerDownLeft size={11} /> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
          <strong>{items.length} results</strong>
        </footer>
      </section>
    </div>
  );
}
