import { describe, expect, it } from "vitest";

const {
  assertExtensionLoadingAllowed,
  extensionPolicyStatus,
} = require("./extension-policy.cjs") as {
  assertExtensionLoadingAllowed: () => never;
  extensionPolicyStatus: () => {
    mode: string;
    thirdPartyExtensions: boolean;
    inProcessExtensions: boolean;
    isolationRequirements: string[];
  };
};

describe("extension security policy", () => {
  it("keeps all third-party and in-process extensions disabled", () => {
    const policy = extensionPolicyStatus();
    expect(policy.mode).toBe("disabled");
    expect(policy.thirdPartyExtensions).toBe(false);
    expect(policy.inProcessExtensions).toBe(false);
    expect(policy.isolationRequirements).toContain("separate process");
    expect(() => assertExtensionLoadingAllowed()).toThrow(
      /dedicated, capability-scoped extension host/i,
    );
  });
});
