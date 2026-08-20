import { ShieldAlert } from "lucide-react";

interface WorkspaceTrustBannerProps {
  projectName: string;
  busy: boolean;
  onTrust: () => void;
}

export function WorkspaceTrustBanner({
  projectName,
  busy,
  onTrust,
}: WorkspaceTrustBannerProps) {
  return (
    <section className="workspace-trust-banner" aria-label="Restricted Mode">
      <ShieldAlert size={16} />
      <span>
        <strong>Restricted Mode</strong>
        <small>
          {projectName} can be explored and edited, but project code and tools
          cannot run.
        </small>
      </span>
      <button type="button" disabled={busy} onClick={onTrust}>
        {busy ? "Updating…" : "Trust this folder"}
      </button>
    </section>
  );
}

