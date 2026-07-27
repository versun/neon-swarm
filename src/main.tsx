import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import { TRPCProvider } from "@/providers/trpc"
import { I18nProvider } from "@/i18n";
import App from "./App.tsx";

// NOTE: no <StrictMode> — it double-runs canvas/effect setup (react-dev.md).
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <TRPCProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </TRPCProvider>
  </BrowserRouter>,
);
