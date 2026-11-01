import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileSpreadsheet, Loader2, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { lerPlanilha } from "@/lib/planilha";
import { colunaParaIndice, custoPercentual, lerNumero } from "@/lib/precificacao";
import type { LoteTipo } from "@/lib/lotes";
import { useLoja } from "@/lib/loja";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function NovoLoteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { lojas, filtroLoja } = useLoja();
  const [lojaId, setLojaId] = useState("");
  useEffect(() => {
    if (open) setLojaId(filtroLoja ?? (lojas.length === 1 ? lojas[0].id : ""));
  }, [open, filtroLoja, lojas]);
  const [tipo, setTipo] = useState<LoteTipo>("manual");
  const [nome, setNome] = useState("");
  const [observacao, setObservacao] = useState("");
  const [rateio, setRateio] = useState<"percentual" | "valor_pago">("percentual");
  const [percCusto, setPercCusto] = useState("30");
  const [percDesconto, setPercDesconto] = useState("0");
  const [valorPago, setValorPago] = useState("");
  const [similaridade, setSimilaridade] = useState(70);
  // planilha
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [colProduto, setColProduto] = useState("H");
  // Padrão = planilha de lote do Mercado Livre (aba "Misto"):
  // H descrição · E qtd · J valor unit · F condição (grade) · L categoria
  const [colValor, setColValor] = useState("J");
  const [colQtd, setColQtd] = useState("E");
  const [colEan, setColEan] = useState("");
  const [colGrade, setColGrade] = useState("F");
  const [colCategoria, setColCategoria] = useState("L");
  const [linhaInicial, setLinhaInicial] = useState("2");
  const [salvando, setSalvando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const custo = Number(percCusto.replace(",", "."));
    const desconto = Number(percDesconto.replace(",", "."));
    const pago = valorPago.trim() ? lerNumero(valorPago) : null;
    if (!lojaId) return toast.error("Escolha a loja do lote.");
    if (!nome.trim()) return toast.error("Informe o nome do lote.");
    if (!(custo >= 0 && custo <= 100)) return toast.error("% de custo deve ser entre 0 e 100.");
    if (!(desconto >= 0 && desconto < 100)) return toast.error("% de desconto deve ser entre 0 e 99.");
    if (rateio === "valor_pago" && !(pago && pago > 0)) return toast.error("Informe o valor pago no lote.");

    let linhasItens: Record<string, unknown>[] = [];
    if (tipo === "planilha") {
      if (!arquivo) return toast.error("Selecione a planilha.");
      const iProd = colunaParaIndice(colProduto);
      const iValor = colValor.trim() ? colunaParaIndice(colValor) : -2;
      const iQtd = colQtd.trim() ? colunaParaIndice(colQtd) : -2;
      const iEan = colEan.trim() ? colunaParaIndice(colEan) : -2;
      const iGrade = colGrade.trim() ? colunaParaIndice(colGrade) : -2;
      const iCat = colCategoria.trim() ? colunaParaIndice(colCategoria) : -2;
      if (iProd < 0 || [iValor, iQtd, iEan, iGrade, iCat].includes(-1)) return toast.error("Use letras de coluna (ex.: A, D, AB).");
      try {
        const linhas = await lerPlanilha(arquivo);
        const inicio = Math.max(1, Number(linhaInicial) || 1) - 1;
        linhasItens = linhas.slice(inicio).flatMap((l) => {
          const nomeProd = String(l[iProd] ?? "").trim();
          if (!nomeProd) return [];
          const valor = iValor >= 0 ? lerNumero(l[iValor]) : null;
          const qtd = iQtd >= 0 ? Math.max(1, Math.round(lerNumero(l[iQtd]) ?? 1)) : 1;
          const ean = iEan >= 0 ? String(l[iEan] ?? "").replace(/\D/g, "") || null : null;
          const grade = iGrade >= 0 ? String(l[iGrade] ?? "").trim().toUpperCase().slice(0, 3) || "A" : "A";
          const categoria = iCat >= 0 ? String(l[iCat] ?? "").trim() || null : null;
          return [{ termo: nomeProd, titulo: nomeProd, valor_planilha: valor, quantidade: qtd, codigo_barras: ean, grade, categoria }];
        });
      } catch (err) {
        return toast.error((err as Error).message);
      }
      if (linhasItens.length === 0) return toast.error("Nenhum produto encontrado na coluna informada.");
    }

    setSalvando(true);
    const { data: lote, error } = await supabase
      .from("lotes")
      .insert({
        loja_id: lojaId,
        nome: nome.trim(),
        observacao: observacao.trim() || null,
        tipo,
        rateio,
        perc_custo: custo,
        perc_desconto: desconto,
        valor_pago: pago,
        similaridade_min: similaridade,
        arquivo_nome: arquivo?.name ?? null,
      })
      .select("id")
      .single();
    if (error || !lote) {
      setSalvando(false);
      return toast.error("Não foi possível criar o lote: " + (error?.message ?? ""));
    }

    if (linhasItens.length) {
      const itens = linhasItens.map((l) => ({
        ...l,
        lote_id: lote.id,
        origem: "planilha",
        status: "pendente",
        custo_unit: rateio === "percentual" ? custoPercentual(l.valor_planilha as number | null, custo) : null,
      }));
      for (let i = 0; i < itens.length; i += 500) {
        const { error: e2 } = await supabase.from("lote_itens").insert(itens.slice(i, i + 500));
        if (e2) {
          setSalvando(false);
          return toast.error(`Lote criado, mas falhou ao importar itens (${i}): ${e2.message}`);
        }
      }
    }
    setSalvando(false);
    toast.success(tipo === "planilha" ? `Lote criado com ${linhasItens.length} produtos na fila do robô.` : "Lote criado.");
    onOpenChange(false);
    navigate({ to: "/lotes/$id", params: { id: lote.id } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo lote</DialogTitle>
          <DialogDescription>Escolha como os produtos entram no lote.</DialogDescription>
        </DialogHeader>
        <form onSubmit={criar} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "manual", icon: ScanBarcode, titulo: "Sem planilha", desc: "Bipar / buscar produto por produto" },
                { id: "planilha", icon: FileSpreadsheet, titulo: "Com planilha", desc: "Subir Excel e o robô busca tudo" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTipo(t.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  tipo === t.id ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
              >
                <t.icon className="size-5 mb-1" />
                <div className="font-medium text-sm">{t.titulo}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </button>
            ))}
          </div>

          {lojas.length > 1 && (
            <div>
              <Label htmlFor="loja">Loja</Label>
              <select id="loja" value={lojaId} onChange={(e) => setLojaId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">Escolha a loja…</option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor="nome">Nome do lote</Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Lote eletrônicos novembro" required />
          </div>
          <div>
            <Label htmlFor="obs">Observação (opcional)</Label>
            <Input id="obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          {tipo === "planilha" && (
            <div className="space-y-3 rounded-lg border p-3">
              <div>
                <Label htmlFor="arq">Planilha (.xlsx ou .csv)</Label>
                <Input id="arq" type="file" accept=".xlsx,.csv" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
              </div>
              <p className="text-xs text-muted-foreground">Colunas já preenchidas no padrão da planilha de lote do Mercado Livre. Deixe em branco o que a sua planilha não tiver.</p>
              <div className="grid grid-cols-3 gap-2">
                <Campo label="Produto" value={colProduto} onChange={setColProduto} />
                <Campo label="Valor unit." value={colValor} onChange={setColValor} />
                <Campo label="Quantidade" value={colQtd} onChange={setColQtd} placeholder="opcional" />
                <Campo label="Grade" value={colGrade} onChange={setColGrade} placeholder="opcional" />
                <Campo label="Categoria" value={colCategoria} onChange={setColCategoria} placeholder="opcional" />
                <Campo label="Cód. barras (EAN)" value={colEan} onChange={setColEan} placeholder="opcional" />
              </div>
              <Campo label="Primeira linha com produto" value={linhaInicial} onChange={setLinhaInicial} />
            </div>
          )}

          <div className="space-y-3 rounded-lg border p-3">
            <div className="text-sm font-medium">Custo dos produtos (rateio)</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setRateio("percentual")} className={cn("rounded-md border p-2 text-xs text-left", rateio === "percentual" && "border-primary bg-primary/5")}>
                <b>% sobre o preço</b>
                <br />
                custo = {tipo === "planilha" ? "valor da planilha" : "preço do ML"} × %
              </button>
              <button type="button" onClick={() => setRateio("valor_pago")} className={cn("rounded-md border p-2 text-xs text-left", rateio === "valor_pago" && "border-primary bg-primary/5")}>
                <b>Valor pago no lote</b>
                <br />
                divide o que você pagou entre os itens
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="% de custo" value={percCusto} onChange={setPercCusto} />
              <Campo label="Valor pago no lote (R$)" value={valorPago} onChange={setValorPago} placeholder={rateio === "valor_pago" ? "obrigatório" : "opcional"} />
            </div>
            <p className="text-xs text-muted-foreground">
              Você pode trocar depois e usar "Recalcular custo" quando terminar de inserir os produtos.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Campo label="% desconto sobre o ML" value={percDesconto} onChange={setPercDesconto} />
            <div>
              <Label>Similaridade mínima: {similaridade}%</Label>
              <input type="range" min={50} max={100} value={similaridade} onChange={(e) => setSimilaridade(Number(e.target.value))} className="w-full accent-primary" />
            </div>
          </div>

          <Button type="submit" disabled={salvando} className="w-full h-11">
            {salvando ? <Loader2 className="animate-spin" /> : tipo === "planilha" ? "Criar lote e importar planilha" : "Criar lote"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
