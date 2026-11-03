import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Bot, Check, PackageCheck, ChevronDown, ChevronUp, Eye, EyeOff, ExternalLink, Loader2, Plus, RotateCcw, Search, Square, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  camposDoCandidato, carregarConfig, carregarLote, limpar, OCORRENCIA_LABEL, processarFila, STATUS_ITEM_LABEL, STATUS_LOTE_LABEL,
  type Candidato, type Item, type ItemStatus, type Lote, type LoteStatus, type Ocorrencia, type Pallet,
} from "@/lib/lotes";
import { ARREDONDAMENTO_PADRAO, custoPercentual, lerNumero, margem, precoSugerido, type ConfigArredondamento } from "@/lib/precificacao";
import { fmtBRL } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { InserirProdutoDialog } from "@/components/lotes/inserir-produto-dialog";
import { AvariaDialog, DesmembrarDialog } from "@/components/lotes/acoes-item";
import { TransferirLoteDialog } from "@/components/lotes/transferir-lote-dialog";
import { GraficosLote } from "@/components/lotes/graficos-lote";
import { ArrowRightLeft, BarChart3, Scissors, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/lotes/$id")({ component: DetalheLote });

const COR_STATUS: Record<ItemStatus, string> = {
  pendente: "bg-muted text-foreground",
  sucesso: "bg-success/15 text-success",
  similar: "bg-warning/20 text-foreground",
  nao_encontrado: "bg-destructive/15 text-destructive",
  aprovado: "bg-primary/15 text-primary",
  erro: "bg-destructive/15 text-destructive",
};

function DetalheLote() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const gestor = role === "admin" || role === "gerente";
  const [lote, setLote] = useState<Lote | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [pallets, setPallets] = useState<Pallet[]>([]);
  const [cfg, setCfg] = useState<ConfigArredondamento>(ARREDONDAMENTO_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [inserir, setInserir] = useState(false);
  const [verCusto, setVerCusto] = useState(false);
  const [busca, setBusca] = useState("");
  const [fPallet, setFPallet] = useState("");
  const [fStatus, setFStatus] = useState<ItemStatus | "">("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [desmembrar, setDesmembrar] = useState<Item | null>(null);
  const [avaria, setAvaria] = useState<Item | null>(null);
  const [transferir, setTransferir] = useState(false);
  const [verGraficos, setVerGraficos] = useState(false);
  // robô
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const pararRef = useRef(false);

  async function recarregar(silencioso = false) {
    if (!silencioso) setCarregando(true);
    try {
      const r = await carregarLote(id);
      setLote(r.lote);
      setItens(r.itens);
      setPallets(r.pallets);
    } catch (e) {
      toast.error("Não foi possível carregar o lote: " + (e as Error).message);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    recarregar();
    carregarConfig().then(setCfg);
    return () => {
      pararRef.current = true;
    };
  }, [id]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of itens) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [itens]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter(
      (i) =>
        (!fPallet || i.pallet_id === fPallet) &&
        (!fStatus || i.status === fStatus) &&
        (!t || i.titulo.toLowerCase().includes(t) || i.sku.toLowerCase().includes(t) || (i.codigo_barras ?? "").includes(t) || (i.termo ?? "").toLowerCase().includes(t)),
    );
  }, [itens, busca, fPallet, fStatus]);

  if (carregando && !lote) return <div className="p-6"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (!lote) return <div className="p-6">Lote não encontrado. <Link to="/lotes" className="text-primary">Voltar</Link></div>;

  const contaNoTotal = (i: Item) => i.ocorrencia == null || i.ocorrencia === "avaria_parcial";
  const totalUn = itens.filter(contaNoTotal).reduce((s, i) => s + i.quantidade, 0);
  const venda = itens.filter(contaNoTotal).reduce((s, i) => s + (i.preco_venda ?? 0) * i.quantidade, 0);
  const custoTotal = itens.reduce((s, i) => s + (i.custo_unit ?? 0) * i.quantidade, 0);
  const lucro = venda - custoTotal;
  const palletNome = (pid: string | null) => pallets.find((p) => p.id === pid)?.codigo ?? "—";

  // ---------------------------------------------------------- ações de item
  async function atualizarItem(item: Item, patch: Partial<Item>) {
    setItens((xs) => xs.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    const { error } = await supabase.from("lote_itens").update(patch).eq("id", item.id);
    if (error) {
      toast.error("Não foi possível salvar: " + error.message);
      recarregar(true);
    }
  }

  async function excluirItem(item: Item) {
    if (!window.confirm(`Excluir "${item.titulo}" do lote?`)) return;
    const { error } = await supabase.from("lote_itens").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    setItens((xs) => xs.filter((x) => x.id !== item.id));
  }

  async function escolherCandidato(item: Item, c: Candidato) {
    const patch = limpar({ ...camposDoCandidato(c, lote!, cfg, item.valor_planilha), status: "aprovado" as ItemStatus });
    await atualizarItem(item, patch as Partial<Item>);
    setAberto(null);
  }

  // ---------------------------------------------------------- ações do lote
  async function salvarLote(patch: Partial<Lote>) {
    setLote((l) => (l ? { ...l, ...patch } : l));
    const { error } = await supabase.from("lotes").update(patch).eq("id", lote!.id);
    if (error) toast.error("Não foi possível salvar o lote: " + error.message);
  }

  async function reaplicarPrecos() {
    if (!window.confirm("Recalcular o preço de venda de TODOS os itens pelo preço do ML, desconto e arredondamento atuais? Preços editados à mão serão substituídos.")) return;
    const alterados = itens.filter((i) => i.preco_ml != null);
    for (const i of alterados) {
      const patch: Partial<Item> = { preco_venda: precoSugerido(i.preco_ml, lote!.perc_desconto, cfg) };
      if (lote!.rateio === "percentual") patch.custo_unit = custoPercentual(i.valor_planilha ?? i.preco_ml, lote!.perc_custo);
      await supabase.from("lote_itens").update(patch).eq("id", i.id);
    }
    toast.success(`${alterados.length} itens recalculados.`);
    recarregar(true);
  }

  async function recalcularCusto() {
    if (!lote!.valor_pago) return toast.error("Informe o valor pago no lote primeiro.");
    const { data, error } = await supabase.rpc("recalcular_custo_lote", { _lote_id: lote!.id });
    if (error) return toast.error(error.message);
    toast.success(`Custo de ${data} itens recalculado pelo valor pago.`);
    recarregar(true);
  }

  async function lancarEstoque() {
    const aprovados = itens.filter((i) => i.status === "aprovado" && (i.ocorrencia == null || i.ocorrencia === "avaria_parcial") && (i.preco_venda ?? 0) > 0).length;
    if (aprovados === 0) return toast.info("Nenhum item aprovado com preço para lançar. Aprove os itens primeiro.");
    if (!window.confirm(`Lançar os itens APROVADOS deste lote no estoque da loja? (até ${aprovados} produtos; os que já foram lançados são ignorados)`)) return;
    const { data, error } = await supabase.rpc("lancar_lote_estoque", { _lote_id: lote!.id });
    if (error) return toast.error(error.message);
    toast.success(data ? `${data} produtos lançados no estoque.` : "Nada novo para lançar (já estavam no estoque).");
    recarregar(true);
  }

  async function excluirLote() {
    const { count } = await supabase.from("produtos").select("id", { count: "exact", head: true }).eq("lote_id", lote!.id);
    if (count) return toast.error(`Este lote já tem ${count} produtos no estoque e não pode ser excluído.`);
    if (!window.confirm(`EXCLUIR o lote "${lote!.nome}" e seus ${itens.length} itens? Não dá para desfazer.`)) return;
    const { error } = await supabase.from("lotes").delete().eq("id", lote!.id);
    if (error) return toast.error(error.message);
    toast.success("Lote excluído.");
    navigate({ to: "/lotes" });
  }

  async function novoPallet() {
    const codigo = window.prompt("Código do novo pallet (até 15 letras/números, ex.: MZ-0410):")?.trim().toUpperCase();
    if (!codigo) return;
    const { error } = await supabase.from("pallets").insert({ lote_id: lote!.id, codigo });
    if (error) return toast.error(error.message.includes("duplicate") ? `O pallet ${codigo} já existe neste lote.` : error.message);
    recarregar(true);
  }

  async function iniciarRobo() {
    pararRef.current = false;
    setRodando(true);
    try {
      const r = await processarFila(lote!, cfg, (feitos, total) => setProgresso({ feitos, total }), () => pararRef.current);
      toast.success(`Robô terminou: ${r.feitos} buscados${r.erros ? `, ${r.erros} com erro` : ""}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRodando(false);
      recarregar(true);
    }
  }

  async function emMassa(de: ItemStatus[], para: ItemStatus, pergunta: string) {
    const alvo = itens.filter((i) => de.includes(i.status));
    if (alvo.length === 0) return toast.info("Nenhum item nessa situação.");
    if (!window.confirm(pergunta.replace("{n}", String(alvo.length)))) return;
    const { error } = await supabase.from("lote_itens").update({ status: para }).eq("lote_id", lote!.id).in("status", de);
    if (error) return toast.error(error.message);
    recarregar(true);
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Link to="/lotes" className="mt-1 rounded-md border p-1.5 hover:bg-muted"><ArrowLeft className="size-4" /></Link>
          <div>
            <h1 className="text-2xl font-bold">{lote.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {lote.tipo === "planilha" ? `Lote com planilha${lote.arquivo_nome ? ` · ${lote.arquivo_nome}` : ""}` : "Lote sem planilha"}
              {lote.observacao ? ` · ${lote.observacao}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={lote.status}
            disabled={!gestor}
            onChange={(e) => salvarLote({ status: e.target.value as LoteStatus })}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {Object.entries(STATUS_LOTE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <Button variant="outline" onClick={lancarEstoque} disabled={rodando}><PackageCheck /> Lançar no estoque</Button>
          {lote.tipo === "manual" && (
            <Button onClick={() => setInserir(true)}><Plus /> Inserir produto</Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Itens no lote</div>
          <div className="text-2xl font-bold">{totalUn}</div>
          <div className="text-xs text-muted-foreground">{itens.length} produtos únicos · {pallets.length} pallets</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            Custo total
            <button onClick={() => setVerCusto((v) => !v)} title="Mostrar/ocultar">{verCusto ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
          </div>
          <div className="text-2xl font-bold">{verCusto ? fmtBRL(custoTotal) : "•••••"}</div>
          <div className="text-xs text-muted-foreground">
            {lote.rateio === "percentual" ? `${lote.perc_custo}% do preço` : `rateio de ${lote.valor_pago != null ? fmtBRL(lote.valor_pago) : "—"}`}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Potencial de venda</div>
          <div className="text-2xl font-bold">{fmtBRL(venda)}</div>
          <div className="text-xs text-muted-foreground">Ticket médio {totalUn ? fmtBRL(venda / totalUn) : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Lucro estimado</div>
          <div className="text-2xl font-bold text-success">{verCusto ? fmtBRL(lucro) : "•••••"}</div>
          <div className="text-xs text-muted-foreground">{verCusto && venda > 0 ? `${((lucro / venda) * 100).toFixed(1)}% sobre a venda` : "clique no olho para ver"}</div>
        </Card>
      </div>

      {/* Configuração do lote */}
      <Card className="p-4 space-y-3">
        <button className="flex w-full items-center justify-between text-sm font-medium" onClick={() => setMostrarConfig((v) => !v)}>
          Parâmetros do lote: desconto {lote.perc_desconto}% · custo {lote.rateio === "percentual" ? `${lote.perc_custo}%` : "pelo valor pago"} · similaridade {lote.similaridade_min}%
          {mostrarConfig ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {mostrarConfig && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <CampoNumero label="% desconto sobre ML" valor={lote.perc_desconto} onSalvar={(v) => salvarLote({ perc_desconto: v ?? 0 })} />
              <CampoNumero label="% de custo" valor={lote.perc_custo} onSalvar={(v) => salvarLote({ perc_custo: v ?? 0 })} />
              <CampoNumero label="Valor pago no lote (R$)" valor={lote.valor_pago} onSalvar={(v) => salvarLote({ valor_pago: v })} />
              <CampoNumero label="Similaridade mín. %" valor={lote.similaridade_min} onSalvar={(v) => salvarLote({ similaridade_min: Math.round(v ?? 70) })} />
              <div>
                <Label className="text-xs">Rateio do custo</Label>
                <select value={lote.rateio} onChange={(e) => salvarLote({ rateio: e.target.value as Lote["rateio"] })} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="percentual">% sobre o preço</option>
                  <option value="valor_pago">Valor pago no lote</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={reaplicarPrecos}><RotateCcw /> Reaplicar preços e custo %</Button>
              <Button size="sm" variant="outline" onClick={recalcularCusto}>Recalcular custo pelo valor pago</Button>
              <Button size="sm" variant="outline" onClick={novoPallet}><Plus /> Novo pallet</Button>
              <Button size="sm" variant="outline" onClick={() => setTransferir(true)}><ArrowRightLeft /> Transferir itens para outro lote</Button>
              {gestor && <Button size="sm" variant="outline" className="text-destructive" onClick={excluirLote}><Trash2 /> Excluir lote</Button>}
            </div>
          </div>
        )}
      </Card>

      {/* Robô (planilha) */}
      {lote.tipo === "planilha" && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {(["", "pendente", "sucesso", "similar", "nao_encontrado", "erro", "aprovado"] as const).map((s) => (
                <Button key={s || "todos"} size="sm" variant={fStatus === s ? "default" : "outline"} onClick={() => setFStatus(s)}>
                  {s ? STATUS_ITEM_LABEL[s] : "Total"}: {s ? contagem[s] ?? 0 : itens.length}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {rodando ? (
                <Button variant="outline" onClick={() => (pararRef.current = true)}><Square /> Parar robô</Button>
              ) : (
                <Button onClick={iniciarRobo} disabled={!contagem.pendente}><Bot /> Buscar {contagem.pendente ?? 0} na fila</Button>
              )}
              <Button variant="outline" size="sm" onClick={() => emMassa(["sucesso"], "aprovado", "Aprovar os {n} itens com Sucesso?")}><Check /> Aprovar sucessos</Button>
              <Button variant="outline" size="sm" onClick={() => emMassa(["nao_encontrado", "erro"], "pendente", "Mandar {n} itens (não encontrados/erro) de volta para a fila?")}><RotateCcw /> Reprocessar</Button>
            </div>
          </div>
          {rodando && (
            <div className="space-y-1">
              <div className="text-sm">Robô buscando no Mercado Livre… {progresso.feitos}/{progresso.total} — mantenha esta tela aberta.</div>
              <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary transition-all" style={{ width: `${progresso.total ? (progresso.feitos / progresso.total) * 100 : 0}%` }} /></div>
            </div>
          )}
        </Card>
      )}

      <div className="space-y-3">
        <Button size="sm" variant="outline" onClick={() => setVerGraficos((v) => !v)}><BarChart3 /> {verGraficos ? "Esconder gráficos" : "Ver gráficos (operador, categoria, dia)"}</Button>
        {verGraficos && <GraficosLote itens={itens} />}
      </div>

      {/* Tabela */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto, SKU, código…" className="pl-8" />
          </div>
          <select value={fPallet} onChange={(e) => setFPallet(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Todos os pallets</option>
            {pallets.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-2">Produto</th>
                <th className="py-2 pr-2 text-right">Qtd.</th>
                <th className="py-2 pr-2">Pallet / grade</th>
                <th className="py-2 pr-2 text-right">Ref. ML</th>
                {lote.tipo === "planilha" && <th className="py-2 pr-2 text-right">Planilha</th>}
                <th className="py-2 pr-2 text-right">Custo</th>
                <th className="py-2 pr-2">Venda unit.</th>
                <th className="py-2 pr-2 text-right">Margem</th>
                <th className="py-2 pr-2">Situação</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i) => (
                <LinhaItem
                  key={i.id}
                  item={i}
                  lote={lote}
                  pallets={pallets}
                  verCusto={verCusto}
                  aberto={aberto === i.id}
                  onAbrir={() => setAberto(aberto === i.id ? null : i.id)}
                  onAtualizar={(p) => atualizarItem(i, p)}
                  onExcluir={() => excluirItem(i)}
                  onDesmembrar={() => setDesmembrar(i)}
                  onAvaria={() => setAvaria(i)}
                  onEscolher={(c) => escolherCandidato(i, c)}
                  palletNome={palletNome}
                />
              ))}
            </tbody>
          </table>
          {visiveis.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum produto {itens.length ? "com esse filtro" : "ainda"}.</p>}
        </div>
        <div className="text-xs text-muted-foreground">{visiveis.length} de {itens.length} produtos</div>
      </Card>

      {desmembrar && <DesmembrarDialog item={desmembrar} onClose={() => setDesmembrar(null)} onFeito={() => recarregar(true)} />}
      {avaria && <AvariaDialog item={avaria} onClose={() => setAvaria(null)} onFeito={() => recarregar(true)} />}
      {transferir && <TransferirLoteDialog lote={lote} itens={itens} pallets={pallets} onClose={() => setTransferir(false)} onFeito={() => recarregar(true)} />}
      {lote.tipo === "manual" && (
        <InserirProdutoDialog open={inserir} onOpenChange={setInserir} lote={lote} cfg={cfg} pallets={pallets} itens={itens} onInserido={() => recarregar(true)} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ linha
interface LinhaProps {
  item: Item;
  lote: Lote;
  pallets: Pallet[];
  verCusto: boolean;
  aberto: boolean;
  onAbrir: () => void;
  onAtualizar: (p: Partial<Item>) => void;
  onExcluir: () => void;
  onDesmembrar: () => void;
  onAvaria: () => void;
  onEscolher: (c: Candidato) => void;
  palletNome: (id: string | null) => string;
}

function LinhaItem({ item: i, lote, pallets, verCusto, aberto, onAbrir, onAtualizar, onExcluir, onEscolher, onDesmembrar, onAvaria }: LinhaProps) {
  const [venda, setVenda] = useState(i.preco_venda != null ? String(i.preco_venda) : "");
  useEffect(() => setVenda(i.preco_venda != null ? String(i.preco_venda) : ""), [i.preco_venda]);
  const m = margem(i.preco_venda, i.custo_unit);
  const temCandidatos = (i.candidatos?.length ?? 0) > 0;
  const riscado = i.ocorrencia === "nao_chegou" || i.ocorrencia === "avaria_total";

  return (
    <>
      <tr className={cn("border-b align-top", riscado && "opacity-50")}>
        <td className="py-2 pr-2">
          <div className="flex gap-2">
            {i.foto_url ? <img src={i.foto_url} alt="" className="size-10 shrink-0 rounded bg-white object-contain" /> : <div className="size-10 shrink-0 rounded bg-muted" />}
            <div className="min-w-0">
              <div className={cn("font-medium leading-snug", riscado && "line-through")}>{i.titulo}</div>
              {i.termo && i.termo !== i.titulo && <div className="text-xs text-muted-foreground">Termo: {i.termo}</div>}
              {i.tipo_derivado && <span className="text-[11px] rounded bg-warning/20 px-1">{i.tipo_derivado === "desmembrado" ? "Desmembrado" : "Avaria parcial"}</span>}
              <div className="text-xs text-muted-foreground">
                {i.sku}{i.codigo_barras ? ` · ${i.codigo_barras}` : ""}{i.marca ? ` · ${i.marca}` : ""}
              </div>
            </div>
          </div>
        </td>
        <td className="py-2 pr-2 text-right">
          <input type="number" min={1} defaultValue={i.quantidade} onBlur={(e) => { const q = Math.max(1, Number(e.target.value) || 1); if (q !== i.quantidade) onAtualizar({ quantidade: q }); }} className="h-8 w-14 rounded border bg-background px-1 text-right" />
        </td>
        <td className="py-2 pr-2">
          <div className="flex gap-1">
            <select value={i.pallet_id ?? ""} onChange={(e) => onAtualizar({ pallet_id: e.target.value || null })} className="h-8 rounded border bg-background px-1 text-xs">
              <option value="">—</option>
              {pallets.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
            </select>
            <select value={i.grade} onChange={(e) => onAtualizar({ grade: e.target.value })} className="h-8 rounded border bg-background px-1 text-xs">
              {Array.from(new Set(["A", "B", "C", "D", i.grade])).map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
        </td>
        <td className="py-2 pr-2 text-right whitespace-nowrap">
          {i.preco_ml != null ? (
            i.ml_link ? <a href={i.ml_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-success hover:underline">{fmtBRL(i.preco_ml)} <ExternalLink className="size-3" /></a> : fmtBRL(i.preco_ml)
          ) : "—"}
        </td>
        {lote.tipo === "planilha" && <td className="py-2 pr-2 text-right whitespace-nowrap">{i.valor_planilha != null ? fmtBRL(i.valor_planilha) : "—"}</td>}
        <td className="py-2 pr-2 text-right whitespace-nowrap">{verCusto ? (i.custo_unit != null ? fmtBRL(i.custo_unit) : "—") : "•••"}</td>
        <td className="py-2 pr-2">
          <div className="flex items-center rounded border bg-muted/40 px-1">
            <span className="text-xs text-muted-foreground">R$</span>
            <input
              value={venda}
              onChange={(e) => setVenda(e.target.value)}
              onBlur={() => { const v = lerNumero(venda); if (v !== i.preco_venda) onAtualizar({ preco_venda: v }); }}
              className="h-8 w-20 bg-transparent px-1 text-right font-medium outline-none"
            />
          </div>
          {i.preco_ml != null && <div className="text-[11px] text-muted-foreground">sug. {fmtBRL(precoSugerido(i.preco_ml, lote.perc_desconto) ?? 0)}</div>}
        </td>
        <td className={cn("py-2 pr-2 text-right", m != null && m < 0 && "text-destructive")}>{verCusto && m != null ? `${m}%` : verCusto ? "—" : "•••"}</td>
        <td className="py-2 pr-2">
          <div className="flex flex-col gap-1">
            <span className={cn("w-fit rounded px-1.5 py-0.5 text-xs font-medium", COR_STATUS[i.status])}>
              {STATUS_ITEM_LABEL[i.status]}{i.similaridade != null && i.status !== "aprovado" ? ` ${i.similaridade}%` : ""}
            </span>
            <select value={i.ocorrencia ?? ""} onChange={(e) => onAtualizar({ ocorrencia: (e.target.value || null) as Ocorrencia | null })} className="h-7 w-fit rounded border bg-background px-1 text-xs">
              <option value="">Sem ocorrência</option>
              {Object.entries(OCORRENCIA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </td>
        <td className="py-2 whitespace-nowrap">
          {(i.status === "sucesso" || i.status === "similar") && (
            <Button size="icon" variant="ghost" title="Aprovar" onClick={() => onAtualizar({ status: "aprovado" })}><Check /></Button>
          )}
          {temCandidatos && (
            <Button size="icon" variant="ghost" title="Ver outras opções" onClick={onAbrir}>{aberto ? <ChevronUp /> : <ChevronDown />}</Button>
          )}
          {i.quantidade > 0 && i.tipo_derivado !== "avaria_parcial" && <Button size="icon" variant="ghost" title="Desmembrar (caixa/kit → unidades)" onClick={onDesmembrar}><Scissors /></Button>}
          {i.tipo_derivado !== "avaria_parcial" && <Button size="icon" variant="ghost" title="Avaria parcial (separar com preço menor)" onClick={onAvaria}><ShieldAlert /></Button>}
          <Button size="icon" variant="ghost" title="Excluir" onClick={onExcluir}><Trash2 className="text-destructive" /></Button>
        </td>
      </tr>
      {aberto && temCandidatos && (
        <tr className="border-b bg-muted/30">
          <td colSpan={lote.tipo === "planilha" ? 10 : 9} className="p-2">
            <div className="mb-1 text-xs font-medium text-muted-foreground">SELECIONE O PRODUTO CORRETO</div>
            <div className="grid gap-2 md:grid-cols-3">
              {i.candidatos!.map((c) => (
                <button key={c.id} onClick={() => onEscolher(c)} className={cn("flex gap-2 rounded-md border bg-background p-2 text-left hover:border-primary", c.id === i.ml_id && "border-primary")}>
                  {c.foto ? <img src={c.foto} alt="" className="size-12 rounded bg-white object-contain" /> : <div className="size-12 rounded bg-muted" />}
                  <div className="min-w-0 text-xs">
                    <div className="font-medium leading-snug">{c.titulo}</div>
                    <div className="mt-1 flex gap-2">
                      <b>{c.preco != null ? fmtBRL(c.preco) : "sem preço"}</b>
                      {c.similaridade != null && <Badge variant="secondary">{c.similaridade}%</Badge>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CampoNumero({ label, valor, onSalvar }: { label: string; valor: number | null; onSalvar: (v: number | null) => void }) {
  const [txt, setTxt] = useState(valor != null ? String(valor) : "");
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={txt} onChange={(e) => setTxt(e.target.value)} onBlur={() => { const v = txt.trim() ? lerNumero(txt) : null; if (v !== valor) onSalvar(v); }} />
    </div>
  );
}
