import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { compararCodigo, proximoCodigo, type ContaPlano } from "@/lib/plano-contas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/plano-contas")({ component: PaginaPlano });

function PaginaPlano() {
  const [contas, setContas] = useState<ContaPlano[] | null>(null);
  const [novo, setNovo] = useState<{ pai: ContaPlano | null; nome: string; tipo: "receita" | "despesa" } | null>(null);
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);

  async function carregar() {
    const { data, error } = await supabase.from("plano_contas").select("*");
    if (error) return toast.error(error.message);
    setContas(((data ?? []) as ContaPlano[]).sort((a, b) => compararCodigo(a.codigo, b.codigo)));
  }
  useEffect(() => {
    carregar();
  }, []);

  async function salvarNovo() {
    if (!novo || !novo.nome.trim() || !contas) return;
    const codigo = proximoCodigo(novo.pai, contas);
    const { error } = await supabase.from("plano_contas").insert({ codigo, nome: novo.nome.trim(), tipo: novo.pai?.tipo ?? novo.tipo, pai_id: novo.pai?.id ?? null });
    if (error) return toast.error(error.message);
    toast.success(`Conta ${codigo} criada.`);
    setNovo(null);
    carregar();
  }

  async function renomear() {
    if (!editando?.nome.trim()) return setEditando(null);
    const { error } = await supabase.from("plano_contas").update({ nome: editando.nome.trim() }).eq("id", editando.id);
    if (error) return toast.error(error.message);
    setEditando(null);
    carregar();
  }

  async function alternar(c: ContaPlano) {
    const { error } = await supabase.from("plano_contas").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) return toast.error(error.message);
    carregar();
  }

  if (!contas) return <div className="p-6"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Plano de contas</h1>
          <p className="text-sm text-muted-foreground">Receitas e despesas em níveis. Passe o mouse numa linha para criar subconta, renomear ou desativar.</p>
        </div>
        <Button variant="outline" onClick={() => setNovo({ pai: null, nome: "", tipo: "despesa" })}><Plus /> Grupo principal</Button>
      </div>

      {novo && (
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">Nova conta em <b>{novo.pai ? `${novo.pai.codigo} ${novo.pai.nome}` : "nível principal"}</b> · código {proximoCodigo(novo.pai, contas)}</span>
          <Input autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && salvarNovo()} placeholder="Nome da conta" className="flex-1 min-w-48" />
          {!novo.pai && (
            <select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as "receita" | "despesa" })} className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="receita">Receita</option><option value="despesa">Despesa</option>
            </select>
          )}
          <Button onClick={salvarNovo}>Criar</Button>
          <Button variant="ghost" onClick={() => setNovo(null)}>Cancelar</Button>
        </Card>
      )}

      <Card className="p-2">
        {contas.map((c) => {
          const nivel = c.codigo.split(".").length;
          return (
            <div key={c.id} className={cn("group flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50", !c.ativo && "opacity-50")} style={{ paddingLeft: `${(nivel - 1) * 20 + 8}px` }}>
              <span className={cn("w-16 shrink-0 font-mono text-xs", nivel === 1 && "font-bold")}>{c.codigo}</span>
              {editando?.id === c.id ? (
                <Input autoFocus value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && renomear()} onBlur={renomear} className="h-7 flex-1" />
              ) : (
                <span className={cn("flex-1", nivel === 1 && "font-semibold")}>{c.nome}</span>
              )}
              <span className={cn("text-[11px] rounded px-1.5", c.tipo === "receita" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive")}>{c.tipo}</span>
              <span className="flex gap-1 sm:hidden sm:group-hover:flex">
                {nivel < 4 && <Button size="sm" variant="ghost" className="h-7" onClick={() => setNovo({ pai: c, nome: "", tipo: c.tipo })}><Plus /> Subconta</Button>}
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditando({ id: c.id, nome: c.nome })}>Renomear</Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => alternar(c)}>{c.ativo ? "Desativar" : "Reativar"}</Button>
              </span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
