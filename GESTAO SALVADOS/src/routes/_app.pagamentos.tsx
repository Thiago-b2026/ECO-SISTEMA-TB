import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/lib/loja";
import { lerNumero } from "@/lib/precificacao";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/pagamentos")({ component: PaginaPagamentos });

interface Forma { id: string; nome: string; tipo: string; ordem: number; ativo: boolean }
interface Meio {
  id: string; forma_id: string; nome: string; taxa_percentual: number; taxa_fixa: number; dias_recebimento: number;
  conta_bancaria_id: string | null; loja_id: string | null; ativo: boolean;
}
interface Conta { id: string; nome: string; loja_id: string }

const TIPOS = [
  ["dinheiro", "Dinheiro (entra na gaveta)"], ["pix", "Pix"], ["debito", "Cartão de débito"], ["credito", "Cartão de crédito"], ["outro", "Outro (vale, boleto…)"],
] as const;
const MEIO_VAZIO = { nome: "", taxa: "", fixa: "", dias: "", conta: "", loja: "" };

function PaginaPagamentos() {
  const { lojas } = useLoja();
  const [formas, setFormas] = useState<Forma[] | null>(null);
  const [meios, setMeios] = useState<Meio[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [novaForma, setNovaForma] = useState({ nome: "", tipo: "outro" });
  const [novoMeio, setNovoMeio] = useState<Record<string, typeof MEIO_VAZIO>>({});

  async function carregar() {
    const [f, m, c] = await Promise.all([
      supabase.from("formas_pagamento").select("*").order("ordem"),
      supabase.from("meios_pagamento").select("*").order("nome"),
      supabase.from("contas_bancarias").select("id, nome, loja_id").eq("ativo", true).order("nome"),
    ]);
    if (f.error) return toast.error(f.error.message);
    setFormas((f.data ?? []) as Forma[]);
    setMeios((m.data ?? []) as Meio[]);
    setContas((c.data ?? []) as Conta[]);
  }
  useEffect(() => {
    carregar();
  }, []);

  async function criarForma() {
    if (!novaForma.nome.trim()) return;
    const { error } = await supabase.from("formas_pagamento").insert({ nome: novaForma.nome.trim(), tipo: novaForma.tipo, ordem: (formas?.length ?? 0) + 1 });
    if (error) return toast.error(error.message.includes("duplicate") ? "Já existe uma forma com esse nome." : error.message);
    setNovaForma({ nome: "", tipo: "outro" });
    carregar();
  }

  async function alternar(tabela: "formas_pagamento" | "meios_pagamento", id: string, ativo: boolean) {
    const { error } = await supabase.from(tabela).update({ ativo: !ativo }).eq("id", id);
    if (error) return toast.error(error.message);
    carregar();
  }

  async function criarMeio(formaId: string) {
    const m = novoMeio[formaId];
    if (!m?.nome?.trim()) return toast.error("Dê um nome ao meio (ex.: Stone Visa).");
    const { error } = await supabase.from("meios_pagamento").insert({
      forma_id: formaId, nome: m.nome.trim(), taxa_percentual: lerNumero(m.taxa) ?? 0, taxa_fixa: lerNumero(m.fixa) ?? 0,
      dias_recebimento: Math.max(0, Math.round(lerNumero(m.dias) ?? 0)), conta_bancaria_id: m.conta || null, loja_id: m.loja || null,
    });
    if (error) return toast.error(error.message.includes("duplicate") ? "Já existe esse meio nesta forma." : error.message);
    setNovoMeio((x) => ({ ...x, [formaId]: { ...MEIO_VAZIO } }));
    carregar();
  }

  const nomeLoja = (id: string | null) => (id ? lojas.find((l) => l.id === id)?.nome ?? "outra loja" : "todas as lojas");
  const nomeConta = (id: string | null) => contas.find((c) => c.id === id)?.nome;

  if (!formas) return <div className="p-6"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Formas e meios de pagamento</h1>
        <p className="text-sm text-muted-foreground">
          <b>Forma</b> é como o cliente paga (aparece no PDV). <b>Meio</b> é por onde o dinheiro entra (maquininha, bandeira, banco), com taxa e prazo, usado no financeiro.
        </p>
      </div>

      <Card className="p-4 space-y-2">
        <div className="font-semibold text-sm">Nova forma de pagamento</div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-40"><Label className="text-xs">Nome</Label><Input value={novaForma.nome} onChange={(e) => setNovaForma({ ...novaForma, nome: e.target.value })} placeholder="Ex.: Vale-troca" /></div>
          <div>
            <Label className="text-xs">Funciona como</Label>
            <select value={novaForma.tipo} onChange={(e) => setNovaForma({ ...novaForma, tipo: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
              {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <Button onClick={criarForma}><Plus /> Criar</Button>
        </div>
      </Card>

      {formas.map((f) => {
        const ms = meios.filter((m) => m.forma_id === f.id);
        const nm = novoMeio[f.id] ?? MEIO_VAZIO;
        const setNm = (k: keyof typeof MEIO_VAZIO, v: string) => setNovoMeio((x) => ({ ...x, [f.id]: { ...nm, [k]: v } }));
        return (
          <Card key={f.id} className={`p-4 space-y-3 ${f.ativo ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold">{f.nome}</div>
              <Badge variant="outline">{TIPOS.find((t) => t[0] === f.tipo)?.[1] ?? f.tipo}</Badge>
              {!f.ativo && <Badge variant="destructive">Desativada</Badge>}
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => alternar("formas_pagamento", f.id, f.ativo)}>{f.ativo ? "Desativar" : "Reativar"}</Button>
            </div>
            {ms.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-1 pr-2">Meio</th><th className="py-1 pr-2 text-right">Taxa</th><th className="py-1 pr-2 text-right">Recebe em</th><th className="py-1 pr-2">Conta</th><th className="py-1 pr-2">Loja</th><th></th></tr></thead>
                  <tbody>
                    {ms.map((m) => (
                      <tr key={m.id} className={`border-b last:border-0 ${m.ativo ? "" : "opacity-50"}`}>
                        <td className="py-1.5 pr-2 font-medium">{m.nome}</td>
                        <td className="py-1.5 pr-2 text-right">{Number(m.taxa_percentual)}%{Number(m.taxa_fixa) > 0 ? ` + R$ ${Number(m.taxa_fixa).toFixed(2)}` : ""}</td>
                        <td className="py-1.5 pr-2 text-right">{m.dias_recebimento === 0 ? "na hora" : `${m.dias_recebimento} dia(s)`}</td>
                        <td className="py-1.5 pr-2">{nomeConta(m.conta_bancaria_id) ?? "—"}</td>
                        <td className="py-1.5 pr-2 text-xs">{nomeLoja(m.loja_id)}</td>
                        <td className="py-1.5 text-right"><Button size="sm" variant="ghost" onClick={() => alternar("meios_pagamento", m.id, m.ativo)}>{m.ativo ? "Desativar" : "Reativar"}</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {f.tipo !== "dinheiro" && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-7 items-end">
                <div className="col-span-2"><Label className="text-xs">Novo meio</Label><Input value={nm.nome} onChange={(e) => setNm("nome", e.target.value)} placeholder="Ex.: Stone Visa" /></div>
                <div><Label className="text-xs">Taxa %</Label><Input value={nm.taxa} onChange={(e) => setNm("taxa", e.target.value)} placeholder="1,99" /></div>
                <div><Label className="text-xs">Recebe em (dias)</Label><Input value={nm.dias} onChange={(e) => setNm("dias", e.target.value)} placeholder="30" /></div>
                <div>
                  <Label className="text-xs">Conta</Label>
                  <select value={nm.conta} onChange={(e) => setNm("conta", e.target.value)} className="h-9 w-full rounded-md border bg-background px-1 text-sm">
                    <option value="">—</option>
                    {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Loja</Label>
                  <select value={nm.loja} onChange={(e) => setNm("loja", e.target.value)} className="h-9 w-full rounded-md border bg-background px-1 text-sm">
                    <option value="">Todas</option>
                    {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </div>
                <Button onClick={() => criarMeio(f.id)}><Plus /> Adicionar</Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
