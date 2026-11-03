import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { fetchAllRows } from "@/lib/fetch-all";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/mercadologico")({ component: PaginaMercadologico });

interface No { id: string; nome: string; nivel: 1 | 2 | 3; pai_id: string | null; ml_category_id: string | null; ativo: boolean }
interface Pendente { categoria: string; subcategoria: string | null; itens: number }

const NIVEL = { 1: "Departamento", 2: "Categoria", 3: "Subcategoria" } as const;

/** Busca o caminho de uma categoria do ML (Departamento > … > Folha). */
async function caminhoML(id: string): Promise<{ id: string; nome: string }[]> {
  const { data, error } = await supabase.functions.invoke("ml-buscar", { body: { tipo: "categoria", valor: id } });
  if (error) throw error;
  return (data?.caminho ?? []) as { id: string; nome: string }[];
}

function PaginaMercadologico() {
  const { role } = useAuth();
  const podeEditar = role === "admin" || role === "gerente" || role === "estoquista";
  const [nos, setNos] = useState<No[] | null>(null);
  const [contagem, setContagem] = useState<Map<string, number>>(new Map());
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [montando, setMontando] = useState<{ feitos: number; total: number } | null>(null);
  const [novo, setNovo] = useState<{ pai: No | null; nome: string } | null>(null);
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);

  async function carregar() {
    const [n, p, pend] = await Promise.all([
      fetchAllRows<No>(() => supabase.from("mercadologico").select("*").order("nome")),
      fetchAllRows<{ mercadologico_id: string | null }>(() => supabase.from("produtos").select("mercadologico_id").not("mercadologico_id", "is", null)),
      supabase.rpc("categorias_pendentes"),
    ]);
    setNos(n);
    const c = new Map<string, number>();
    for (const x of p) if (x.mercadologico_id) c.set(x.mercadologico_id, (c.get(x.mercadologico_id) ?? 0) + 1);
    setContagem(c);
    setPendentes((pend.data ?? []) as Pendente[]);
  }
  useEffect(() => {
    carregar();
  }, []);

  const filhos = useMemo(() => {
    const m = new Map<string | null, No[]>();
    for (const n of nos ?? []) {
      const k = n.pai_id;
      m.set(k, [...(m.get(k) ?? []), n]);
    }
    return m;
  }, [nos]);

  // total de produtos do nó + descendentes
  const totalNo = (id: string): number => (contagem.get(id) ?? 0) + (filhos.get(id) ?? []).reduce((s, f) => s + totalNo(f.id), 0);

  async function montar() {
    if (pendentes.length === 0) return toast.info("Nada novo para montar: todos os itens já têm mercadológico.");
    setMontando({ feitos: 0, total: pendentes.length });
    let ok = 0;
    for (let i = 0; i < pendentes.length; i++) {
      const p = pendentes[i];
      try {
        let caminho: string[];
        let mlId: string | null = null;
        if (/^MLB\d+$/i.test(p.categoria)) {
          const c = await caminhoML(p.categoria);
          caminho = c.map((x) => x.nome);
          mlId = p.categoria.toUpperCase();
        } else {
          caminho = [p.categoria, p.subcategoria ?? ""].filter(Boolean);
        }
        const { data: mercId, error } = await supabase.rpc("garantir_mercadologico", { _caminho: caminho, _ml_id: mlId });
        if (error) throw error;
        if (mercId) {
          await supabase.rpc("vincular_mercadologico", { _categoria: p.categoria, _subcategoria: p.subcategoria, _merc_id: mercId });
          ok++;
        }
      } catch {
        /* segue para a próxima categoria */
      }
      setMontando({ feitos: i + 1, total: pendentes.length });
    }
    setMontando(null);
    toast.success(`${ok} categorias organizadas no mercadológico.`);
    carregar();
  }

  async function criar() {
    if (!novo?.nome.trim()) return;
    const nivel = novo.pai ? novo.pai.nivel + 1 : 1;
    const { error } = await supabase.from("mercadologico").insert({ nome: novo.nome.trim(), nivel, pai_id: novo.pai?.id ?? null });
    if (error) return toast.error(error.message.includes("duplicate") || error.message.includes("unico") ? "Já existe com esse nome aqui." : error.message);
    if (novo.pai) setAbertos((s) => new Set(s).add(novo.pai!.id));
    setNovo(null);
    carregar();
  }

  async function renomear() {
    if (!editando?.nome.trim()) return setEditando(null);
    const { error } = await supabase.from("mercadologico").update({ nome: editando.nome.trim() }).eq("id", editando.id);
    if (error) return toast.error(error.message);
    setEditando(null);
    carregar();
  }

  function Linha({ n }: { n: No }) {
    const fs = filhos.get(n.id) ?? [];
    const aberto = abertos.has(n.id);
    return (
      <div>
        <div className="group flex flex-wrap items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50" style={{ paddingLeft: `${(n.nivel - 1) * 22 + 8}px` }}>
          <button className="size-5" onClick={() => setAbertos((s) => { const x = new Set(s); x.has(n.id) ? x.delete(n.id) : x.add(n.id); return x; })} disabled={fs.length === 0}>
            {fs.length > 0 ? (aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />) : null}
          </button>
          {editando?.id === n.id ? (
            <Input autoFocus value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && renomear()} onBlur={renomear} className="h-7 flex-1" />
          ) : (
            <span className={cn("flex-1", n.nivel === 1 && "font-semibold")}>{n.nome}</span>
          )}
          <span className="text-[11px] text-muted-foreground">{NIVEL[n.nivel]}{n.ml_category_id ? ` · ${n.ml_category_id}` : ""}</span>
          <span className="w-20 text-right text-xs">{totalNo(n.id)} produtos</span>
          {podeEditar && (
            <span className="flex gap-1 sm:hidden sm:group-hover:flex">
              {n.nivel < 3 && <Button size="sm" variant="ghost" className="h-7" onClick={() => setNovo({ pai: n, nome: "" })}><Plus /> {NIVEL[(n.nivel + 1) as 2 | 3]}</Button>}
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditando({ id: n.id, nome: n.nome })}>Renomear</Button>
            </span>
          )}
        </div>
        {aberto && fs.map((f) => <Linha key={f.id} n={f} />)}
      </div>
    );
  }

  if (!nos) return <div className="p-6"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  const raiz = filhos.get(null) ?? [];

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Mercadológico</h1>
          <p className="text-sm text-muted-foreground">Departamento → Categoria → Subcategoria. Vem do Mercado Livre e das planilhas dos lotes.</p>
        </div>
        {podeEditar && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setNovo({ pai: null, nome: "" })}><Plus /> Departamento</Button>
            <Button onClick={montar} disabled={!!montando}>
              {montando ? <Loader2 className="animate-spin" /> : <Wand2 />} Montar automaticamente{pendentes.length ? ` (${pendentes.length})` : ""}
            </Button>
          </div>
        )}
      </div>
      {montando && (
        <Card className="p-3 space-y-1">
          <div className="text-sm">Organizando categorias… {montando.feitos}/{montando.total}</div>
          <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(montando.feitos / Math.max(1, montando.total)) * 100}%` }} /></div>
        </Card>
      )}
      {pendentes.length > 0 && !montando && (
        <p className="text-xs text-muted-foreground">
          {pendentes.length} categorias de lotes/produtos ainda sem mercadológico. Clique em <b>Montar automaticamente</b>: as do Mercado Livre vêm com a árvore completa; as da planilha usam Categoria e Subcategoria.
        </p>
      )}
      {novo && (
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm">Novo {NIVEL[(novo.pai ? novo.pai.nivel + 1 : 1) as 1 | 2 | 3].toLowerCase()} {novo.pai ? <>em <b>{novo.pai.nome}</b></> : null}</span>
          <Input autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && criar()} className="flex-1 min-w-48" />
          <Button onClick={criar}>Criar</Button>
          <Button variant="ghost" onClick={() => setNovo(null)}>Cancelar</Button>
        </Card>
      )}
      <Card className="p-2">
        {raiz.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Ainda vazio. Use "Montar automaticamente" depois de ter lotes com categorias.</p> : raiz.map((n) => <Linha key={n.id} n={n} />)}
      </Card>
    </div>
  );
}
