import { Check, LockKeyhole, ShieldCheck, ShieldQuestion, X } from "lucide-react";
import type { WorkspaceTrustManager } from "./useWorkspaceTrust";

interface WorkspaceTrustBannerProps {
  manager: WorkspaceTrustManager;
  projectName: string;
  onManage: () => void;
}

export function WorkspaceTrustBanner({
  manager,
  projectName,
  onManage,
}: WorkspaceTrustBannerProps) {
  if (!manager.enabled || manager.trusted) return null;
  return (
    <div className="workspace-trust-banner" role="status">
      <LockKeyhole size={14} />
      <span>
        <strong>Restricted Mode</strong>
        <small>
          {manager.loading
            ? `Checking trust for ${projectName}…`
            : "Tasks, terminals, project scripts, and debugging are disabled."}
        </small>
      </span>
      <button type="button" disabled={manager.loading} onClick={onManage}>
        Manage trust
      </button>
    </div>
  );
}

interface WorkspaceTrustDialogProps {
  open: boolean;
  firstDecision: boolean;
  projectName: string;
  rootPath: string;
  manager: WorkspaceTrustManager;
  onClose: () => void;
  onChanged: (trusted: boolean) => void;
}

export function WorkspaceTrustDialog({
  open,
  firstDecision,
  projectName,
  rootPath,
  manager,
  onClose,
  onChanged,
}: WorkspaceTrustDialogProps) {
  if (!open) return null;
  const trusted = manager.trusted;
  const choose = async (nextTrusted: boolean) => {
    const status = await manager.setTrusted(nextTrusted);
    if (!status) return;
    onChanged(nextTrusted);
    onClose();
  };

  return (
    <div className="workspace-trust-backdrop" role="presentation">
      <section
        className="workspace-trust-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-trust-title"
      >
        <header>
          <span className={trusted ? "trusted" : "restricted"}>
            {trusted ? <ShieldCheck size={19} /> : <ShieldQuestion size={19} />}
          </span>
          {!firstDecision && (
            <button type="button" aria-label="Close workspace trust" onClick={onClose}>
              <X size={15} />
            </button>
          )}
        </header>
        <h2 id="workspace-trust-title">
          {firstDecision
            ? "Do you trust the authors of these files?"
            : trusted
              ? "This workspace is trusted"
              : "This workspace is restricted"}
        </h2>
        <p>
          {trusted
            ? "Divex can run terminals, tasks, project files, analysis tools, and debugging for this folder."
            : "You can safely read, search, map, edit, and manage these files. Code execution stays disabled until you trust the folder."}
        </p>
        <div className="workspace-trust-path">
          <strong>{projectName}</strong>
          <span>{rootPath}</span>
        </div>
        {!trusted && (
          <div className="workspace-trust-warning">
            Only trust files from people and sources you know. Project code can
            access your files and network with your user permissions.
          </div>
        )}
        {manager.status?.permissions && (
          <div className="workspace-trust-permissions">
            <strong>Permission details</strong>
            <span>
              Trust applies only to this exact folder. Divex never runs a
              project script automatically when the folder opens.
            </span>
            <ul>
              {manager.status.permissions.map((permission) => (
                <li className={permission.enabled ? "enabled" : "blocked"} key={permission.id}>
                  <i>{permission.enabled ? <Check size={11} /> : <LockKeyhole size={10} />}</i>
                  <p>
                    <strong>{permission.label}</strong>
                    <small>{permission.detail}</small>
                  </p>
                  <em>{permission.enabled ? "Allowed" : "Blocked"}</em>
                </li>
              ))}
            </ul>
          </div>
        )}
        {manager.result && !manager.result.success && (
          <div className="workspace-trust-error">{manager.result.output}</div>
        )}
        <footer>
          {trusted ? (
            <button
              type="button"
              className="danger"
              disabled={manager.changing}
              onClick={() => void choose(false)}
            >
              Revoke trust
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={manager.changing}
                onClick={() => void choose(false)}
              >
                Open in Restricted Mode
              </button>
              <button
                type="button"
                className="primary"
                disabled={manager.changing}
                onClick={() => void choose(true)}
              >
                {manager.changing ? "Saving…" : "Trust Workspace"}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
