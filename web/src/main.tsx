import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
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
