const EXTENSION_POLICY = Object.freeze({
  mode: "disabled",
  thirdPartyExtensions: false,
  inProcessExtensions: false,
  reason:
    "Third-party extensions are disabled until Divex has a dedicated, capability-scoped extension host.",
  isolationRequirements: Object.freeze([
    "separate process",
    "capability-scoped IPC",
    "per-extension storage",
    "resource and timeout limits",
    "explicit workspace permission grants",
  ]),
});

function extensionPolicyStatus() {
  return {
    ...EXTENSION_POLICY,
    isolationRequirements: [...EXTENSION_POLICY.isolationRequirements],
  };
}

function assertExtensionLoadingAllowed() {
  throw new Error(EXTENSION_POLICY.reason);
}

module.exports = {
  EXTENSION_POLICY,
  assertExtensionLoadingAllowed,
  extensionPolicyStatus,
};
