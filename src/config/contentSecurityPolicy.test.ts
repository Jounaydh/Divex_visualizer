import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./contentSecurityPolicy";

describe("renderer content security policy", () => {
  it("blocks undeclared content and unsafe script execution in production", () => {
    const policy = contentSecurityPolicy(false);
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("https:");
    expect(policy).not.toContain("http://localhost");
  });

  it("allows only the local Vite connection during development", () => {
    const policy = contentSecurityPolicy(true);
    expect(policy).toContain(
      "connect-src 'self' http://localhost:5173 ws://localhost:5173",
    );
    expect(policy).not.toContain("'unsafe-eval'");
  });
});
