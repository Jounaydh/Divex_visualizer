import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import {
  installGlobalCrashReporting,
  reloadRenderer,
} from "./app/crashReporting";
import { FeatureErrorBoundary } from "./components/FeatureErrorBoundary";
import "./styles.css";
import "./styles/three-d-visualizer.css";

const platform =
  window.divex?.platform ??
  (navigator.platform.toLowerCase().includes("mac") ? "darwin" : "browser");
document.documentElement.dataset.platform = platform;

const safeMode =
  new URLSearchParams(window.location.search).get("safeMode") === "1";
const rendererMode =
  new URLSearchParams(window.location.search).get("mode") ?? "workspace";
const MiniApp = lazy(() => import("./mini/MiniApp"));
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
      {rendererMode === "mini" ? (
        <Suspense fallback={<div className="app-loading">Opening Divex Mini…</div>}>
          <MiniApp />
        </Suspense>
      ) : (
        <App safeMode={safeMode} />
      )}
    </FeatureErrorBoundary>
  </StrictMode>,
);
