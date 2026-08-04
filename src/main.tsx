import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import {
  installGlobalCrashReporting,
  reloadRenderer,
} from "./app/crashReporting";
import { FeatureErrorBoundary } from "./components/FeatureErrorBoundary";
import "./styles.css";

const safeMode =
  new URLSearchParams(window.location.search).get("safeMode") === "1";
installGlobalCrashReporting();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FeatureErrorBoundary
      featureName="Divex workspace"
      resetKey={window.location.href}
      recoveryMessage="Divex caught an application error before it could repeatedly crash the desktop window."
      recoveryActions={[
        {
          label: "Reload normally",
          onSelect: () => reloadRenderer(false),
        },
      ]}
    >
      <App safeMode={safeMode} />
    </FeatureErrorBoundary>
  </StrictMode>,
);
