// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, Fragment, useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  anchoredScrollPosition,
  clampZoom,
  normalizeWheelDelta,
  stepZoom,
  useAnchoredZoom,
} from "./useAnchoredZoom";

afterEach(cleanup);

function ZoomHarness() {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { changeZoomByStep, handleControlWheel } = useAnchoredZoom({
    scrollRef,
    zoom,
    minZoom: 0.5,
    maxZoom: 1.8,
    onZoomChange: setZoom,
  });

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    viewport.addEventListener("wheel", handleControlWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleControlWheel);
  }, [handleControlWheel]);

  return createElement(
    Fragment,
    null,
    createElement("div", {
      ref: scrollRef,
      "data-testid": "viewport",
      "data-zoom": zoom,
    }),
    createElement(
      "button",
      { type: "button", onClick: () => changeZoomByStep(1) },
      "Zoom in",
    ),
  );
}

function prepareViewport() {
  const viewport = screen.getByTestId("viewport");
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: 400 },
    clientHeight: { configurable: true, value: 300 },
  });
  viewport.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      toJSON: () => ({}),
    }) as DOMRect;
  viewport.scrollLeft = 200;
  viewport.scrollTop = 100;
  return viewport;
}

describe("viewport zoom math", () => {
  it("changes zoom by exactly ten percentage points", () => {
    expect(stepZoom(1.4, 1, 0.55, 1.8)).toBe(1.5);
    expect(stepZoom(1.4, -1, 0.55, 1.8)).toBe(1.3);
  });

  it("clamps and rounds zoom values", () => {
    expect(clampZoom(1.899, 0.55, 1.8)).toBe(1.8);
    expect(clampZoom(0.499, 0.55, 1.8)).toBe(0.55);
    expect(clampZoom(1.2000000000002, 0.55, 1.8)).toBe(1.2);
  });

  it("keeps the anchored content coordinate at the same viewport point", () => {
    const next = anchoredScrollPosition({
      contentX: 600,
      contentY: 450,
      viewportX: 300,
      viewportY: 200,
      zoom: 1.5,
    });

    expect(next).toEqual({ left: 600, top: 475 });
    expect((next.left + 300) / 1.5).toBe(600);
    expect((next.top + 200) / 1.5).toBe(450);
  });

  it("normalizes line and page wheel deltas without exponential scaling", () => {
    expect(normalizeWheelDelta(3, 1, 800)).toBe(48);
    expect(normalizeWheelDelta(1, 2, 800)).toBe(800);
    expect(normalizeWheelDelta(12, 0, 800)).toBe(12);
  });

  it("anchors toolbar zoom to the center of the current viewport", () => {
    render(createElement(ZoomHarness));
    const viewport = prepareViewport();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(viewport.getAttribute("data-zoom")).toBe("1.1");
    expect(viewport.scrollLeft).toBeCloseTo(240);
    expect(viewport.scrollTop).toBeCloseTo(125);
  });

  it("anchors Ctrl+wheel zoom to the pointer in one 10% step", () => {
    render(createElement(ZoomHarness));
    const viewport = prepareViewport();

    fireEvent.wheel(viewport, {
      ctrlKey: true,
      clientX: 100,
      clientY: 75,
      deltaMode: 0,
      deltaY: 100,
    });

    expect(viewport.getAttribute("data-zoom")).toBe("0.9");
    expect(viewport.scrollLeft).toBeCloseTo(170);
    expect(viewport.scrollTop).toBeCloseTo(82.5);
    expect((viewport.scrollLeft + 100) / 0.9).toBeCloseTo(300);
    expect((viewport.scrollTop + 75) / 0.9).toBeCloseTo(175);
  });
});
