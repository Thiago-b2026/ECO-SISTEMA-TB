// Seção "Telas" do editor de permissões: um checkbox por tela, agrupado por módulo,
// checkbox do módulo inteiro (com estado parcial), marcar/desmarcar tudo e busca.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LayoutGrid, Search } from "lucide-react";
import { MODULOS_TELA, TELAS, TELAS_EDITAVEIS, estadoModulo, type MapaTelas, type ModuloTela } from "@/lib/telas";
import { cn } from "@/lib/utils";

function CaixaMarcar({ estado, onChange, label }: { estado: "todos" | "nenhum" | "parcial"; onChange: (v: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = estado === "parcial";
  }, [estado]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      title={label}
      checked={estado === "todos"}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 cursor-pointer accent-[var(--primary)]"
    />
  );
}

export function SecaoTelas({ telas, onChange, avisos }: {
  telas: MapaTelas;
  onChange: (fn: (m: MapaTelas) => void) => void;
  avisos: string[];
}) {
  const [busca, setBusca] = useState("");
  const [fechados, setFechados] = useState<Record<string, boolean>>({});
  const termo = busca.trim().toLowerCase();
  const total = TELAS_EDITAVEIS.length;
  const marcadas = TELAS_EDITAVEIS.filter((t) => telas[t.codigo]).length;
  const somenteAdmin = TELAS.filter((t) => t.somenteAdmin).map((t) => t.nome).join(" e ");

  const grupos = useMemo(
    () =>
      MODULOS_TELA.map((m) => ({
        ...m,
        telas: TELAS_EDITAVEIS.filter((t) => t.modulo === m.id && (!termo || t.nome.toLowerCase().includes(termo) || m.nome.toLowerCase().includes(termo))),
      })).filter((g) => g.telas.length > 0),
    [termo],
  );

  const todas = (v: boolean) => onChange((m) => { for (const t of TELAS_EDITAVEIS) m[t.codigo] = v; });
  const modulo = (id: ModuloTela, v: boolean) => onChange((m) => { for (const t of TELAS_EDITAVEIS) if (t.modulo === id) m[t.codigo] = v; });
  const uma = (codigo: string, v: boolean) => onChange((m) => { m[codigo] = v; });

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <LayoutGrid className="size-4 text-primary" /> Telas que ele pode abrir
          <span className="font-normal text-muted-foreground">({marcadas} de {total})</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tela…" className="h-8 w-44 rounded-md border bg-background pl-7 pr-2 text-xs" />
          </div>
          <button type="button" onClick={() => todas(true)} className="rounded border px-2 py-1 text-xs hover:bg-muted">Marcar tudo</button>
          <button type="button" onClick={() => todas(false)} className="rounded border px-2 py-1 text-xs hover:bg-muted">Desmarcar tudo</button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tela desmarcada não aparece no menu e mostra "Acesso negado". {somenteAdmin} são exclusivas do Admin.
      </p>

      {grupos.length === 0 ? (
        <p className="rounded-lg border p-4 text-center text-xs text-muted-foreground">Nenhuma tela com "{busca}".</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {grupos.map((g) => {
            const est = estadoModulo(telas, g.id);
            const aberto = termo ? true : !fechados[g.id];
            const on = TELAS_EDITAVEIS.filter((t) => t.modulo === g.id && telas[t.codigo]).length;
            const tot = TELAS_EDITAVEIS.filter((t) => t.modulo === g.id).length;
            return (
              <div key={g.id} className={cn("rounded-lg border", est !== "nenhum" && "border-primary/40")}>
                <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                  <CaixaMarcar estado={est} onChange={(v) => modulo(g.id, v)} label={`Módulo ${g.nome} inteiro`} />
                  <button type="button" onClick={() => setFechados((f) => ({ ...f, [g.id]: aberto }))} className="flex flex-1 items-center justify-between text-left">
                    <span className="text-[12px] font-semibold uppercase tracking-wide">{g.nome}</span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {on}/{tot}
                      <ChevronDown className={cn("size-3.5 transition-transform", aberto && "rotate-180")} />
                    </span>
                  </button>
                </div>
                {aberto && g.telas.map((t) => (
                  <label key={t.codigo} className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/30">
                    <input type="checkbox" checked={!!telas[t.codigo]} onChange={(e) => uma(t.codigo, e.target.checked)} className="size-4 cursor-pointer accent-[var(--primary)]" />
                    <span className="flex-1">{t.nome}</span>
                    {t.app === "rh" && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">outro site</span>}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {avisos.map((a) => (
        <p key={a} className="rounded-md bg-warning/15 p-2 text-xs">{a}</p>
      ))}
    </section>
  );
}
