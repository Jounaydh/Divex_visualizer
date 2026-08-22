import { RotateCcw, Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DEFAULT_PROJECT_SETTINGS,
  NEW_FILE_EXTENSIONS,
  type ProjectSettings,
} from "./projectSettings";

interface ProjectSettingsDialogProps {
  open: boolean;
  projectName: string;
  settings: ProjectSettings;
  onClose: () => void;
  onSave: (settings: ProjectSettings) => void;
}

export function ProjectSettingsDialog({
  open,
  projectName,
  settings,
  onClose,
  onSave,
}: ProjectSettingsDialogProps) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  const update = <Key extends keyof ProjectSettings>(
    key: Key,
    value: ProjectSettings[Key],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div
      className="project-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="project-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-settings-title"
      >
        <header>
          <span>
            <Settings2 size={16} />
            <span>
              <strong id="project-settings-title">Project Settings</strong>
              <small>{projectName}</small>
            </span>
          </span>
          <button type="button" aria-label="Close project settings" onClick={onClose}>
            <X size={15} />
          </button>
        </header>

        <div className="project-settings-content">
          <fieldset>
            <legend>Workspace</legend>
            <label>
              <span>
                <strong>Default view</strong>
                <small>Map shown when this project opens.</small>
              </span>
              <select
                aria-label="Default project view"
                value={draft.defaultView}
                onChange={(event) => update("defaultView", event.target.value as ProjectSettings["defaultView"])}
              >
                <option value="2d">2D Project</option>
                <option value="logic">Logic</option>
              </select>
            </label>
            <label>
              <span>
                <strong>Workflow direction</strong>
                <small>Default direction for both visual maps.</small>
              </span>
              <select
                aria-label="Default workflow direction"
                value={draft.workflowDirection}
                onChange={(event) => update("workflowDirection", event.target.value as ProjectSettings["workflowDirection"])}
              >
                <option value="top-down">Top to bottom</option>
                <option value="bottom-up">Bottom to top</option>
                <option value="left-right">Left to right</option>
                <option value="right-left">Right to left</option>
              </select>
            </label>
            <label>
              <span>
                <strong>New file type</strong>
                <small>Extension proposed by the Explorer.</small>
              </span>
              <select
                aria-label="Default new file extension"
                value={draft.newFileExtension}
                onChange={(event) => update("newFileExtension", event.target.value as ProjectSettings["newFileExtension"])}
              >
                {NEW_FILE_EXTENSIONS.map((extension) => (
                  <option key={extension} value={extension}>.{extension}</option>
                ))}
              </select>
            </label>
            <label className="project-setting-toggle">
              <span>
                <strong>Free positioning</strong>
                <small>Allow cards to be manually repositioned.</small>
              </span>
              <input
                type="checkbox"
                checked={draft.freePositioning}
                onChange={(event) => update("freePositioning", event.target.checked)}
              />
            </label>
            <label className="project-setting-toggle">
              <span>
                <strong>Live project refresh</strong>
                <small>Reload supported files when they change on disk.</small>
              </span>
              <input
                type="checkbox"
                checked={draft.liveRefresh}
                onChange={(event) => update("liveRefresh", event.target.checked)}
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>Git</legend>
            <label className="project-setting-toggle">
              <span>
                <strong>Refresh Git on focus</strong>
                <small>Recheck repository status when returning to Divex.</small>
              </span>
              <input
                type="checkbox"
                checked={draft.gitAutoRefresh}
                onChange={(event) => update("gitAutoRefresh", event.target.checked)}
              />
            </label>
            <label className="project-setting-toggle">
              <span>
                <strong>Confirm discard actions</strong>
                <small>Require confirmation before deleting working changes.</small>
              </span>
              <input
                type="checkbox"
                checked={draft.confirmGitDiscard}
                onChange={(event) => update("confirmGitDiscard", event.target.checked)}
              />
            </label>
          </fieldset>
        </div>

        <footer>
          <button
            type="button"
            className="project-settings-reset"
            onClick={() => setDraft({ ...DEFAULT_PROJECT_SETTINGS })}
          >
            <RotateCcw size={13} />
            Reset defaults
          </button>
          <span>
            <button type="button" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="primary"
              onClick={() => onSave(draft)}
            >
              Save settings
            </button>
          </span>
        </footer>
      </section>
    </div>
  );
}
