// Liga os nomes de vendedores do sistema antigo (histórico importado) aos usuários novos.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fmtBRL } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Legado {
  vendedor_nome: string;
  vendas: number;
  total: number;
  vendedor_id: string | null;
}

export function VendedorasLegado({ usuarios }: { usuarios: { id: string; nome: string }[] }) {
  const [lista, setLista] = useState<Legado[]>([]);
  const [escolha, setEscolha] = useState<Record<string, string>>({});

  async function carregar() {
    const { data, error } = await supabase.rpc("vendedores_legado");
    if (error) return;
    const ls = (data ?? []) as Legado[];
    setLista(ls);
    // sugere o usuário com o mesmo nome
    const sug: Record<string, string> = {};
    for (const l of ls) {
      const igual = usuarios.find((u) => u.nome.trim().toLowerCase() === l.vendedor_nome.trim().toLowerCase());
      sug[l.vendedor_nome] = l.vendedor_id ?? igual?.id ?? "";
    }
    setEscolha(sug);
  }
  useEffect(() => {
    carregar();
  }, [usuarios.length]);

  async function ligar(nome: string) {
    const uid = escolha[nome];
    if (!uid) return toast.error("Escolha o usuário.");
    const { data, error } = await supabase.rpc("vincular_vendedor_legado", { _nome: nome, _user_id: uid });
    if (error) return toast.error(error.message);
    toast.success(`${data} vendas antigas de ${nome} ligadas ao usuário.`);
    carregar();
  }

  if (lista.length === 0) return null;
  return (
    <Card className="p-4 space-y-2">
      <h2 className="font-semibold">Vendedores do sistema antigo</h2>
      <p className="text-xs text-muted-foreground">Crie a conta da pessoa acima e ligue aqui, para as vendas antigas contarem no nome dela.</p>
      {lista.map((l) => (
        <div key={l.vendedor_nome} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-32 font-medium">{l.vendedor_nome}</span>
          <span className="w-44 text-xs text-muted-foreground">{l.vendas} vendas · {fmtBRL(Number(l.total))}</span>
          <select value={escolha[l.vendedor_nome] ?? ""} onChange={(e) => setEscolha((x) => ({ ...x, [l.vendedor_nome]: e.target.value }))} className="h-8 rounded border bg-background px-1 text-sm">
            <option value="">Escolha o usuário…</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
          <Button size="sm" variant={l.vendedor_id ? "outline" : "default"} onClick={() => ligar(l.vendedor_nome)}>{l.vendedor_id ? "Religar" : "Ligar"}</Button>
          {l.vendedor_id && <span className="text-xs text-success">ligado ✓</span>}
        </div>
      ))}
    </Card>
  );
}
