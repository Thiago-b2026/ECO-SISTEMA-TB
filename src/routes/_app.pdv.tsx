import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Plus, ScanBarcode, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { FORMAS, FORMA_LABEL, meuCaixaAberto, type Caixa } from "@/lib/caixa";
import { fmtBRL } from "@/lib/format";
import { lerNumero } from "@/lib/precificacao";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AbrirCaixa } from "@/components/abrir-caixa";
import { CaixaBarra } from "@/components/caixa-barra";
import { imprimirComprovanteDaVenda } from "@/lib/comprovante";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/pdv")({ component: PDV });

interface ProdutoPdv {
  id: string;
  sku: string;
  codigo_barras: string | null;
  titulo: string;
  preco_venda: number;
  estoque_atual: number;
}
interface ItemCarrinho extends ProdutoPdv {
  quantidade: number;
  preco: number;
  desconto: number;
}
interface FormaCad { id: string; nome: string; tipo: (typeof FORMAS)[number]["id"] }
interface MeioCad { id: string; forma_id: string; nome: string; loja_id: string | null }
interface Pagamento {
  forma: (typeof FORMAS)[number]["id"];
  rotulo: string;
  meio_id: string | null;
  valor: number;
}

const arred = (n: number) => Math.round(n * 100) / 100;

