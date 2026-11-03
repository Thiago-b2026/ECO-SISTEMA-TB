import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { fetchAllRows } from "@/lib/fetch-all";
import { FORMA_LABEL } from "@/lib/caixa";
import { fmtBRL, fmtDate } from "@/lib/format";
import { formatLocalDateInput, localDateRangeToIso } from "@/lib/sale-datetime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { imprimirComprovanteDaVenda } from "@/lib/comprovante";
import { Exportar } from "@/components/exportar";
import { usePermissoes } from "@/lib/permissoes";

import { Printer } from "lucide-react";

export const Route = createFileRoute("/_app/vendas")({ component: PaginaVendas });

interface Venda {
  id: string;
  numero: number;
  loja_id: string;
  vendedor_nome: string | null;
  total: number;
  desconto: number;
  status: "finalizada" | "cancelada";
  origem: "pdv" | "legado";
  data_venda: string;
  data_suspeita: boolean;
  motivo_data_suspeita: string | null;
  motivo_cancelamento: string | null;
  venda_pagamentos: { forma: string; valor: number; troco: number }[];
}
interface ItemVenda {
  id: string;
  descricao: string;
  quantidade: number;
  preco_unit: number;
  desconto: number;
  total: number;
}

function PaginaVendas() {
  const { role } = useAuth();
  const { filtroLoja, lojas } = useLoja();
  const gestor = role === "admin" || role === "gerente";
  const { podeAcao } = usePermissoes();
  const hoje = formatLocalDateInput();
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [soSuspeitas, setSoSuspeitas] = useState(false);
  const [vendas, setVendas] = useState<Venda[] | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [aba, setAba] = useState<"vendas" | "avulsas" | "nfe" | "nfce">("vendas");
  const [itens, setItens] = useState<Record<string, ItemVenda[]>>({});

  async function carregar() {
    setVendas(null);
    try {
      const ini = localDateRangeToIso(de).start;
      const fim = localDateRangeToIso(ate).end;
      const vs = await fetchAllRows<Venda>(() => {
        let q = supabase.from("vendas").select("*, venda_pagamentos(forma, valor, troco)").gte("data_venda", ini).lte("data_venda", fim).order("data_venda", { ascending: false });
        if (filtroLoja) q = q.eq("loja_id", filtroLoja);
        if (soSuspeitas) q = q.eq("data_suspeita", true);
        return q;
      });
      setVendas(vs);
    } catch (e) {
      toast.error((e as Error).message);
      setVendas([]);
    }
  }
  useEffect(() => {
    carregar();
  }, [filtroLoja, de, ate, soSuspeitas]);

  async function abrir(v: Venda) {
    if (aberta === v.id) return setAberta(null);
    setAberta(v.id);
    if (!itens[v.id]) {
      const { data } = await supabase.from("venda_itens").select("id, descricao, quantidade, preco_unit, desconto, total").eq("venda_id", v.id);
      setItens((x) => ({ ...x, [v.id]: (data ?? []) as ItemVenda[] }));
    }
  }

  async function cancelar(v: Venda) {
    const motivo = window.prompt(`Cancelar a venda nº ${v.numero} (${fmtBRL(Number(v.total))})? O estoque volta. Informe o motivo:`)?.trim();
    if (!motivo) return;
    const { error } = await supabase.rpc("cancelar_venda", { _venda_id: v.id, _motivo: motivo });
    if (error) return toast.error(error.message);
    toast.success(`Venda nº ${v.numero} cancelada.`);
    carregar();
  }

  const finalizadas = (vendas ?? []).filter((v) => v.status === "finalizada");
  const total = finalizadas.reduce((s, v) => s + Number(v.total), 0);
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "";

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Vendas e notas</h1>
        <p className="text-sm text-muted-foreground">{finalizadas.length} vendas · {fmtBRL(total)} · ticket {finalizadas.length ? fmtBRL(total / finalizadas.length) : "—"}</p>
      </div>
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {([["vendas", "Vendas (cupom não fiscal)"], ["avulsas", "Notas avulsas"], ["nfe", "Notas fiscais (NF-e)"], ["nfce", "Cupons fiscais (NFC-e)"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={aba === k ? "default" : "ghost"} onClick={() => setAba(k)}>{l}</Button>
        ))}
      </div>
      {aba !== "vendas" ? (
        <Card className="p-6 space-y-2 text-sm">
          <div className="font-semibold">{aba === "avulsas" ? "Notas avulsas" : aba === "nfe" ? "Notas fiscais eletrônicas (NF-e)" : "Cupons fiscais (NFC-e)"} — em construção</div>
          <p className="text-muted-foreground">Entra junto com a emissão fiscal (Focus NFe ou Nuvem Fiscal). Antes disso: preencher o CNPJ, IE e regime de cada loja (Lojas e configurações) e o NCM dos produtos.</p>
        </Card>
      ) : <>
      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div><label className="text-xs">De</label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><label className="text-xs">Até</label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <Button size="sm" variant="outline" onClick={() => { setDe(hoje); setAte(hoje); }}>Hoje</Button>
        <Button size="sm" variant="outline" onClick={() => { setDe(hoje.slice(0, 8) + "01"); setAte(hoje); }}>Este mês</Button>
        <label className="flex items-center gap-2 text-sm ml-2"><input type="checkbox" checked={soSuspeitas} onChange={(e) => setSoSuspeitas(e.target.checked)} className="size-4 accent-primary" /> Só data suspeita</label>
        <div className="ml-auto">
          <Exportar titulo="Vendas" subtitulo={`${filtroLoja ? nomeLoja(filtroLoja) : "Todas as lojas"} · ${de} a ${ate}`}
            colunas={[{ titulo: "Nº", numero: true }, { titulo: "Data" }, { titulo: "Loja" }, { titulo: "Vendedor" }, { titulo: "Pagamento" }, { titulo: "Total (R$)", numero: true }, { titulo: "Situação" }, { titulo: "Origem" }, { titulo: "Data suspeita" }]}
            linhas={() => (vendas ?? []).map((v) => [v.numero, fmtDate(v.data_venda), nomeLoja(v.loja_id), v.vendedor_nome ?? "", v.venda_pagamentos.map((p) => FORMA_LABEL[p.forma] ?? p.forma).join(" + "), Number(v.total), v.status, v.origem === "legado" ? "Sistema antigo" : "PDV", v.data_suspeita ? "sim" : ""])} />
        </div>
      </Card>
      <Card className="p-4">
        {vendas == null ? <Loader2 className="animate-spin text-muted-foreground" /> : vendas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Nº</th><th className="py-2 pr-2">Data</th>{!filtroLoja && <th className="py-2 pr-2">Loja</th>}<th className="py-2 pr-2">Vendedor</th><th className="py-2 pr-2">Pagamento</th><th className="py-2 pr-2 text-right">Total</th><th className="py-2 pr-2">Situação</th><th></th></tr></thead>
              <tbody>
                {vendas.map((v) => (
                  <Fragment key={v.id}>
                    <tr key={v.id} className={cn("border-b", v.status === "cancelada" && "opacity-60")}>
                      <td className="py-2 pr-2 font-medium">{v.numero}</td>
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {fmtDate(v.data_venda)}
                        {v.data_suspeita && <span title={v.motivo_data_suspeita ?? ""} className="ml-1 inline-flex items-center text-warning"><AlertTriangle className="size-3.5" /></span>}
                      </td>
                      {!filtroLoja && <td className="py-2 pr-2 text-xs">{nomeLoja(v.loja_id)}</td>}
                      <td className="py-2 pr-2">{v.vendedor_nome ?? "—"}</td>
                      <td className="py-2 pr-2 text-xs">{v.venda_pagamentos.map((p) => FORMA_LABEL[p.forma] ?? p.forma).join(" + ")}</td>
                      <td className="py-2 pr-2 text-right font-semibold whitespace-nowrap">{fmtBRL(Number(v.total))}</td>
                      <td className="py-2 pr-2">
                        <div className="flex gap-1">
                          {v.status === "cancelada" ? <Badge variant="destructive">Cancelada</Badge> : <Badge variant="outline">Finalizada</Badge>}
                          {v.origem === "legado" && <Badge variant="secondary">Sistema antigo</Badge>}
                        </div>
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        <Button size="icon" variant="ghost" title="Comprovante" onClick={async () => { const e = await imprimirComprovanteDaVenda(v.id, nomeLoja(v.loja_id)); if (e) toast.error(e); }}><Printer /></Button>
                        <Button size="icon" variant="ghost" onClick={() => abrir(v)}>{aberta === v.id ? <ChevronUp /> : <ChevronDown />}</Button>
                        {gestor && podeAcao("vendas.cancelar") && v.status === "finalizada" && v.origem === "pdv" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancelar(v)}>Cancelar</Button>}
                      </td>
                    </tr>
                    {aberta === v.id && (
                      <tr key={v.id + "-itens"} className="border-b bg-muted/30">
                        <td colSpan={8} className="p-3 text-sm">
                          {(itens[v.id] ?? []).map((i) => (
                            <div key={i.id} className="flex justify-between gap-2">
                              <span>{Number(i.quantidade)} × {i.descricao}{Number(i.desconto) > 0 ? ` (desc. ${fmtBRL(Number(i.desconto))})` : ""}</span>
                              <span>{fmtBRL(Number(i.total))}</span>
                            </div>
                          ))}
                          {v.motivo_cancelamento && <div className="mt-2 text-destructive">Motivo do cancelamento: {v.motivo_cancelamento}</div>}
                          {v.data_suspeita && <div className="mt-2 text-xs text-muted-foreground">Data suspeita: {v.motivo_data_suspeita === "antes_do_sistema" ? "anterior ao início do sistema" : "posterior ao dia em que foi lançada"}</div>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </>}
    </div>
  );
}
