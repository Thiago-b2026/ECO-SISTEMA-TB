// Seção "Sistemas e telas" do editor de permissões, em 3 níveis:
//   SISTEMA (checkbox do sistema inteiro, estado parcial, abre/fecha)
//   → GRUPO (checkbox do grupo inteiro, estado parcial)
//   → TELA  (um checkbox por tela)
// Com busca e "Marcar tudo" / "Desmarcar tudo".
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LayoutGrid, Search } from "lucide-react";
import {
  GRUPOS, SISTEMAS_EDITAVEIS, TELAS, TELAS_EDITAVEIS, estadoGrupo, estadoSistema,
  type CodigoSistema, type EstadoMarcacao, type MapaTelas,
} from "@/lib/telas";
import { cn } from "@/lib/utils";

function CaixaMarcar({ estado, onChange, label }: { estado: EstadoMarcacao; onChange: (v: boolean) => void; label: string }) {
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
      className="size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
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
  const somenteAdmin = TELAS.filter((t) => t.somenteAdmin).map((t) => t.nome);

  // Árvore filtrada pela busca (nome da tela, do grupo ou do sistema)
  const arvore = useMemo(
    () =>
      SISTEMAS_EDITAVEIS.map((s) => ({
        ...s,
        grupos: GRUPOS.filter((g) => g.sistema === s.codigo)
          .sort((a, b) => a.ordem - b.ordem)
          .map((g) => ({
            ...g,
            telas: TELAS_EDITAVEIS.filter(
              (t) => t.sistema === s.codigo && t.grupo === g.codigo &&
                (!termo || t.nome.toLowerCase().includes(termo) || g.nome.toLowerCase().includes(termo) || s.nome.toLowerCase().includes(termo)),
            ),
          }))
          .filter((g) => g.telas.length > 0),
      })).filter((s) => s.grupos.length > 0),
    [termo],
  );

  const marcar = (filtro: (t: (typeof TELAS_EDITAVEIS)[number]) => boolean, v: boolean) =>
    onChange((m) => { for (const t of TELAS_EDITAVEIS) if (filtro(t)) m[t.codigo] = v; });
  const doSistema = (s: CodigoSistema) => TELAS_EDITAVEIS.filter((t) => t.sistema === s);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <LayoutGrid className="size-4 text-primary" /> Sistemas e telas que ele pode abrir
          <span className="font-normal text-muted-foreground">({marcadas} de {total} telas)</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tela…" className="h-8 w-44 rounded-md border bg-background pl-7 pr-2 text-xs" />
          </div>
          <button type="button" onClick={() => marcar(() => true, true)} className="rounded border px-2 py-1 text-xs hover:bg-muted">Marcar tudo</button>
          <button type="button" onClick={() => marcar(() => true, false)} className="rounded border px-2 py-1 text-xs hover:bg-muted">Desmarcar tudo</button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tela desmarcada não aparece no menu e mostra "Acesso negado". Sistema sem nenhuma tela marcada não aparece para ele.
        Exclusivas do Admin (sem checkbox): {somenteAdmin.join(", ")}.
      </p>

      {arvore.length === 0 ? (
        <p className="rounded-lg border p-4 text-center text-xs text-muted-foreground">Nenhuma tela com "{busca}".</p>
      ) : (
        <div className="space-y-2">
          {arvore.map((s) => {
            const est = estadoSistema(telas, s.codigo);
            const aberto = termo ? true : !fechados[s.codigo];
            const on = doSistema(s.codigo).filter((t) => telas[t.codigo]).length;
            return (
              <div key={s.codigo} className={cn("rounded-lg border", est !== "nenhum" && "border-primary/50")}>
                {/* Nível 1: SISTEMA */}
                <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                  <CaixaMarcar estado={est} onChange={(v) => marcar((t) => t.sistema === s.codigo, v)} label={`Sistema ${s.nome} inteiro`} />
                  <button type="button" onClick={() => setFechados((f) => ({ ...f, [s.codigo]: aberto }))} className="flex flex-1 items-center justify-between text-left">
                    <span className="text-sm font-semibold">{s.nome}</span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {on}/{doSistema(s.codigo).length} telas
                      <ChevronDown className={cn("size-4 transition-transform", aberto && "rotate-180")} />
                    </span>
                  </button>
                </div>
                {aberto && (
                  <div className="grid gap-2 p-2 sm:grid-cols-2">
                    {s.grupos.map((g) => {
                      const eg = estadoGrupo(telas, s.codigo, g.codigo);
                      return (
                        <div key={g.codigo} className={cn("rounded-md border", eg !== "nenhum" && "border-primary/30")}>
                          {/* Nível 2: GRUPO */}
                          <label className="flex cursor-pointer items-center gap-2 border-b bg-muted/20 px-3 py-1.5">
                            <CaixaMarcar estado={eg} onChange={(v) => marcar((t) => t.sistema === s.codigo && t.grupo === g.codigo, v)} label={`Grupo ${g.nome} inteiro`} />
                            <span className="flex-1 text-[12px] font-semibold uppercase tracking-wide">{g.nome}</span>
                          </label>
                          {/* Nível 3: TELAS */}
                          {g.telas.map((t) => (
                            <label key={t.codigo} className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/30">
                              <input type="checkbox" checked={!!telas[t.codigo]} onChange={(e) => marcar((x) => x.codigo === t.codigo, e.target.checked)} className="size-4 cursor-pointer accent-[var(--primary)]" />
                              <span className="flex-1">{t.nome}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
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
