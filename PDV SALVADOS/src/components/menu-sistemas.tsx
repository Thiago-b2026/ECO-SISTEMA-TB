// Item "Sistemas" do menu: lista só os sistemas do Ecossistema TB em que o usuário tem
// pelo menos uma tela (public.meus_sistemas()), com link para cada um (mesmo login).
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, LayoutGrid } from "lucide-react";
import { usePermissoes } from "@/lib/permissoes";
import { SISTEMA_ATUAL } from "@/lib/telas";
import { cn } from "@/lib/utils";

function Lista({ className, onEscolher }: { className?: string; onEscolher?: () => void }) {
  const { sistemas } = usePermissoes();
  return (
    <div className={className}>
      {sistemas.map((s) =>
        s.codigo === SISTEMA_ATUAL || !s.url ? (
          <div key={s.codigo} className="flex items-center gap-2 rounded px-3 py-2 text-[13px] opacity-70">
            <LayoutGrid className="size-4" /> {s.nome} {s.codigo === SISTEMA_ATUAL && <span className="text-[10px]">(você está aqui)</span>}
          </div>
        ) : (
          <a
            key={s.codigo}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onEscolher}
            className="flex items-center gap-2 rounded px-3 py-2 text-[13px] hover:bg-muted/60"
            title={`Abrir ${s.nome} em outra aba (mesmo login)`}
          >
            <ExternalLink className="size-4" /> {s.nome}
          </a>
        ),
      )}
    </div>
  );
}

/** Versão do menu lateral (visual clássico). */
export function MenuSistemasLateral({ onEscolher }: { onEscolher?: () => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div>
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-sidebar-accent"
      >
        <LayoutGrid className="size-5" />
        <span className="flex-1 text-left">Sistemas</span>
        <ChevronDown className={cn("size-4 transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && <Lista className="space-y-0.5 pl-6" onEscolher={onEscolher} />}
    </div>
  );
}

/** Versão do menu no topo (visual ERP). */
export function MenuSistemasTopo() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto((v) => !v)} className="flex items-center gap-1 rounded px-2.5 py-1.5 hover:bg-muted">
        Sistemas <ChevronDown className="size-3.5" />
      </button>
      {aberto && <Lista className="absolute left-0 top-full mt-1 w-64 rounded-md border bg-card p-1 shadow-lg" onEscolher={() => setAberto(false)} />}
    </div>
  );
}

/** Versão do menu do celular. */
export function MenuSistemasMobile() {
  return (
    <div className="border-t pt-1">
      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sistemas</div>
      <Lista />
    </div>
  );
}
