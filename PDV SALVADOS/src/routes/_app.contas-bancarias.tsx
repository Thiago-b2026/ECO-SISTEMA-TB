import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/lib/loja";
import { fmtBRL, fmtDateOnly } from "@/lib/format";
import { lerNumero } from "@/lib/precificacao";
import { formatLocalDateInput } from "@/lib/sale-datetime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/contas-bancarias")({ component: PaginaContas });

interface Conta {
  id: string; loja_id: string; nome: string; tipo: string; banco_codigo: string | null; banco_nome: string | null;
  agencia: string | null; conta: string | null; pix_chave: string | null; saldo_inicial: number; data_saldo: string; ativo: boolean;
}
const TIPOS: Record<string, string> = { corrente: "Conta corrente", poupanca: "Poupança", pagamento: "Conta de pagamento (maquininha/digital)", caixa: "Caixa / cofre da loja" };

function PaginaContas() {
  const { lojas, filtroLoja } = useLoja();
  const [contas, setContas] = useState<Conta[] | null>(null);
  const vazio = { loja_id: filtroLoja ?? lojas[0]?.id ?? "", nome: "", tipo: "corrente", banco_codigo: "", banco_nome: "", agencia: "", conta: "", pix_chave: "", saldo: "", data: formatLocalDateInput() };
  const [f, setF] = useState(vazio);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    let q = supabase.from("contas_bancarias").select("*").order("nome");
    if (filtroLoja) q = q.eq("loja_id", filtroLoja);
    const { data, error } = await q;
    if (error) return toast.error(error.message);
    setContas((data ?? []) as Conta[]);
  }
  useEffect(() => {
    carregar();
    setF((x) => ({ ...x, loja_id: filtroLoja ?? x.loja_id ?? lojas[0]?.id ?? "" }));
  }, [filtroLoja, lojas.length]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.loja_id || !f.nome.trim()) return toast.error("Informe a loja e um nome para a conta.");
    setSalvando(true);
    const { error } = await supabase.from("contas_bancarias").insert({
      loja_id: f.loja_id, nome: f.nome.trim(), tipo: f.tipo, banco_codigo: f.banco_codigo || null, banco_nome: f.banco_nome || null,
      agencia: f.agencia || null, conta: f.conta || null, pix_chave: f.pix_chave || null, saldo_inicial: lerNumero(f.saldo) ?? 0, data_saldo: f.data,
    });
    setSalvando(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "Já existe uma conta com esse nome nesta loja." : error.message);
    toast.success("Conta cadastrada.");
    setF({ ...vazio, loja_id: f.loja_id });
    carregar();
  }

  async function alternar(c: Conta) {
    const { error } = await supabase.from("contas_bancarias").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) return toast.error(error.message);
    carregar();
  }

  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "";

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Contas bancárias</h1>
        <p className="text-sm text-muted-foreground">Bancos, contas digitais da maquininha e o caixa/cofre de cada loja. O saldo inicial é o ponto de partida do financeiro.</p>
      </div>
      <Card className="p-4">
        <form onSubmit={criar} className="grid gap-2 sm:grid-cols-4 items-end">
          <div>
            <Label className="text-xs">Loja</Label>
            <select value={f.loja_id} onChange={(e) => set("loja_id", e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><Label className="text-xs">Nome da conta</Label><Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Itaú Matriz" /></div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {Object.entries(TIPOS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Cód. banco</Label><Input value={f.banco_codigo} onChange={(e) => set("banco_codigo", e.target.value)} placeholder="341" /></div>
          <div><Label className="text-xs">Banco</Label><Input value={f.banco_nome} onChange={(e) => set("banco_nome", e.target.value)} placeholder="Itaú" /></div>
          <div><Label className="text-xs">Agência</Label><Input value={f.agencia} onChange={(e) => set("agencia", e.target.value)} /></div>
          <div><Label className="text-xs">Conta</Label><Input value={f.conta} onChange={(e) => set("conta", e.target.value)} /></div>
          <div className="sm:col-span-2"><Label className="text-xs">Chave Pix</Label><Input value={f.pix_chave} onChange={(e) => set("pix_chave", e.target.value)} /></div>
          <div><Label className="text-xs">Saldo inicial (R$)</Label><Input value={f.saldo} onChange={(e) => set("saldo", e.target.value)} placeholder="0,00" /></div>
          <div><Label className="text-xs">Saldo na data</Label><Input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} /></div>
          <Button type="submit" disabled={salvando} className="sm:col-span-4 sm:w-fit">{salvando ? <Loader2 className="animate-spin" /> : <Plus />} Cadastrar conta</Button>
        </form>
      </Card>
      <Card className="p-4">
        {!contas ? <Loader2 className="animate-spin text-muted-foreground" /> : contas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Conta</th>{!filtroLoja && <th className="py-2 pr-2">Loja</th>}<th className="py-2 pr-2">Banco / agência / conta</th><th className="py-2 pr-2 text-right">Saldo inicial</th><th></th></tr></thead>
              <tbody>
                {contas.map((c) => (
                  <tr key={c.id} className={`border-b last:border-0 ${c.ativo ? "" : "opacity-50"}`}>
                    <td className="py-2 pr-2"><div className="font-medium">{c.nome}</div><div className="text-xs text-muted-foreground">{TIPOS[c.tipo]}{c.pix_chave ? ` · Pix ${c.pix_chave}` : ""}</div></td>
                    {!filtroLoja && <td className="py-2 pr-2 text-xs">{nomeLoja(c.loja_id)}</td>}
                    <td className="py-2 pr-2 text-xs">{[c.banco_codigo && `${c.banco_codigo} ${c.banco_nome ?? ""}`, c.agencia && `ag. ${c.agencia}`, c.conta && `c/c ${c.conta}`].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="py-2 pr-2 text-right whitespace-nowrap">{fmtBRL(Number(c.saldo_inicial))}<div className="text-xs text-muted-foreground">em {fmtDateOnly(c.data_saldo + "T12:00:00")}</div></td>
                    <td className="py-2 text-right"><Button size="sm" variant="ghost" onClick={() => alternar(c)}>{c.ativo ? "Desativar" : "Reativar"}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
