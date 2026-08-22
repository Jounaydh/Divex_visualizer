// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";
import { DEFAULT_PROJECT_SETTINGS } from "./projectSettings";

afterEach(cleanup);

describe("ProjectSettingsDialog", () => {
  it("saves workspace and Git preferences together", () => {
    const onSave = vi.fn();
    render(
      <ProjectSettingsDialog
        open
        projectName="demo"
        settings={DEFAULT_PROJECT_SETTINGS}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("Default project view"), {
      target: { value: "logic" },
    });
    fireEvent.change(screen.getByLabelText("Default new file extension"), {
      target: { value: "py" },
    });
    fireEvent.click(screen.getByLabelText(/Refresh Git on focus/));
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultView: "logic",
        newFileExtension: "py",
        gitAutoRefresh: false,
      }),
    );
  });
});