function PDV() {
  const { user } = useAuth();
  const { filtroLoja, lojas } = useLoja();
  const lojaNome = lojas.find((l) => l.id === filtroLoja)?.nome ?? "";
  const [caixa, setCaixa] = useState<Caixa | null | undefined>(undefined);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ProdutoPdv[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [descontoVenda, setDescontoVenda] = useState("");
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [formas, setFormas] = useState<FormaCad[]>(FORMAS.map((f) => ({ id: f.id, nome: f.label, tipo: f.id })));
  const [meios, setMeios] = useState<MeioCad[]>([]);
  const [formaSel, setFormaSel] = useState<string>("pix");
  const [meioSel, setMeioSel] = useState("");
  const formaAtual = formas.find((f) => f.id === formaSel) ?? formas[0];
  const meiosDaForma = meios.filter((m) => m.forma_id === formaAtual?.id && (!m.loja_id || m.loja_id === filtroLoja));
  useEffect(() => {
    Promise.all([
      supabase.from("formas_pagamento").select("id, nome, tipo").eq("ativo", true).order("ordem"),
      supabase.from("meios_pagamento").select("id, forma_id, nome, loja_id").eq("ativo", true).order("nome"),
    ]).then(([f, m]) => {
      if (f.data?.length) {
        setFormas(f.data as FormaCad[]);
        setFormaSel((f.data.find((x) => x.tipo === "pix") ?? f.data[0]).id);
      }
      setMeios((m.data ?? []) as MeioCad[]);
    });
  }, []);
  useEffect(() => setMeioSel(""), [formaSel]);
  const [valorPag, setValorPag] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [ultima, setUltima] = useState<{ id: string; numero: number; total: number; troco: number } | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (filtroLoja && user) meuCaixaAberto(filtroLoja, user.id).then(setCaixa);
    else setCaixa(null);
  }, [filtroLoja, user?.id]);

  const subtotal = useMemo(() => arred(carrinho.reduce((s, i) => s + i.preco * i.quantidade - i.desconto, 0)), [carrinho]);
  const desc = Math.min(lerNumero(descontoVenda) ?? 0, subtotal);
  const total = arred(subtotal - desc);
  const pago = arred(pagamentos.reduce((s, p) => s + p.valor, 0));
  const falta = arred(Math.max(total - pago, 0));
  const troco = arred(Math.max(pago - total, 0));

  useEffect(() => {
    setValorPag(falta > 0 ? String(falta).replace(".", ",") : "");
  }, [falta]);

  function adicionar(p: ProdutoPdv) {
    setCarrinho((c) => {
      const ex = c.find((i) => i.id === p.id);
      if (ex) {
        if (ex.quantidade + 1 > Number(p.estoque_atual)) { toast.error(`Só há ${Number(p.estoque_atual)} em estoque.`); return c; }
        return c.map((i) => (i.id === p.id ? { ...i, quantidade: i.quantidade + 1 } : i));
      }
      if (Number(p.estoque_atual) < 1) { toast.error("Produto sem estoque."); return c; }
      return [...c, { ...p, quantidade: 1, preco: Number(p.preco_venda), desconto: 0 }];
    });
    setBusca("");
    setResultados([]);
    campo.current?.focus();
  }

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const t = busca.trim();
    if (!t || !filtroLoja) return;
    const cols = "id, sku, codigo_barras, titulo, preco_venda, estoque_atual";
    // 1) código exato (bipado): SKU ou EAN — só letras/números/hífen entram no filtro
    const cod = t.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const { data: exato } = cod
      ? await supabase.from("produtos").select(cols).eq("loja_id", filtroLoja).eq("ativo", true)
          .or(`sku.eq.${cod},codigo_barras.eq.${cod}`).limit(5)
      : { data: [] };
    if (exato && exato.length === 1) return adicionar(exato[0] as ProdutoPdv);
    if (exato && exato.length > 1) return setResultados(exato as ProdutoPdv[]);
    // 2) por nome
    const { data } = await supabase.from("produtos").select(cols).eq("loja_id", filtroLoja).eq("ativo", true)
      .gt("estoque_atual", 0).ilike("titulo", `%${t.replace(/[%_]/g, "")}%`).order("titulo").limit(20);
    if (!data?.length) toast.info("Nenhum produto encontrado.");
    setResultados((data ?? []) as ProdutoPdv[]);
  }

  function alterar(id: string, patch: Partial<ItemCarrinho>) {
    setCarrinho((c) => c.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function addPagamento() {
    const v = lerNumero(valorPag);
    if (!v || v <= 0) return toast.error("Informe o valor.");
    if (!formaAtual) return;
    const meio = meiosDaForma.find((m) => m.id === meioSel);
    setPagamentos((p) => [...p, { forma: formaAtual.tipo, rotulo: meio ? `${formaAtual.nome} · ${meio.nome}` : formaAtual.nome, meio_id: meio?.id ?? null, valor: arred(v) }]);
  }

  async function finalizar() {
    if (!filtroLoja || carrinho.length === 0) return;
    if (falta > 0) return toast.error(`Falta receber ${fmtBRL(falta)}.`);
    setFinalizando(true);
    const { data, error } = await supabase.rpc("finalizar_venda", {
      _loja_id: filtroLoja,
      _itens: carrinho.map((i) => ({ produto_id: i.id, quantidade: i.quantidade, preco_unit: i.preco, desconto: i.desconto })),
      _pagamentos: pagamentos.map((p) => ({ forma: p.forma, valor: p.valor, meio_id: p.meio_id })),
      _desconto: desc,
      _observacao: null,
    });
    setFinalizando(false);
    if (error) return toast.error(error.message);
    setUltima({ id: data.id, numero: data.numero, total: Number(data.total), troco: Number(data.troco) });
    setCarrinho([]);
    setPagamentos([]);
    setDescontoVenda("");
    campo.current?.focus();
  }

  if (!filtroLoja) return <div className="p-6"><h1 className="text-2xl font-bold mb-2">PDV</h1><p className="text-sm text-muted-foreground">Escolha uma loja em "Loja atual" no menu.</p></div>;
  if (caixa === undefined) return <div className="p-6"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (!caixa)
    return (
      <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen grid place-items-center p-4 bg-gradient-to-br from-primary/5 to-background">
        <AbrirCaixa lojaId={filtroLoja} lojaNome={lojaNome} onAberto={() => user && meuCaixaAberto(filtroLoja, user.id).then(setCaixa)} />
      </div>
    );

  return (
    <div className="p-3 sm:p-4 lg:p-6 grid gap-4 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
      <div className="space-y-3 min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold">PDV · {lojaNome}</h1>
        <CaixaBarra caixa={caixa} onFechado={() => { setCarrinho([]); setPagamentos([]); setUltima(null); setCaixa(null); }} />
        {ultima && (
          <Card className="p-3 flex items-center justify-between bg-success/10 border-success/30">
            <div className="text-sm">
              <b>Venda nº {ultima.numero}</b> · {fmtBRL(ultima.total)}
              {ultima.troco > 0 && <span className="ml-2 text-lg font-bold">Troco: {fmtBRL(ultima.troco)}</span>}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={async () => { const e = await imprimirComprovanteDaVenda(ultima.id, lojaNome); if (e) toast.error(e); }}><Printer /> Comprovante</Button>
              <Button size="icon" variant="ghost" onClick={() => setUltima(null)}><X /></Button>
            </div>
          </Card>
        )}
        <form onSubmit={buscar} className="flex gap-2">
          <div className="relative flex-1">
            <ScanBarcode className="absolute left-3 top-3.5 size-5 text-muted-foreground" />
            <Input ref={campo} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Bipe o código ou digite o nome e Enter" className="h-12 pl-10 text-base" autoFocus />
          </div>
        </form>
        {resultados.length > 0 && (
          <Card className="divide-y">
            {resultados.map((p) => (
              <button key={p.id} onClick={() => adicionar(p)} className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-muted">
                <span><b>{p.titulo}</b> <span className="text-xs text-muted-foreground">{p.sku} · estoque {Number(p.estoque_atual)}</span></span>
                <span className="font-semibold whitespace-nowrap">{fmtBRL(Number(p.preco_venda))}</span>
              </button>
            ))}
          </Card>
        )}
        <Card className="p-3 overflow-x-auto">
          {carrinho.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum item. Bipe um produto para começar.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr className="border-b"><th className="py-2">Item</th><th className="py-2 text-center">Qtd.</th><th className="py-2 text-right">Preço</th><th className="py-2 text-right">Desc.</th><th className="py-2 text-right">Total</th><th></th></tr></thead>
              <tbody>
                {carrinho.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className="py-2 pr-2"><div className="font-medium leading-snug">{i.titulo}</div><div className="text-xs text-muted-foreground">{i.sku}</div></td>
                    <td className="py-2">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="icon" variant="outline" className="size-7" onClick={() => i.quantidade > 1 && alterar(i.id, { quantidade: i.quantidade - 1 })}><Minus /></Button>
                        <span className="w-6 text-center">{i.quantidade}</span>
                        <Button size="icon" variant="outline" className="size-7" onClick={() => (i.quantidade < Number(i.estoque_atual) ? alterar(i.id, { quantidade: i.quantidade + 1 }) : toast.error("Sem mais estoque."))}><Plus /></Button>
                      </div>
                    </td>
                    <td className="py-2 text-right"><input defaultValue={i.preco.toFixed(2).replace(".", ",")} onBlur={(e) => alterar(i.id, { preco: lerNumero(e.target.value) ?? i.preco })} className="h-8 w-20 rounded border bg-background px-1 text-right" /></td>
                    <td className="py-2 text-right"><input defaultValue="" placeholder="0" onBlur={(e) => alterar(i.id, { desconto: Math.min(lerNumero(e.target.value) ?? 0, i.preco * i.quantidade) })} className="h-8 w-16 rounded border bg-background px-1 text-right" /></td>
                    <td className="py-2 text-right font-semibold whitespace-nowrap">{fmtBRL(i.preco * i.quantidade - i.desconto)}</td>
                    <td className="py-2 text-right"><Button size="icon" variant="ghost" onClick={() => setCarrinho((c) => c.filter((x) => x.id !== i.id))}><Trash2 className="text-destructive" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card className="p-4 space-y-3 h-fit lg:sticky lg:top-4">
        <div className="flex justify-between text-sm"><span>Subtotal</span><span>{fmtBRL(subtotal)}</span></div>
        <div className="flex items-center justify-between gap-2 text-sm"><span>Desconto (R$)</span><Input value={descontoVenda} onChange={(e) => setDescontoVenda(e.target.value)} className="h-8 w-28 text-right" placeholder="0,00" /></div>
        <div className="flex justify-between border-t pt-2 text-2xl font-bold"><span>Total</span><span>{fmtBRL(total)}</span></div>

        <div className="grid grid-cols-3 gap-1">
          {formas.map((f) => <Button key={f.id} size="sm" variant={formaSel === f.id ? "default" : "outline"} onClick={() => setFormaSel(f.id)}>{f.nome}</Button>)}
        </div>
        <div className="flex gap-2">
          {meiosDaForma.length > 0 && (
            <select value={meioSel} onChange={(e) => setMeioSel(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm max-w-36" title="Maquininha / bandeira">
              <option value="">Meio…</option>
              {meiosDaForma.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          )}
          <Input value={valorPag} onChange={(e) => setValorPag(e.target.value)} className="h-10" onKeyDown={(e) => e.key === "Enter" && addPagamento()} />
          <Button onClick={addPagamento} disabled={total === 0}>Adicionar</Button>
        </div>
        {pagamentos.length > 0 && (
          <ul className="space-y-1 text-sm">
            {pagamentos.map((p, i) => (
              <li key={i} className="flex items-center justify-between rounded bg-muted px-2 py-1">
                <span>{p.rotulo}</span>
                <span className="flex items-center gap-1">{fmtBRL(p.valor)}<button onClick={() => setPagamentos((ps) => ps.filter((_, j) => j !== i))}><X className="size-3.5" /></button></span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between text-sm"><span>Falta</span><span className={cn(falta > 0 && "font-semibold text-destructive")}>{fmtBRL(falta)}</span></div>
        {troco > 0 && <div className="flex justify-between text-lg font-bold text-success"><span>Troco</span><span>{fmtBRL(troco)}</span></div>}
        <Button className="w-full h-12 text-base" disabled={finalizando || carrinho.length === 0 || falta > 0} onClick={finalizar}>
          {finalizando ? <Loader2 className="animate-spin" /> : `Finalizar venda`}
        </Button>
        {carrinho.length > 0 && <Button variant="ghost" className="w-full" onClick={() => { if (window.confirm("Limpar a venda?")) { setCarrinho([]); setPagamentos([]); } }}>Cancelar venda em andamento</Button>}
      </Card>
    </div>
  );
}
