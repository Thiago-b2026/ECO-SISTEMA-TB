import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { carregarConfig } from "@/lib/lotes";
import { ARREDONDAMENTO_PADRAO, arredondar, type ConfigArredondamento } from "@/lib/precificacao";
import { fmtBRL } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FAIXAS_LABEL = ["Abaixo de R$ 50", "R$ 50 até R$ 100", "R$ 100 até R$ 500", "R$ 500 até R$ 1.000", "Acima de R$ 1.000"];
const EXEMPLOS = [44.7, 84.7, 284.7, 784.7, 1284.7];

export function ConfigPrecoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [cfg, setCfg] = useState<ConfigArredondamento>(ARREDONDAMENTO_PADRAO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) carregarConfig().then(setCfg);
  }, [open]);

  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.from("config_precificacao").update({ arredondamento: cfg }).eq("id", 1);
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar: " + error.message);
    toast.success("Configuração de preços salva.");
    onOpenChange(false);
  }

  const opcao = (ativo: boolean, onClick: () => void, texto: string) => (
    <button type="button" onClick={onClick} className={cn("rounded-md border px-3 py-1.5 text-sm", ativo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
      {texto}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Arredondamento de preços</DialogTitle>
          <DialogDescription>Como o preço sugerido é arredondado em todos os lotes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cfg.ativo} onChange={(e) => setCfg({ ...cfg, ativo: e.target.checked })} className="size-4 accent-primary" />
            Arredondamento ligado
          </label>
          <div className="space-y-1">
            <div className="text-sm font-medium">Direção</div>
            <div className="flex gap-2">
              {opcao(cfg.direcao === "cima", () => setCfg({ ...cfg, direcao: "cima" }), "Para cima")}
              {opcao(cfg.direcao === "baixo", () => setCfg({ ...cfg, direcao: "baixo" }), "Para baixo")}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium">Centavos</div>
            <div className="flex gap-2">
              {([0, 0.9, 0.99] as const).map((c) => opcao(cfg.centavos === c, () => setCfg({ ...cfg, centavos: c }), fmtBRL(c)))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Por faixa de preço</div>
            {cfg.faixas.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                <div className="text-sm">
                  {FAIXAS_LABEL[i] ?? `Faixa ${i + 1}`}
                  <div className="text-xs text-muted-foreground">
                    Ex.: {fmtBRL(EXEMPLOS[i] ?? 100)} → {fmtBRL(arredondar(EXEMPLOS[i] ?? 100, cfg))}
                  </div>
                </div>
                <div className="flex gap-1">
                  {([1, 10, 100] as const).map((p) =>
                    opcao(f.passo === p, () => setCfg({ ...cfg, faixas: cfg.faixas.map((x, j) => (j === i ? { ...x, passo: p } : x)) }), p === 1 ? "Unidade" : p === 10 ? "Dezena" : "Centena"),
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button onClick={salvar} disabled={salvando} className="w-full h-11">
            {salvando ? <Loader2 className="animate-spin" /> : "Salvar configuração"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
