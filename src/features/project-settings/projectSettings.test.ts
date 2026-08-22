// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_SETTINGS,
  loadProjectSettings,
  normalizeProjectSettings,
  projectSettingsKey,
  saveProjectSettings,
} from "./projectSettings";

beforeEach(() => localStorage.clear());

describe("project settings", () => {
  it("keeps settings isolated by project root", () => {
    saveProjectSettings("C:\\work\\one", {
      ...DEFAULT_PROJECT_SETTINGS,
      defaultView: "logic",
      newFileExtension: "py",
    });

    expect(loadProjectSettings("C:\\work\\one")).toMatchObject({
      defaultView: "logic",
      newFileExtension: "py",
    });
    expect(loadProjectSettings("C:\\work\\two")).toEqual(
      DEFAULT_PROJECT_SETTINGS,
    );
  });

  it("recovers safely from corrupt or unsupported stored values", () => {
    localStorage.setItem(projectSettingsKey("/project"), "not-json");
    expect(loadProjectSettings("/project")).toEqual(DEFAULT_PROJECT_SETTINGS);
    expect(
      normalizeProjectSettings({
        defaultView: "invalid",
        workflowDirection: "diagonal",
        newFileExtension: "exe",
        liveRefresh: false,
      }),
    ).toMatchObject({
      defaultView: "2d",
      workflowDirection: "top-down",
      newFileExtension: "txt",
      liveRefresh: false,
    });
  });
});
