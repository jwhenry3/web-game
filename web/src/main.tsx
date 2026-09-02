import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { bootstrapPlugins } from "./core/plugins/pluginHost";
import "./styles.css";

async function main() {
  await bootstrapPlugins();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

main().catch((err) => {
  console.error("bootstrap failed", err);
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `<div class="login-screen"><div class="xiv-window login-panel"><div class="xiv-body"><p class="subtitle">Failed to load game modules.</p></div></div></div>`;
  }
});
