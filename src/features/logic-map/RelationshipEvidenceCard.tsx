import { ArrowRight, Crosshair, FileCode2, ShieldCheck, X } from "lucide-react";
import type {
  EvidenceLocation,
  EvidenceProvider,
  VisualEdge,
  VisualNode,
} from "../../types";

interface RelationshipEvidenceCardProps {
  edge: VisualEdge;
  sourceNode?: VisualNode;
  targetNode?: VisualNode;
  onClose: () => void;
  onFocusNode: (nodeId: string) => void;
  onOpenLocation?: (path: string, line: number) => void;
}

const PROVIDER_LABELS: Record<EvidenceProvider, string> = {
  "workspace-index": "Workspace index",
  "dart-parser": "Dart static analysis",
  "dart-import-resolver": "Dart import resolver",
  "entry-point-detector": "Entry-point detector",
  "sql-schema-parser": "SQL schema parser",
  "sql-query-parser": "SQL query parser",
  "dart-database-detector": "Dart database detector",
};

function locationLabel(location: EvidenceLocation) {
  const line = location.range?.startLine;
  const column = location.range?.startColumn;
  return `${location.uri}${line ? `:${line}${column ? `:${column}` : ""}` : ""}`;
}

function LocationRow({
  label,
  location,
  onOpenLocation,
}: {
  label: string;
  location?: EvidenceLocation;
  onOpenLocation?: (path: string, line: number) => void;
}) {
  if (!location) return null;
  const canOpen =
    Boolean(onOpenLocation) &&
    Boolean(location.range) &&
    !location.uri.startsWith("workspace:") &&
    !location.uri.startsWith("package:") &&
    !location.uri.startsWith("dart:");

  return (
    <div className="evidence-location">
      <span>{label}</span>
      <code title={locationLabel(location)}>{locationLabel(location)}</code>
      {location.documentVersion && (
        <small title={location.documentVersion}>
          version {location.documentVersion.replace(/^fnv1a-/, "")}
        </small>
      )}
      {canOpen && location.range && (
        <button
          type="button"
          onClick={() =>
            onOpenLocation?.(location.uri, location.range?.startLine ?? 1)
          }
        >
          <FileCode2 size={12} />
          Open line
        </button>
      )}
    </div>
  );
}

export function RelationshipEvidenceCard({
  edge,
  sourceNode,
  targetNode,
  onClose,
  onFocusNode,
  onOpenLocation,
}: RelationshipEvidenceCardProps) {
  const evidence = edge.evidence;
  if (!evidence) return null;

  return (
    <aside className="relationship-evidence-card" aria-label="Relationship evidence">
      <header>
        <span>
          <ShieldCheck size={15} />
          Relationship evidence
        </span>
        <button type="button" aria-label="Close relationship evidence" onClick={onClose}>
          <X size={14} />
        </button>
      </header>

      <div className="evidence-route">
        <button type="button" onClick={() => onFocusNode(edge.source)}>
          <Crosshair size={11} />
          {sourceNode?.label ?? edge.source}
        </button>
        <ArrowRight size={13} />
        <button type="button" onClick={() => onFocusNode(edge.target)}>
          <Crosshair size={11} />
          {targetNode?.label ?? edge.target}
        </button>
      </div>

      <div className="evidence-badges">
        <span>{edge.kind}</span>
        <span>{PROVIDER_LABELS[evidence.provider]}</span>
        <span className={`confidence-${evidence.confidence}`}>
          {evidence.confidence}
        </span>
      </div>

      <p>{edge.explanation}</p>
      <p className="evidence-detail">{evidence.detail}</p>

      <div className="evidence-locations">
        <LocationRow
          label="Source proof"
          location={evidence.source}
          onOpenLocation={onOpenLocation}
        />
        <LocationRow
          label="Target definition"
          location={evidence.target}
          onOpenLocation={onOpenLocation}
        />
      </div>
    </aside>
  );
}
