import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { buscarMLComAviso, camposDoCandidato, limpar, type Candidato, type Item, type Lote, type Pallet, type TipoBusca } from "@/lib/lotes";
import { custoPercentual, margem, precoSugerido, lerNumero, type ConfigArredondamento } from "@/lib/precificacao";
import { fmtBRL } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BotaoCamera } from "@/components/leitor-camera";
import { cn } from "@/lib/utils";
import { candidatoDaCaptura, capturarPeloNavegador, extensaoInstalada, ouvirCapturas, removerCaptura, type CapturaML } from "@/lib/captura-ml";
import { CapturasRecentes, InstalarExtensao } from "@/components/lotes/captura-ml";
import { carregarModelos, imprimirEtiquetasNaPagina, registrarImpressao, type DadosEtiqueta } from "@/lib/etiquetas";
import { useLoja } from "@/lib/loja";
import { acharDuplicado, TEXTO_MOTIVO } from "@/lib/duplicados";
import { fetchAllRows } from "@/lib/fetch-all";

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
  const { lojas } = useLoja();
  const [aba, setAba] = useState<Aba>("ean");
  const [busca, setBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [avisoBusca, setAvisoBusca] = useState<string | null>(null);
  /** Por que o link não foi lido pela extensão (aparece junto do aviso amarelo). */
  const [motivoExtensao, setMotivoExtensao] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<Candidato | null>(null);
  // formulário
  const [titulo, setTitulo] = useState("");
  const [precoML, setPrecoML] = useState("");
  const [precoVenda, setPrecoVenda] = useState("");
  /** % de custo deste produto (começa no % do lote) e custo digitado à mão (null = calculado pelo %). */
  const [percCusto, setPercCusto] = useState(String(lote.perc_custo));
  /** Produtos do estoque da loja do lote (para avisar que já existe). */
  const [estoqueLoja, setEstoqueLoja] = useState<{ id: string; sku: string; titulo: string; codigo_barras: string | null; estoque_atual: number }[]>([]);
  const mostrarEstoque = estoqueLoja.length > 0;
  useEffect(() => {
    if (!open) return;
    fetchAllRows<{ id: string; sku: string; titulo: string; codigo_barras: string | null; estoque_atual: number }>(() =>
      supabase.from("produtos").select("id, sku, titulo, codigo_barras, estoque_atual").eq("loja_id", lote.loja_id).eq("ativo", true).order("id"),
    ).then(setEstoqueLoja).catch(() => setEstoqueLoja([]));
  }, [open, lote.loja_id]);
  const [custoManual, setCustoManual] = useState<string | null>(null);
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
    setPercCusto(String(lote.perc_custo));
    setCustoManual(null);
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

  /** Anúncio enviado pelo botão "Enviar para o PDV": entra como o produto escolhido (dados exatos da página). */
  function usarCaptura(c: CapturaML) {
    const cand = candidatoDaCaptura(c);
    setAba("link");
    setBusca(c.link);
    setAvisoBusca(null);
    setCandidatos([cand]);
    escolher(cand);
    capturaUsada.current = c.link;
  }
  const capturaUsada = useRef<string | null>(null);
  const escolhidoRef = useRef<Candidato | null>(null);
  escolhidoRef.current = escolhido;
  // com o diálogo aberto, o anúncio enviado entra sozinho (se nada estiver escolhido ainda)
  useEffect(() => {
    if (!open) return;
    return ouvirCapturas((c) => {
      if (escolhidoRef.current) return toast.info(`Recebido do ML: ${c.titulo.slice(0, 50)}. Está na lista "Enviados do Mercado Livre".`);
      usarCaptura(c);
      toast.success("Anúncio recebido do Mercado Livre.");
    });
  }, [open]);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    await executarBusca(busca);
  }

  async function executarBusca(valor: string) {
    const texto = valor.trim();
    if (aba === "manual" || !texto) return;
    setBuscando(true);
    setCandidatos(null);
    setAvisoBusca(null);
    setMotivoExtensao(null);
    setEscolhido(null);
    if (aba === "ean") setEan(texto.replace(/\D/g, ""));
    // Link + extensão instalada: busca o anúncio exato pelo navegador (como o robô do PrecificaLote).
    // A aba nova precisa abrir ainda dentro do clique, por isso vem antes de qualquer "await".
    if (aba === "link" && extensaoInstalada()) {
      try {
        const c = await capturarPeloNavegador(texto);
        usarCaptura(c);
        toast.success("Anúncio lido no Mercado Livre.");
        setBuscando(false);
        return;
      } catch (err) {
        setMotivoExtensao(`A extensão não conseguiu ler o anúncio: ${(err as Error).message}`);
      }
    } else if (aba === "link") {
      setMotivoExtensao("A extensão não foi detectada nesta aba. Se você já instalou, aperte F5 e busque de novo.");
    }
    try {
      const { candidatos: r, aviso } = await buscarMLComAviso(aba, texto, 5);
      setCandidatos(r);
      setAvisoBusca(aviso);
      if (r.length === 0) toast.info("Nada encontrado no Mercado Livre. Tente pelo nome ou insira sem buscar.");
    } catch (err) {
      // Mesmo sem o Mercado Livre, o produto pode ser inserido à mão (o código lido é mantido)
      toast.error((err as Error).message, {
        duration: 10000,
        action: { label: "Inserir sem buscar", onClick: () => setAba("manual") },
      });
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
  const percNum = lerNumero(percCusto) ?? lote.perc_custo;
  const percMudou = percNum !== lote.perc_custo;
  // Custo: digitado à mão > % (do lote ou o deste produto) sobre o preço ML > recálculo pelo valor pago no fim
  const custoAuto = lote.rateio === "percentual" || percMudou ? custoPercentual(pML ?? pVenda, percNum) : null;
  const custo = custoManual != null ? lerNumero(custoManual) : custoAuto;
  // Trava de duplicado no lote: mesmo código de barras ou mesmo nome → não insere como novo (soma no existente ou muda o nome)
  const achado = titulo.trim() || ean ? acharDuplicado(itens, { titulo, codigo_barras: ean }) : null;
  const duplicado = achado?.item ?? null;
  // Mesmo anúncio do ML com nome diferente: pode ser variação (cor/tamanho) → só avisa
  const mesmoAnuncio = !duplicado && escolhido ? itens.find((i) => i.ml_id && i.ml_id === escolhido.id) ?? null : null;
  // Já existe no estoque da loja (produto lançado antes): só avisa
  const noEstoque = mostrarEstoque && (titulo.trim() || ean) ? acharDuplicado(estoqueLoja, { titulo, codigo_barras: ean }) : null;

  async function inserir(somarNoExistente = false) {
    if (!titulo.trim()) return toast.error("Informe o título do produto.");
    if (duplicado && !somarNoExistente) return toast.error(`Produto já cadastrado neste lote (${duplicado.sku}). Some no existente ou mude o nome.`);
    if (!(quantidade >= 1)) return toast.error("Quantidade deve ser 1 ou mais.");
    setSalvando(true);
    if (somarNoExistente && duplicado) {
      const { error } = await supabase.from("lote_itens").update({ quantidade: duplicado.quantidade + quantidade }).eq("id", duplicado.id);
      setSalvando(false);
      if (error) return toast.error(error.message);
      toast.success(`+${quantidade} un. em ${duplicado.sku}`);
    } else {
      const base: Partial<ReturnType<typeof camposDoCandidato>> = escolhido ? camposDoCandidato(escolhido, lote, cfg) : {};
      const { data: inserido, error } = await supabase.from("lote_itens").insert(
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
      ).select("id, sku").single();
      setSalvando(false);
      if (error) return toast.error("Não foi possível inserir: " + error.message);
      toast.success(`${titulo.trim().slice(0, 40)} inserido (${quantidade} un.)`);
      if (imprimir) {
        if (pVenda == null) toast.warning("Etiqueta não impressa: o produto está sem preço de venda.");
        else void imprimirAoSalvar({ titulo: titulo.trim(), sku: (inserido as { sku: string } | null)?.sku ?? "", lote_item_id: (inserido as { id: string } | null)?.id, preco: pVenda, precoDe: pML, grade, copias: quantidade });
      }
    }
    if (capturaUsada.current) {
      removerCaptura(capturaUsada.current);
      capturaUsada.current = null;
    }
    onInserido();
    limparTudo();
  }

  /** Etiqueta do produto recém-inserido, no último modelo usado (o mesmo da tela de etiquetas). */
  async function imprimirAoSalvar(et: DadosEtiqueta) {
    const modelos = await carregarModelos();
    let salvo: string | null = null;
    try { salvo = localStorage.getItem("eco.modeloEtiqueta"); } catch { /* sem storage */ }
    const m = modelos.find((x) => x.id === salvo) ?? modelos[0];
    imprimirEtiquetasNaPagina([et], m, lojas.find((l) => l.id === lote.loja_id)?.nome);
    const erro = await registrarImpressao([et]);
    if (!erro) onInserido(); // atualiza o "x/y impressos" da lista
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
            {aba === "ean" && (
              <BotaoCamera className="h-11" onLido={(codigo) => { setBusca(codigo); void executarBusca(codigo); }} />
            )}
            <Button type="submit" disabled={buscando} className="h-11">
              {buscando ? <Loader2 className="animate-spin" /> : <Search />} Buscar no ML
            </Button>
          </form>
        )}

        {aba === "link" && !escolhido && (
          <div className="space-y-2">
            <CapturasRecentes onUsar={usarCaptura} />
            {!extensaoInstalada() && <InstalarExtensao aberto={!!avisoBusca} />}
          </div>
        )}

        {candidatos && candidatos.length > 0 && !escolhido && (
          <div className="space-y-1">
            {avisoBusca && (
              <div className="space-y-1 rounded-md border border-warning bg-warning/15 p-2 text-xs font-medium">
                <p>⚠️ {avisoBusca}</p>
                {motivoExtensao && <p className="font-semibold">🧩 {motivoExtensao}</p>}
                {aba === "link" && /^https?:\/\//.test(busca.trim()) && (
                  <p>
                    Para pegar o anúncio exato:{" "}
                    <a href={busca.trim()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">abra o anúncio <ExternalLink className="size-3" /></a>{" "}
                    {extensaoInstalada() ? "e busque de novo." : "ou instale a extensão (veja abaixo) para isso ser automático."}
                  </p>
                )}
              </div>
            )}
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
            {duplicado && achado && (
              <div className="space-y-2 rounded-md border border-destructive bg-destructive/10 p-2 text-sm">
                <div className="font-semibold text-destructive">⛔ Produto já cadastrado neste lote ({TEXTO_MOTIVO[achado.motivo]})</div>
                <div className="text-xs">{duplicado.sku} · {duplicado.titulo} · {duplicado.quantidade} un.</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" onClick={() => inserir(true)} disabled={salvando}>
                    Somar {quantidade} un. no existente
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {achado.motivo === "nome" ? "ou mude o nome abaixo, se for outro produto (outra cor, voltagem, tamanho…)." : "ou confira o código de barras, se for outro produto."}
                  </span>
                </div>
              </div>
            )}
            {mesmoAnuncio && (
              <div className="rounded-md bg-warning/15 p-2 text-xs">
                Este anúncio do ML já está no lote como <b>{mesmoAnuncio.titulo}</b> ({mesmoAnuncio.sku}). Se for outra variação, deixe o nome diferente.
              </div>
            )}
            {noEstoque && !duplicado && (
              <div className="rounded-md bg-muted p-2 text-xs">
                Já existe no estoque da loja: <b>{noEstoque.item.titulo}</b> ({noEstoque.item.sku}, estoque {Number(noEstoque.item.estoque_atual)}) — {TEXTO_MOTIVO[noEstoque.motivo]}.
              </div>
            )}
            <div>
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div>
                <Label className="text-xs">Preço ML (R$)</Label>
                <Input value={precoML} onChange={(e) => { setPrecoML(e.target.value); setPrecoVenda(String(precoSugerido(lerNumero(e.target.value), lote.perc_desconto, cfg) ?? "")); }} />
              </div>
              <div>
                <Label className="text-xs">Preço de venda (R$)</Label>
                <Input value={precoVenda} onChange={(e) => setPrecoVenda(e.target.value)} className="font-semibold" />
              </div>
              <div>
                <Label className="text-xs">% custo</Label>
                <Input value={percCusto} inputMode="decimal" onChange={(e) => { setPercCusto(e.target.value); setCustoManual(null); }} />
              </div>
              <div>
                <Label className="flex items-center justify-between text-xs">
                  Custo (R$)
                  {custoManual != null && <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => setCustoManual(null)}>usar %</button>}
                </Label>
                <Input
                  value={custoManual ?? (custoAuto != null ? String(custoAuto) : "")}
                  placeholder={lote.rateio === "percentual" ? "" : "no recálculo"}
                  inputMode="decimal"
                  onChange={(e) => setCustoManual(e.target.value)}
                  className={cn(custoManual != null && "border-primary")}
                />
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
                <div className="flex gap-2">
                  <Input value={ean} onChange={(e) => setEan(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
                  <BotaoCamera onLido={(c) => setEan(c.replace(/\D/g, ""))} />
                </div>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} className="size-4 accent-primary" />
              Imprimir etiqueta ao salvar
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
              <Button type="button" onClick={() => inserir(false)} disabled={salvando || !!duplicado} title={duplicado ? "Já cadastrado: some no existente ou mude o nome" : undefined}>
                {salvando ? <Loader2 className="animate-spin" /> : "Inserir e continuar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
