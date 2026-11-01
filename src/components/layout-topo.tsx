// Visual "ERP": claro, compacto, menu no topo com submenus (Cadastros / Movimento).
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, LogOut, Menu, Store, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { NAV } from "@/lib/nav";
import { TODAS, useLoja } from "@/lib/loja";
import { cn } from "@/lib/utils";

export function LayoutTopo() {
  const { role, profile, signOut } = useAuth();
  const { lojas, lojaAtual, setLojaAtual } = useLoja();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [aberto, setAberto] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const barra = useRef<HTMLDivElement>(null);
  const itens = NAV.filter((n) => role && n.roles.includes(role) && !n.oculto);
  const ativo = (to: string) => pathname === to || pathname.startsWith(to + "/");

  // fecha o submenu ao clicar fora ou ao trocar de tela
  useEffect(() => {
    const f = (e: MouseEvent) => { if (barra.current && !barra.current.contains(e.target as Node)) setAberto(null); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  useEffect(() => { setAberto(null); setMobile(false); }, [pathname]);

  const grupos = ["Cadastros", "Movimento"] as const;
  const soltos = itens.filter((i) => !i.grupo);
  const doGrupo = (g: string) => itens.filter((i) => i.grupo === g);
  // ordem: Dashboard, PDV, [Cadastros], Lotes, [Movimento], resto
  const ordem: ({ tipo: "item"; to: string } | { tipo: "grupo"; nome: (typeof grupos)[number] })[] = [];
  for (const n of itens) {
    if (!n.grupo) ordem.push({ tipo: "item", to: n.to });
    else if (!ordem.some((o) => o.tipo === "grupo" && o.nome === n.grupo)) ordem.push({ tipo: "grupo", nome: n.grupo });
  }

  const seletor = lojas.length > 0 && (
    <label className="flex items-center gap-1 text-xs">
      <Building2 className="size-3.5 text-muted-foreground" />
      <select value={lojaAtual} onChange={(e) => setLojaAtual(e.target.value)} className="h-8 rounded border bg-background px-1 text-xs">
        {role === "admin" && <option value={TODAS}>Todas as lojas</option>}
        {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
    </label>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-card shadow-sm" ref={barra}>
        <div className="flex h-12 items-center gap-3 px-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-bold text-primary"><Store className="size-5" /> Eco Sistema TB</Link>
          <nav className="hidden lg:flex items-center gap-0.5 text-sm">
            {ordem.map((o) => {
              if (o.tipo === "item") {
                const n = soltos.find((x) => x.to === o.to)!;
                return (
                  <Link key={n.to} to={n.to} className={cn("rounded px-2.5 py-1.5 hover:bg-muted", ativo(n.to) && "bg-primary/10 text-primary font-semibold")}>
                    {n.label.replace("PDV · ", "")}
                  </Link>
                );
              }
              const filhos = doGrupo(o.nome);
              const algumAtivo = filhos.some((f) => ativo(f.to));
              return (
                <div key={o.nome} className="relative">
                  <button onClick={() => setAberto(aberto === o.nome ? null : o.nome)} className={cn("flex items-center gap-1 rounded px-2.5 py-1.5 hover:bg-muted", algumAtivo && "bg-primary/10 text-primary font-semibold")}>
                    {o.nome} <ChevronDown className="size-3.5" />
                  </button>
                  {aberto === o.nome && (
                    <div className="absolute left-0 top-full mt-1 w-64 rounded-md border bg-card p-1 shadow-lg">
                      {filhos.map((f) => (
                        <Link key={f.to} to={f.to} className={cn("flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted", ativo(f.to) && "text-primary font-semibold")}>
                          <f.icon className="size-4" /> {f.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          <div className="ml-auto hidden sm:flex items-center gap-3">
            {seletor}
            <Link to="/conta" className="text-xs hover:underline" title="Minha conta">{profile?.nome}</Link>
            <button onClick={signOut} className="text-muted-foreground hover:text-foreground" title="Sair"><LogOut className="size-4" /></button>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setMobile((v) => !v)} aria-label="Menu">{mobile ? <X /> : <Menu />}</button>
        </div>
        {mobile && (
          <div className="lg:hidden border-t bg-card p-2 space-y-1 max-h-[75vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2 p-1 sm:hidden">{seletor}<button onClick={signOut} className="text-xs flex items-center gap-1"><LogOut className="size-3.5" /> Sair</button></div>
            {itens.map((n) => (
              <Link key={n.to} to={n.to} className={cn("flex items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted", ativo(n.to) && "bg-primary/10 text-primary font-semibold")}>
                <n.icon className="size-4" /> {n.grupo ? `${n.grupo} · ` : ""}{n.label}
              </Link>
            ))}
          </div>
        )}
      </header>
      <main><Outlet /></main>
    </div>
  );
}
