import { Link, Outlet, createFileRoute, redirect, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, ChevronDown, FolderOpen, LogOut, Menu, Repeat, Store } from "lucide-react";
import { LojaProvider, TODAS, useLoja } from "@/lib/loja";
import { useVisual } from "@/lib/visual";
import { LayoutTopo } from "@/components/layout-topo";
import { PermissoesProvider, usePermissoes } from "@/lib/permissoes";
import { EscolherEmpresa } from "@/components/escolher-empresa";

/** Visual escolhido em Minha conta: clássico (menu lateral) ou ERP (menu no topo). */
function EscolhaVisual() {
  const visual = useVisual();
  const { precisaEscolher } = useLoja();
  if (precisaEscolher) return <EscolherEmpresa />;
  return <PermissoesProvider>{visual === "erp" ? <LayoutTopo /> : <AppShell />}</PermissoesProvider>;
}
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
  component: () => (
    <LojaProvider>
      <EscolhaVisual />
    </LojaProvider>
  ),
});

/** Seletor da loja atual (filiais). Admin também pode ver "Todas as lojas". */
function SeletorLoja() {
  const { role } = useAuth();
  const { lojas, lojaAtual, setLojaAtual } = useLoja();
  if (lojas.length === 0) return null;
  if (role !== "admin") {
    const l = lojas.find((x) => x.id === lojaAtual) ?? lojas[0];
    return <div className="px-5 py-2 text-xs opacity-80 border-b border-sidebar-border">Empresa: <b>{l.nome}</b></div>;
  }
  if (lojas.length === 1 && role !== "admin") {
    return <div className="px-5 py-2 text-xs opacity-80 border-b border-sidebar-border">Loja: <b>{lojas[0].nome}</b></div>;
  }
  return (
    <div className="px-3 py-2 border-b border-sidebar-border">
      <label className="flex items-center gap-2 text-xs opacity-80 px-2 mb-1">
        <Building2 className="size-3.5" /> Loja atual
      </label>
      <select
        value={lojaAtual}
        onChange={(e) => setLojaAtual(e.target.value)}
        className="w-full h-9 rounded-md bg-sidebar-accent text-sidebar-foreground px-2 text-sm border border-sidebar-border"
      >
        {role === "admin" && <option value={TODAS}>Todas as lojas</option>}
        {lojas.map((l) => (
          <option key={l.id} value={l.id}>{l.nome}</option>
        ))}
      </select>
    </div>
  );
}

const ROLE_LABEL = { admin: "Admin", gerente: "Gerente", vendedor: "Vendedor", estoquista: "Estoquista" } as const;

function AppShell() {
  const { role, profile, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { pode } = usePermissoes();
  const items = NAV.filter((n) => role && n.roles.includes(role) && !n.oculto && (!n.modulo || pode(n.modulo)));
  const ativo = (to: string) => pathname === to || pathname.startsWith(to + "/");
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  // Monta o menu: itens soltos e grupos (na ordem em que aparecem)
  const blocos: ({ tipo: "item"; item: (typeof items)[number] } | { tipo: "grupo"; nome: string; itens: typeof items })[] = [];
  for (const it of items) {
    if (!it.grupo) blocos.push({ tipo: "item", item: it });
    else {
      const g = blocos.find((b) => b.tipo === "grupo" && b.nome === it.grupo) as { tipo: "grupo"; nome: string; itens: typeof items } | undefined;
      if (g) g.itens.push(it);
      else blocos.push({ tipo: "grupo", nome: it.grupo, itens: [it] });
    }
  }
  const link = (n: (typeof items)[number], sub = false) => (
    <Link
      key={n.to}
      to={n.to}
      onClick={() => setOpen(false)}
      className={cn(
        "flex items-center gap-3 rounded-lg font-medium transition-colors",
        sub ? "px-3 py-2 pl-9 text-[13px]" : "px-3 py-2.5 text-sm",
        ativo(n.to) ? "bg-sidebar-primary text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
      )}
    >
      <n.icon className={sub ? "size-4" : "size-5"} />
      {n.label}
    </Link>
  );

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
        <SeletorLoja />
        <nav className="flex-1 p-3 space-y-1 overflow-auto">
          {blocos.map((b) => {
            if (b.tipo === "item") return link(b.item);
            const aberto = abertos[b.nome] ?? b.itens.some((i) => ativo(i.to));
            return (
              <div key={b.nome}>
                <button
                  onClick={() => setAbertos((x) => ({ ...x, [b.nome]: !aberto }))}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-sidebar-accent"
                >
                  {b.nome === "Cadastros" ? <FolderOpen className="size-5" /> : <Repeat className="size-5" />}
                  <span className="flex-1 text-left">{b.nome}</span>
                  <ChevronDown className={cn("size-4 transition-transform", aberto && "rotate-180")} />
                </button>
                {aberto && <div className="space-y-0.5">{b.itens.map((i) => link(i, true))}</div>}
              </div>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 text-xs opacity-80">
            <Link to="/conta" onClick={() => setOpen(false)} className="font-semibold truncate block hover:underline" title="Minha conta (nome e senha)">{profile?.nome}</Link>
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
