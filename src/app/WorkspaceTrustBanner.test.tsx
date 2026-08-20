// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceTrustBanner } from "./WorkspaceTrustBanner";

afterEach(cleanup);

describe("WorkspaceTrustBanner", () => {
  it("explains restricted mode and offers an explicit trust action", () => {
    const onTrust = vi.fn();

    render(
      <WorkspaceTrustBanner
        projectName="Kader"
        busy={false}
        onTrust={onTrust}
      />,
    );

    expect(screen.getByRole("region", { name: "Restricted Mode" }))
      .toHaveTextContent("Kader can be explored and edited");
    fireEvent.click(screen.getByRole("button", { name: "Trust this folder" }));
    expect(onTrust).toHaveBeenCalledOnce();
  });

  it("prevents duplicate trust requests while persistence is busy", () => {
    render(
      <WorkspaceTrustBanner
        projectName="Kader"
        busy
        onTrust={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Updating…" })).toBeDisabled();
  });
});
