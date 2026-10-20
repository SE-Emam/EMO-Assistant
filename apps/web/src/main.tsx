import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import "./styles/index.css";
import { initTheme } from "./lib/theme";
import { I18nProvider, initLanguage } from "./lib/i18n";
import { App } from "./App";
import { SessionProvider } from "./hooks/session";
import { ToastProvider } from "./hooks/toast";
import { ApiError } from "./lib/api";

initTheme();
initLanguage();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
      <BrowserRouter>
        <ToastProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ToastProvider>
      </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
