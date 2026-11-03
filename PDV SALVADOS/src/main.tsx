import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { AuthProvider, useAuth } from "@/lib/auth";
import "./styles.css";

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  // Preenchido pelo <App> com o estado real de login antes da primeira navegação
  context: { auth: undefined! },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  const auth = useAuth();
  // Reavalia as proteções de rota quando o login ou o perfil mudam.
  // Só depois que o auth terminou de carregar (antes disso o router ainda não tem o contexto).
  useEffect(() => {
    if (auth.loading) return;
    router.update({ ...router.options, context: { auth } });
    router.invalidate();
  }, [auth.loading, auth.user?.id, auth.role]);
  if (auth.loading) {
    return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;
  }
  return <RouterProvider router={router} context={{ auth }} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
