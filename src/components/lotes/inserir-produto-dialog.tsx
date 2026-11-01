import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { buscarML, camposDoCandidato, limpar, type Candidato, type Item, type Lote, type Pallet, type TipoBusca } from "@/lib/lotes";
import { custoPercentual, margem, precoSugerido, lerNumero, type ConfigArredondamento } from "@/lib/precificacao";
import { fmtBRL } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Aba = TipoBusca | "manual";
const ABAS: { id: Aba; label: string; placeholder: string }[] = [
  { id: "ean", label: "Código de barras", placeholder: "Bipe ou digite o código (EAN)" },
  { id: "nome", label: "Nome do produto", placeholder: "Ex.: liquidificador philco 1200w" },
  { id: "link", label: "Link do anúncio", placeholder: "Cole o link do Mercado Livre" },
  { id: "manual", label: "Sem buscar", placeholder: "" },
];
const GRADES = ["A", "B", "C", "D"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lote: Lote;
  cfg: ConfigArredondamento;
  pallets: Pallet[];
  itens: Item[];
  onInserido: () => void;
}

export function InserirProdutoDialog({ open, onOpenChange, lote, cfg, pallets, itens, onInserido }: Props) {
  const [aba, setAba] = useState<Aba>("ean");
  const [busca, setBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [escolhido, setEscolhido] = useState<Candidato | null>(null);
  // formulário
  const [titulo, setTitulo] = useState("");
  const [precoML, setPrecoML] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [grade, setGrade] = useState("A");
  const [palletId, setPalletId] = useState<string>("");
  const [ean, setEan] = useState("");
  const [imprimir, setImprimir] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const campoBusca = useRef<HTMLInputElement>(null);

  function limparTudo(manterAba = true) {
    setBusca("");
    setCandidatos(null);
    setEscolhido(null);
    setTitulo("");
    setPrecoML("");
    setPrecoVenda("");
    setQuantidade(1);
    setEan("");
    if (!manterAba) setAba("ean");
    setTimeout(() => campoBusca.current?.focus(), 50);
  }

  useEffect(() => {
    if (open) {
      limparTudo(false);
      setPalletId((p) => p || pallets[0]?.id || "");
    }
  }, [open]);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (aba === "manual" || !busca.trim()) return;
    setBuscando(true);
    setCandidatos(null);
    setEscolhido(null);
    try {
      const r = await buscarML(aba, busca.trim(), 5);
      setCandidatos(r);
      if (r.length === 0) toast.info("Nada encontrado no Mercado Livre. Tente pelo nome ou insira sem buscar.");
      if (aba === "ean") setEan(busca.trim());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  function escolher(c: Candidato) {
    setEscolhido(c);
    setTitulo(c.titulo);
    setPrecoML(c.preco != null ? String(c.preco) : "");
    setPrecoVenda(String(precoSugerido(c.preco, lote.perc_desconto, cfg) ?? ""));
    if (c.gtin && !ean) setEan(c.gtin);
  }

  const pML = lerNumero(precoML);
  const pVenda = lerNumero(precoVenda);
  const custo = lote.rateio === "percentual" ? custoPercentual(pML ?? pVenda, lote.perc_custo) : null;
  const duplicado = escolhido ? itens.find((i) => (i.ml_id && i.ml_id === escolhido.id) || (ean && i.codigo_barras === ean)) : null;

  async function inserir(somarNoExistente = false) {
    if (!titulo.trim()) return toast.error("Informe o título do produto.");
    if (!(quantidade >= 1)) return toast.error("Quantidade deve ser 1 ou mais.");
    setSalvando(true);
    if (somarNoExistente && duplicado) {
      const { error } = await supabase.from("lote_itens").update({ quantidade: duplicado.quantidade + quantidade }).eq("id", duplicado.id);
      setSalvando(false);
      if (error) return toast.error(error.message);
      toast.success(`+${quantidade} un. em ${duplicado.sku}`);
    } else {
      const base: Partial<ReturnType<typeof camposDoCandidato>> = escolhido ? camposDoCandidato(escolhido, lote, cfg) : {};
      const { error } = await supabase.from("lote_itens").insert(
        limpar({
          ...base,
          lote_id: lote.id,
          origem: escolhido ? "busca" : "manual",
          status: "aprovado",
          termo: busca.trim() || null,
          titulo: titulo.trim(),
          codigo_barras: ean.trim() || base.codigo_barras || null,
          preco_ml: pML,
          preco_venda: pVenda,
          custo_unit: custo ?? undefined,
          quantidade,
          grade,
          pallet_id: palletId || null,
          candidatos: candidatos ?? null,
        }),
      );
      setSalvando(false);
      if (error) return toast.error("Não foi possível inserir: " + error.message);
      toast.success(`${titulo.trim().slice(0, 40)} inserido (${quantidade} un.)`);
      if (imprimir) toast.info("Impressão de etiqueta entra na próxima etapa.");
    }
    onInserido();
    limparTudo();
  }

  const abaAtual = ABAS.find((a) => a.id === aba)!;
  const mostrarForm = aba === "manual" || escolhido;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Inserir produto</DialogTitle>
          <DialogDescription>
            Desconto {lote.perc_desconto}% sobre o ML · custo {lote.rateio === "percentual" ? `${lote.perc_custo}% do preço` : "pelo valor pago (recalcular no fim)"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {ABAS.map((a) => (
            <Button key={a.id} type="button" size="sm" variant={a.id === aba ? "default" : "outline"} onClick={() => { setAba(a.id); limparTudo(); }}>
              {a.label}
            </Button>
          ))}
        </div>

        {aba !== "manual" && (
          <form onSubmit={buscar} className="flex gap-2">
            <Input ref={campoBusca} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={abaAtual.placeholder} inputMode={aba === "ean" ? "numeric" : undefined} className="h-11" autoFocus />
            <Button type="submit" disabled={buscando} className="h-11">
              {buscando ? <Loader2 className="animate-spin" /> : <Search />} Buscar no ML
            </Button>
          </form>
        )}

        {candidatos && candidatos.length > 0 && !escolhido && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">SELECIONE O PRODUTO CORRETO</div>
            <ul className="divide-y rounded-md border">
              {candidatos.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => escolher(c)} className="flex w-full gap-3 p-2 text-left hover:bg-muted">
                    {c.foto ? <img src={c.foto} alt="" className="size-14 shrink-0 rounded bg-white object-contain" /> : <div className="size-14 shrink-0 rounded bg-muted" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug">{c.titulo}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-sm">{c.preco != null ? fmtBRL(c.preco) : "sem preço"}</span>
                        {c.similaridade != null && <Badge variant="secondary">{c.similaridade}%</Badge>}
                        {c.marca && <span className="text-muted-foreground">{c.marca}</span>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="link" size="sm" onClick={() => setAba("manual")}>
              Não é nenhum desses — preencher manualmente
            </Button>
          </div>
        )}

        {mostrarForm && (
          <div className="space-y-3 rounded-lg border p-3">
            {escolhido && (
              <div className="flex items-start gap-3">
                {escolhido.foto && <img src={escolhido.foto} alt="" className="size-16 rounded bg-white object-contain" />}
                <div className="text-xs text-muted-foreground">
                  Produto do ML selecionado{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => setEscolhido(null)}>
                    (trocar)
                  </button>
                  {escolhido.link && (
                    <a href={escolhido.link} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                      ver anúncio <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
            {duplicado && (
              <div className="rounded-md bg-warning/15 p-2 text-sm">
                Este produto já está no lote ({duplicado.sku}, {duplicado.quantidade} un.).{" "}
                <Button type="button" size="sm" variant="outline" onClick={() => inserir(true)} disabled={salvando}>
                  Somar {quantidade} un. no existente
                </Button>
              </div>
            )}
            <div>
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <Label className="text-xs">Preço ML (R$)</Label>
                <Input value={precoML} onChange={(e) => { setPrecoML(e.target.value); setPrecoVenda(String(precoSugerido(lerNumero(e.target.value), lote.perc_desconto, cfg) ?? "")); }} />
              </div>
              <div>
                <Label className="text-xs">Preço de venda (R$)</Label>
                <Input value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} className="font-semibold" />
              </div>
              <div>
                <Label className="text-xs">Custo unit.</Label>
                <Input value={custo != null ? fmtBRL(custo) : "no recálculo"} disabled />
              </div>
              <div>
                <Label className="text-xs">Margem</Label>
                <Input value={margem(pVenda, custo) != null ? `${margem(pVenda, custo)}%` : "—"} disabled />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <Label className="text-xs">Quantidade</Label>
                <Input type="number" min={1} value={quantidade} onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <div>
                <Label className="text-xs">Grade</Label>
                <div className="flex gap-1">
                  {GRADES.map((g) => (
                    <button key={g} type="button" onClick={() => setGrade(g)} className={cn("h-9 flex-1 rounded-md border text-sm", grade === g && "border-primary bg-primary text-primary-foreground")}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Pallet</Label>
                <select value={palletId} onChange={(e) => setPalletId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">Sem pallet</option>
                  {pallets.map((p) => (
                    <option key={p.id} value={p.id}>{p.codigo}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">Código de barras</Label>
                <Input value={ean} onChange={(e) => setEan(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} className="size-4 accent-primary" />
              Imprimir etiqueta ao salvar
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button type="button" onClick={() => inserir(false)} disabled={salvando}>
                {salvando ? <Loader2 className="animate-spin" /> : "Inserir e continuar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
