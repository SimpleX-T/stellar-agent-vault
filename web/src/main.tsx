import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import "./index.css";

// The Stellar SDK (and our contract layer) use Node's Buffer, which the browser
// doesn't provide. Polyfill it globally before anything imports the SDK.
if (!(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}
import App from "./App.tsx";
import { initAnalytics } from "./lib/analytics";
import { initMonitoring, ErrorBoundary } from "./lib/monitoring";
import { CrashFallback } from "./components/CrashFallback";

// Boot observability before the app renders so early errors are captured too.
initMonitoring();
initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary fallback={({ resetError }) => <CrashFallback onReset={resetError} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
