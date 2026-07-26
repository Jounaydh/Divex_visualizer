import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./styles/visualizer-toolbar.css";
import "./styles/two-d-visualizer.css";

const platform =
  window.divex?.platform ??
  (navigator.platform.toLowerCase().includes("mac") ? "darwin" : "browser");
document.documentElement.dataset.platform = platform;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
