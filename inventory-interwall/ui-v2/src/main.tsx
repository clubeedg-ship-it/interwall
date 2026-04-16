import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { PreferencesProvider } from "./hooks/usePreferences";
import { DraftCountProvider } from "./hooks/useDraftCount";
import { ToastProvider } from "./hooks/useToast";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <PreferencesProvider>
          <ToastProvider>
            <DraftCountProvider>
              <App />
            </DraftCountProvider>
          </ToastProvider>
        </PreferencesProvider>
      </AuthProvider>
    </HashRouter>
  </StrictMode>
);
