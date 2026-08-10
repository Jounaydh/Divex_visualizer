// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useNavigationHistory } from "./useNavigationHistory";

describe("useNavigationHistory", () => {
  it("moves backward and forward without duplicating locations", () => {
    const { result } = renderHook(() =>
      useNavigationHistory<{ id: string }>((location) => location.id),
    );

    act(() => {
      result.current.visit({ id: "first" });
      result.current.visit({ id: "second" });
      result.current.visit({ id: "second" });
    });
    expect(result.current.canGoBack).toBe(true);

    let previous: { id: string } | null = null;
    act(() => {
      previous = result.current.back();
    });
    expect(previous).toEqual({ id: "first" });
    expect(result.current.canGoForward).toBe(true);

    let next: { id: string } | null = null;
    act(() => {
      next = result.current.forward();
    });
    expect(next).toEqual({ id: "second" });
  });
});
