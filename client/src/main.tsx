  import { createRoot } from "react-dom/client";
  import { Suspense } from "react";
  import App from "./App.tsx";
  import { ErrorBoundary } from "./components/ErrorBoundary";
  import { registerServiceWorker } from "./hooks/useWebPush";
  import "./i18n";
  import "./styles/globals.css";

  if ("serviceWorker" in navigator) {
    void registerServiceWorker();
  }

  function renderApp() {
    const rootElement = document.getElementById("root");
    if (!rootElement) {
      console.error("Root element not found");
      return;
    }
    createRoot(rootElement).render(
      <ErrorBoundary>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(renderApp, 0));
  } else {
    setTimeout(renderApp, 0);
  }
  