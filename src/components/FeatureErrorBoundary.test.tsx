// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeatureErrorBoundary } from "./FeatureErrorBoundary";

vi.mock("../app/crashReporting", () => ({
  createRendererErrorReport: vi.fn(() => ({
    source: "react-boundary",
    message: "Map exploded",
    route: "/",
    occurredAt: "2026-08-04T00:00:00.000Z",
  })),
  reloadRenderer: vi.fn(),
  reportRendererError: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function UnstableFeature({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Map exploded");
  return <div>Feature recovered</div>;
}

function RecoveryHarness() {
  const [shouldThrow, setShouldThrow] = useState(true);
  return (
    <FeatureErrorBoundary
      featureName="2D project map"
      resetKey="2d:project"
      recoveryActions={[
        {
          label: "Reset project map",
          onSelect: () => setShouldThrow(false),
        },
      ]}
    >
      <UnstableFeature shouldThrow={shouldThrow} />
    </FeatureErrorBoundary>
  );
}

describe("FeatureErrorBoundary", () => {
  it("contains a feature crash and offers safe recovery", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <FeatureErrorBoundary
        featureName="Logic map"
        resetKey="logic:project"
      >
        <UnstableFeature shouldThrow />
      </FeatureErrorBoundary>,
    );

    expect(screen.getByText("Crash contained")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Logic map stopped safely",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload in safe mode" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Map exploded")).toBeInTheDocument();
  });

  it("clears the failure before running a recovery action", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<RecoveryHarness />);

    fireEvent.click(
      screen.getByRole("button", { name: "Reset project map" }),
    );

    expect(screen.getByText("Feature recovered")).toBeInTheDocument();
    expect(screen.queryByText("Crash contained")).not.toBeInTheDocument();
  });
});
