import {
  ArrowRight,
  Braces,
  ChevronDown,
  Code2,
  ExternalLink,
  FileCode2,
  Lightbulb,
  Network,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  AnalyzedFile,
  AnalyzedProject,
  ExperienceMode,
  VisualNode,
} from "../types";

interface InspectorPanelProps {
  project: AnalyzedProject;
  selectedNode: VisualNode | null;
  selectedFile: AnalyzedFile | null;
  mode: ExperienceMode;
  showCode: boolean;
  onToggleCode: () => void;
  onClose: () => void;
  onSelectPath: (path: string) => void;
}

function relationshipExplanation(source: AnalyzedFile, target: AnalyzedFile) {
  return `${source.name} imports ${target.name} so it can use code defined there.`;
}

export function InspectorPanel({
  project,
  selectedNode,
  selectedFile,
  mode,
  showCode,
  onToggleCode,
  onClose,
  onSelectPath,
}: InspectorPanelProps) {
  const [symbolsOpen, setSymbolsOpen] = useState(false);

  useEffect(() => {
    setSymbolsOpen(false);
  }, [selectedFile?.id]);

  if (!selectedNode) {
    return (
      <aside className="inspector empty-inspector">
        <div className="empty-orbit">
          <span />
          <Network size={22} />
        </div>
        <h2>Explore a connection</h2>
        <p>
          Select a folder, file, or code bubble to understand what it contains
          and how it connects.
        </p>
        <div className="hint-card">
          <Lightbulb size={15} />
          <span>Drag to rotate. Scroll to zoom. Double-click to expand.</span>
        </div>
      </aside>
    );
  }

  const dependencies = selectedFile
    ? selectedFile.resolvedImports
        .map((path) => project.files.find((file) => file.path === path))
        .filter((file): file is AnalyzedFile => Boolean(file))
    : [];
  const usedBy = selectedFile
    ? project.files.filter((file) =>
        file.resolvedImports.includes(selectedFile.path),
      )
    : [];

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <div className={`inspector-kind kind-${selectedNode.kind}`}>
          {selectedNode.kind === "file" ? (
            <FileCode2 size={16} />
          ) : (
            <Braces size={16} />
          )}
        </div>
        <button type="button" className="icon-button" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="inspector-title">
        <span>{selectedNode.kind}</span>
        <h2>{selectedNode.label}</h2>
        <p>{selectedNode.path ?? selectedNode.subtitle}</p>
      </div>

      {selectedFile && (
        <>
          <div className="inspector-stats">
            <div>
              <strong>{selectedFile.lineCount}</strong>
              <span>lines</span>
            </div>
            <div>
              <strong>{selectedFile.symbols.length}</strong>
              <span>symbols</span>
            </div>
            <div>
              <strong>{dependencies.length}</strong>
              <span>links out</span>
            </div>
          </div>

          <button type="button" className="code-toggle" onClick={onToggleCode}>
            <Code2 size={15} />
            {showCode ? "Close code editor" : "View source code"}
            <ExternalLink size={13} />
          </button>

          <section className="inspector-section">
            <div className="section-label">
              <Network size={14} />
              <span>Branches to</span>
              <small>{dependencies.length}</small>
            </div>
            {dependencies.length === 0 ? (
              <p className="quiet">No project files are imported here.</p>
            ) : (
              dependencies.map((dependency) => (
                <button
                  type="button"
                  className="relationship-card"
                  key={dependency.id}
                  onClick={() => onSelectPath(dependency.path)}
                >
                  <span className="relationship-route">
                    {selectedFile.name}
                    <ArrowRight size={12} />
                    {dependency.name}
                  </span>
                  <p>
                    {relationshipExplanation(selectedFile, dependency)}
                  </p>
                </button>
              ))
            )}
          </section>

          <section className="inspector-section symbols-section">
            <button
              type="button"
              className="section-label section-toggle"
              aria-expanded={symbolsOpen}
              onClick={() => setSymbolsOpen((open) => !open)}
            >
              <Braces size={14} />
              <span>Functions &amp; symbols</span>
              <small>{selectedFile.symbols.length}</small>
              <ChevronDown
                className={symbolsOpen ? "chevron-open" : ""}
                size={13}
              />
            </button>
            {symbolsOpen && (
              <div className="symbols-dropdown">
                {selectedFile.symbols.length === 0 ? (
                  <p className="quiet">
                    No functions, classes, or methods were found in this file.
                  </p>
                ) : (
                  selectedFile.symbols.map((symbol) => (
                    <div className="symbol-row" key={symbol.id}>
                      <span className={`symbol-dot symbol-${symbol.kind}`} />
                      <div>
                        <span className="symbol-name-line">
                          <strong>{symbol.name}</strong>
                          <em>{symbol.kind}</em>
                        </span>
                        <code>
                          line {symbol.line} · {symbol.signature}
                        </code>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          {mode === "advanced" && (
            <section className="inspector-section">
              <div className="section-label">
                <Network size={14} />
                <span>Referenced by</span>
                <small>{usedBy.length}</small>
              </div>
              {usedBy.length === 0 ? (
                <p className="quiet">No incoming project references found.</p>
              ) : (
                usedBy.map((source) => (
                  <button
                    type="button"
                    className="advanced-row"
                    key={source.id}
                    onClick={() => onSelectPath(source.path)}
                  >
                    <span>{source.path}</span>
                    <ArrowRight size={12} />
                  </button>
                ))
              )}
            </section>
          )}
        </>
      )}
    </aside>
  );
}
