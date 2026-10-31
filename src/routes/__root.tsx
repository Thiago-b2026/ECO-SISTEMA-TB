import { Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import type { AuthState } from "@/lib/auth";

export interface RouterContext {
  auth: AuthState;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      <Toaster richColors position="top-right" />
    </>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-4 text-center">
      <div>
        <h1 className="text-6xl font-bold">404</h1>
        <p className="text-muted-foreground mt-2">Página não encontrada</p>
        <Link to="/" className="text-primary underline mt-4 inline-block">
          Voltar ao início
        </Link>
      </div>
    </div>
  ),
});
