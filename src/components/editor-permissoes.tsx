// Tabela de permissões de um usuário (só o admin edita).
import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { MODULOS, type Acao, type LinhaPermissao, type Modulo } from "@/lib/permissoes";
import { Button } from "@/components/ui/button";

const ACOES: { id: Acao; nome: string }[] = [
  { id: "ver", nome: "Ver" }, { id: "inserir", nome: "Inserir" }, { id: "editar", nome: "Editar" }, { id: "excluir", nome: "Excluir" },
];

export function EditorPermissoes({ userId, papel }: { userId: string; papel: string | null }) {
  const [linhas, setLinhas] = useState<Record<Modulo, LinhaPermissao> | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    const { data } = await supabase.from("permissoes").select("modulo, ver, inserir, editar, excluir").eq("user_id", userId);
    const base = Object.fromEntries(MODULOS.map((m) => [m.id, { modulo: m.id, ver: true, inserir: true, editar: true, excluir: true }])) as Record<Modulo, LinhaPermissao>;
    for (const l of (data ?? []) as LinhaPermissao[]) base[l.modulo] = l;
    setLinhas(base);
  }
  useEffect(() => {
    carregar();
  }, [userId]);

  function alternar(m: Modulo, a: Acao) {
    setLinhas((x) => {
      if (!x) return x;
      const l = { ...x[m], [a]: !x[m][a] };
      // sem "ver", não faz sentido inserir/editar/excluir
      if (a === "ver" && !l.ver) Object.assign(l, { inserir: false, editar: false, excluir: false });
      if (a !== "ver" && l[a]) l.ver = true;
      return { ...x, [m]: l };
    });
  }

  async function salvar() {
    if (!linhas) return;
    setSalvando(true);
    const { error } = await supabase.from("permissoes").upsert(Object.values(linhas).map((l) => ({ ...l, user_id: userId, updated_at: new Date().toISOString() })));
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Permissões salvas. Valem no próximo acesso da pessoa (ou ao apertar F5).");
  }

  async function restaurar() {
    const { error } = await supabase.from("permissoes").delete().eq("user_id", userId);
    if (error) return toast.error(error.message);
    toast.success("Voltou ao padrão do perfil.");
    carregar();
  }

  if (papel === "admin") return <p className="text-xs text-muted-foreground">Admin sempre pode tudo.</p>;
  if (!linhas) return <Loader2 className="animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium">Permissões por área (além do perfil e das lojas dele)</div>
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Área</th>{ACOES.map((a) => <th key={a.id} className="p-2 text-center">{a.nome}</th>)}</tr></thead>
          <tbody>
            {MODULOS.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-2"><div className="font-medium">{m.nome}</div><div className="text-muted-foreground">{m.desc}</div></td>
                {ACOES.map((a) => (
                  <td key={a.id} className="p-2 text-center">
                    <input type="checkbox" className="size-4 accent-primary" checked={linhas[m.id][a.id]} onChange={() => alternar(m.id, a.id)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar permissões</Button>
        <Button type="button" size="sm" variant="ghost" onClick={restaurar}><RotateCcw /> Padrão do perfil</Button>
      </div>
      <p className="text-xs text-muted-foreground">O perfil (vendedor, estoquista…) continua limitando o que cada um acessa; aqui você restringe ainda mais. A regra vale no banco de dados.</p>
    </div>
  );
}
