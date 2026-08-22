import type { ViewMode, WorkflowDirection } from "../../types";

export const NEW_FILE_EXTENSIONS = [
  "txt",
  "py",
  "dart",
  "java",
  "js",
  "ts",
  "tsx",
  "html",
  "css",
] as const;

export type NewFileExtension = (typeof NEW_FILE_EXTENSIONS)[number];

export interface ProjectSettings {
  defaultView: ViewMode;
  workflowDirection: WorkflowDirection;
  freePositioning: boolean;
  liveRefresh: boolean;
  gitAutoRefresh: boolean;
  confirmGitDiscard: boolean;
  newFileExtension: NewFileExtension;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  defaultView: "2d",
  workflowDirection: "top-down",
  freePositioning: false,
  liveRefresh: true,
  gitAutoRefresh: true,
  confirmGitDiscard: true,
  newFileExtension: "txt",
};

const DIRECTIONS: WorkflowDirection[] = [
  "top-down",
  "bottom-up",
  "left-right",
  "right-left",
];

export function projectSettingsKey(rootPath: string) {
  return `divex:project-settings:${encodeURIComponent(rootPath)}`;
}

export function normalizeProjectSettings(value: unknown): ProjectSettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<ProjectSettings>)
      : {};
  return {
    defaultView: candidate.defaultView === "logic" ? "logic" : "2d",
    workflowDirection: DIRECTIONS.includes(
      candidate.workflowDirection as WorkflowDirection,
    )
      ? (candidate.workflowDirection as WorkflowDirection)
      : DEFAULT_PROJECT_SETTINGS.workflowDirection,
    freePositioning:
      typeof candidate.freePositioning === "boolean"
        ? candidate.freePositioning
        : DEFAULT_PROJECT_SETTINGS.freePositioning,
    liveRefresh:
      typeof candidate.liveRefresh === "boolean"
        ? candidate.liveRefresh
        : DEFAULT_PROJECT_SETTINGS.liveRefresh,
    gitAutoRefresh:
      typeof candidate.gitAutoRefresh === "boolean"
        ? candidate.gitAutoRefresh
        : DEFAULT_PROJECT_SETTINGS.gitAutoRefresh,
    confirmGitDiscard:
      typeof candidate.confirmGitDiscard === "boolean"
        ? candidate.confirmGitDiscard
        : DEFAULT_PROJECT_SETTINGS.confirmGitDiscard,
    newFileExtension: NEW_FILE_EXTENSIONS.includes(
      candidate.newFileExtension as NewFileExtension,
    )
      ? (candidate.newFileExtension as NewFileExtension)
      : DEFAULT_PROJECT_SETTINGS.newFileExtension,
  };
}

export function loadProjectSettings(rootPath: string): ProjectSettings {
  try {
    const stored = localStorage.getItem(projectSettingsKey(rootPath));
    return stored
      ? normalizeProjectSettings(JSON.parse(stored))
      : { ...DEFAULT_PROJECT_SETTINGS };
  } catch {
    return { ...DEFAULT_PROJECT_SETTINGS };
  }
}

export function saveProjectSettings(
  rootPath: string,
  settings: ProjectSettings,
) {
  const normalized = normalizeProjectSettings(settings);
  localStorage.setItem(projectSettingsKey(rootPath), JSON.stringify(normalized));
  return normalized;
}

export function clearProjectSettings(rootPath: string) {
  localStorage.removeItem(projectSettingsKey(rootPath));
  return { ...DEFAULT_PROJECT_SETTINGS };
}
