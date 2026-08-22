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
  VisualNode,
} from "../../types";

interface InspectorPanelProps {
  project: AnalyzedProject;
  selectedNode: VisualNode | null;
  selectedFile: AnalyzedFile | null;
  showCode: boolean;
  onToggleCode: () => void;
  onClose: () => void;
  onSelectPath: (path: string) => void;
  onSelectNode: (node: VisualNode) => void;
}

function relationshipExplanation(source: AnalyzedFile, target: AnalyzedFile) {
  return `${source.name} references ${target.name} so it can use code defined there.`;
}

export function InspectorPanel({
  project,
  selectedNode,
  selectedFile,
  showCode,
  onToggleCode,
  onClose,
  onSelectPath,
  onSelectNode,
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
          <span>
            Open Logic map to follow calls, object creation, inheritance, and
            dependencies with labeled arrows.
          </span>
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
  const selectedSymbol = selectedFile?.symbols.find(
    (symbol) => symbol.id === selectedNode.id,
  );
  const logicalConnections = project.relationships.filter(
    (relationship) =>
      relationship.sourceId === selectedNode.id ||
      relationship.targetId === selectedNode.id,
  );
  const definedSymbols = selectedSymbol
    ? selectedFile?.symbols.filter(
        (symbol) => symbol.parentSymbolId === selectedSymbol.id,
      ) ?? []
    : [];
  const logicalConnectionCount =
    logicalConnections.length + definedSymbols.length;

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <div className="inspector-head-title">
          <div className={`inspector-kind kind-${selectedNode.kind}`}>
            {selectedNode.kind === "file" ? (
              <FileCode2 size={16} />
            ) : (
              <Braces size={16} />
            )}
          </div>
          <span>{selectedSymbol ? "Code logic" : "File properties"}</span>
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
              <strong>
                {selectedSymbol ? logicalConnectionCount : dependencies.length}
              </strong>
              <span>{selectedSymbol ? "logic links" : "links out"}</span>
            </div>
          </div>

          <button type="button" className="code-toggle" onClick={onToggleCode}>
            <Code2 size={15} />
            {showCode ? "Close code editor" : "View source code"}
            <ExternalLink size={13} />
          </button>

          {selectedSymbol && (
            <section className="inspector-section">
              <div className="section-label">
                <Network size={14} />
                <span>Logical connections</span>
                <small>{logicalConnectionCount}</small>
              </div>
              {logicalConnectionCount === 0 ? (
                <p className="quiet">
                  No direct calls or type relationships were detected for this
                  symbol.
                </p>
              ) : (
                <>
                  {definedSymbols.map((symbol) => (
                    <button
                      type="button"
                      className="relationship-card logic-relationship-card"
                      key={`defines:${symbol.id}`}
                      onClick={() =>
                        onSelectNode({
                          id: symbol.id,
                          label: symbol.name,
                          subtitle: `${symbol.kind} · line ${symbol.line}`,
                          kind: symbol.kind,
                          path: selectedFile.path,
                          parentId: selectedSymbol.id,
                          position: [0, 0, 0],
                        })
                      }
                    >
                      <span className="relationship-route">
                        {selectedSymbol.name}
                        <ArrowRight size={12} />
                        {symbol.name}
                      </span>
                      <em>defines</em>
                      <p>
                        {selectedSymbol.name} defines the {symbol.kind}{" "}
                        {symbol.name}.
                      </p>
                    </button>
                  ))}
                  {logicalConnections.map((connection) => {
                    const incoming =
                      connection.targetId === selectedSymbol.id;
                    const connectedId = incoming
                      ? connection.sourceId
                      : connection.targetId;
                    const connectedFile = project.files.find(
                      (file) =>
                        file.path ===
                        (incoming
                          ? connection.sourcePath
                          : connection.targetPath),
                    );
                    const connectedSymbol = connectedFile?.symbols.find(
                      (symbol) => symbol.id === connectedId,
                    );
                    const sourceName = incoming
                      ? connectedSymbol?.name ?? connection.sourcePath
                      : selectedSymbol.name;
                    const targetName = incoming
                      ? selectedSymbol.name
                      : connection.targetName;
                    return (
                      <button
                        type="button"
                        className="relationship-card logic-relationship-card"
                        key={connection.id}
                        disabled={!connectedSymbol || !connectedFile}
                        onClick={() => {
                          if (!connectedSymbol || !connectedFile) return;
                          onSelectNode({
                            id: connectedSymbol.id,
                            label: connectedSymbol.name,
                            subtitle: `${connectedSymbol.kind} · line ${connectedSymbol.line}`,
                            kind: connectedSymbol.kind,
                            path: connectedFile.path,
                            parentId: connectedSymbol.parentSymbolId,
                            position: [0, 0, 0],
                          });
                        }}
                      >
                        <span className="relationship-route">
                          {sourceName}
                          <ArrowRight size={12} />
                          {targetName}
                        </span>
                        <em>{connection.kind}</em>
                        <p>{connection.explanation}</p>
                        {connection.confidence === "inferred" && (
                          <small>Inferred by static analysis</small>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </section>
          )}

          {!selectedSymbol && <section className="inspector-section">
            <div className="section-label">
              <Network size={14} />
              <span>Dependencies</span>
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
          </section>}

          {!selectedSymbol && <section className="inspector-section">
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
          </section>}

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
        </>
      )}
    </aside>
  );
}
