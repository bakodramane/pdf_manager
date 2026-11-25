import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n/I18nProvider";
import "./index.css";
import { registerServiceWorker } from "./pwa";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);

// Web edition: offline support (no effect in the desktop app or in dev).
void registerServiceWorker().catch(() => undefined);
