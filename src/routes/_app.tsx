import { Link, Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Menu, Store } from "lucide-react";
import { useAuth, homeRouteFor } from "@/lib/auth";
import { NAV, canAccess } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Layout protegido: exige login, perfil e permissão para a tela pedida. */
export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => {
    const { user, role } = context.auth;
    if (!user) throw redirect({ to: "/login" });
    if (!role) throw redirect({ to: "/sem-acesso" });
    if (!canAccess(location.pathname, role)) throw redirect({ to: homeRouteFor(role) });
  },
  component: AppShell,
});

const ROLE_LABEL = { admin: "Admin", gerente: "Gerente", vendedor: "Vendedor", estoquista: "Estoquista" } as const;

function AppShell() {
  const { role, profile, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => role && n.roles.includes(role));

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={cn(
          "fixed lg:sticky lg:top-0 lg:h-screen inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="px-5 py-5 flex items-center gap-3 border-b border-sidebar-border">
          <div className="size-10 rounded-lg bg-sidebar-primary grid place-items-center">
            <Store className="size-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">Eco Sistema TB</div>
            <div className="text-xs opacity-70">Gestão de salvados</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-auto">
          {items.map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
                )}
              >
                <n.icon className="size-5" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 text-xs opacity-80">
            <div className="font-semibold truncate">{profile?.nome}</div>
            <div className="truncate">{profile?.email}</div>
            {role && (
              <div className="mt-1 inline-block px-2 py-0.5 rounded bg-sidebar-accent uppercase tracking-wide">
                {ROLE_LABEL[role]}
              </div>
            )}
          </div>
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={signOut}>
            <LogOut className="size-4 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden h-14 border-b flex items-center px-4 gap-3 bg-card sticky top-0 z-20">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu />
          </Button>
          <span className="font-semibold">Eco Sistema TB</span>
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
