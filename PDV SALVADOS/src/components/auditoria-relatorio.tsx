// Auditoria: quem inseriu, alterou ou excluiu o quê (só admin vê).
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/lib/loja";
import { fmtDate } from "@/lib/format";
import { localDateRangeToIso, formatLocalDateInput } from "@/lib/sale-datetime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Exportar } from "@/components/exportar";
import { cn } from "@/lib/utils";

interface Registro {
  id: number; quando: string; user_id: string | null; usuario: string | null; loja_id: string | null; tabela: string;
  registro_id: string | null; acao: "inserir" | "alterar" | "excluir"; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null; campos: string[] | null;
}

const TABELAS: Record<string, string> = {
  pessoas: "Cadastro de pessoa", produtos: "Produto", lotes: "Lote", lote_itens: "Item de lote", pallets: "Pallet", vendas: "Venda",
  caixas: "Caixa", caixa_movimentos: "Sangria/suprimento", lancamentos: "Financeiro", contas_bancarias: "Conta bancária",
  formas_pagamento: "Forma de pagamento", meios_pagamento: "Meio de pagamento", plano_contas: "Plano de contas", lojas: "Loja",
  usuario_lojas: "Loja do usuário", user_roles: "Perfil de acesso", profiles: "Usuário", permissoes: "Permissões", crm_campanhas: "Campanha",
  crm_pedidos: "Pedido WhatsApp", crm_listas: "Lista CRM", modelos_etiqueta: "Modelo de etiqueta", config_precificacao: "Arredondamento",
  transferencias: "Transferência", mercadologico: "Mercadológico",
};
const ACAO = { inserir: "Inseriu", alterar: "Alterou", excluir: "Excluiu" } as const;

/** Nome legível do registro (título, nome, descrição, número…). */
function rotulo(r: Registro): string {
  const o = (r.depois ?? r.antes ?? {}) as Record<string, unknown>;
  const v = o.titulo ?? o.nome ?? o.descricao ?? (o.numero != null ? `nº ${o.numero}` : null) ?? o.codigo ?? o.sku ?? r.registro_id;
  return String(v ?? "");
}
const curto = (v: unknown) => {
  if (v == null) return "—";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
};

export function AuditoriaRelatorio({ lojaId }: { lojaId: string | null }) {
  const { lojas } = useLoja();
  const hoje = formatLocalDateInput();
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [usuario, setUsuario] = useState("");
  const [tabela, setTabela] = useState("");
  const [acao, setAcao] = useState("");
  const [regs, setRegs] = useState<Registro[] | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);

  useEffect(() => {
    setRegs(null);
    let q = supabase.from("auditoria").select("*")
      .gte("quando", localDateRangeToIso(de).start).lte("quando", localDateRangeToIso(ate).end)
      .order("quando", { ascending: false }).limit(1000);
    if (tabela) q = q.eq("tabela", tabela);
    if (acao) q = q.eq("acao", acao);
    if (lojaId) q = q.or(`loja_id.eq.${lojaId},loja_id.is.null`);
    q.then(({ data, error }) => {
      if (error) return toast.error(error.message);
      setRegs((data ?? []) as Registro[]);
    });
  }, [de, ate, tabela, acao, lojaId]);

  const usuarios = useMemo(() => [...new Set((regs ?? []).map((r) => r.usuario ?? "sistema"))].sort(), [regs]);
  const lista = (regs ?? []).filter((r) => !usuario || (r.usuario ?? "sistema") === usuario);
  const nomeLoja = (id: string | null) => (id ? lojas.find((l) => l.id === id)?.nome ?? "" : "");

  return (
    <div className="space-y-3">
      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div><label className="text-xs">De</label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div><label className="text-xs">Até</label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
        <div>
          <label className="text-xs">Usuário</label>
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Todos</option>{usuarios.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs">O quê</label>
          <select value={tabela} onChange={(e) => setTabela(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Tudo</option>{Object.entries(TABELAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs">Ação</label>
          <select value={acao} onChange={(e) => setAcao(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Todas</option><option value="inserir">Inseriu</option><option value="alterar">Alterou</option><option value="excluir">Excluiu</option>
          </select>
        </div>
        <div className="ml-auto">
          <Exportar titulo="Auditoria" subtitulo={`${de} a ${ate}`}
            colunas={[{ titulo: "Quando" }, { titulo: "Usuário" }, { titulo: "Loja" }, { titulo: "Ação" }, { titulo: "O quê" }, { titulo: "Registro" }, { titulo: "Campos alterados" }]}
            linhas={() => lista.map((r) => [fmtDate(r.quando), r.usuario ?? "sistema", nomeLoja(r.loja_id), ACAO[r.acao], TABELAS[r.tabela] ?? r.tabela, rotulo(r), (r.campos ?? []).join(", ")])} />
        </div>
      </Card>
      <Card className="p-4">
        {!regs ? <Loader2 className="animate-spin text-muted-foreground" /> : lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma alteração nesse filtro.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2 pr-2">Quando</th><th className="py-2 pr-2">Usuário</th><th className="py-2 pr-2">Ação</th><th className="py-2 pr-2">O quê</th><th className="py-2 pr-2 hidden md:table-cell">Loja</th><th></th></tr></thead>
              <tbody>
                {lista.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="border-b">
                      <td className="py-1.5 pr-2 whitespace-nowrap text-xs">{fmtDate(r.quando)}</td>
                      <td className="py-1.5 pr-2">{r.usuario ?? <span className="text-muted-foreground">sistema</span>}</td>
                      <td className="py-1.5 pr-2"><span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", r.acao === "excluir" ? "bg-destructive/15 text-destructive" : r.acao === "inserir" ? "bg-success/15 text-success" : "bg-warning/20")}>{ACAO[r.acao]}</span></td>
                      <td className="py-1.5 pr-2"><span className="text-muted-foreground">{TABELAS[r.tabela] ?? r.tabela}:</span> {rotulo(r)}{r.campos?.length ? <span className="text-xs text-muted-foreground"> ({r.campos.join(", ")})</span> : null}</td>
                      <td className="py-1.5 pr-2 text-xs hidden md:table-cell">{nomeLoja(r.loja_id)}</td>
                      <td className="py-1.5"><Button size="icon" variant="ghost" onClick={() => setAberto(aberto === r.id ? null : r.id)}>{aberto === r.id ? <ChevronUp /> : <ChevronDown />}</Button></td>
                    </tr>
                    {aberto === r.id && (
                      <tr className="border-b bg-muted/30">
                        <td colSpan={6} className="p-3 text-xs">
                          <table className="w-full">
                            <thead><tr className="text-left text-muted-foreground"><th className="pr-2">Campo</th><th className="pr-2">Antes</th><th>Depois</th></tr></thead>
                            <tbody>
                              {[...new Set([...Object.keys(r.antes ?? {}), ...Object.keys(r.depois ?? {})])].map((k) => (
                                <tr key={k}><td className="pr-2 font-mono">{k}</td><td className="pr-2 text-destructive">{curto(r.antes?.[k])}</td><td className="text-success">{curto(r.depois?.[k])}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {(regs?.length ?? 0) >= 1000 && <p className="py-2 text-xs text-muted-foreground">Mostrando as 1.000 mais recentes. Use os filtros para ver mais antigas.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
