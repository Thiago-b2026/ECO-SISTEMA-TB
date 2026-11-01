// Barra do caixa dentro do PDV: sangria, suprimento e fechamento cego sem sair da tela de vendas.
import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Loader2, Lock, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import type { Caixa } from "@/lib/caixa";
import { fmtBRL, fmtDate } from "@/lib/format";
import { lerNumero } from "@/lib/precificacao";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { imprimirFechamento, imprimirMovimento } from "@/lib/impressao";
import { formatarDocumento } from "@/lib/documento";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Acao = "sangria" | "suprimento" | "fechar" | null;

export function CaixaBarra({ caixa, onFechado }: { caixa: Caixa; onFechado: () => void }) {
  const [acao, setAcao] = useState<Acao>(null);
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<number | null>(null);
  const [imprimir, setImprimir] = useState(true);
  const { profile } = useAuth();
  const { lojas } = useLoja();
  const lojaObj = lojas.find((l) => l.id === caixa.loja_id) as ({ nome: string; cnpj?: string | null } | undefined);
  const cab = { loja: lojaObj?.nome ?? "", cnpj: lojaObj?.cnpj ? formatarDocumento(lojaObj.cnpj) : null, operador: profile?.nome ?? "", terminal: (caixa as { terminal?: string | null }).terminal ?? null };

  function abrir(a: Acao) {
    setValor("");
    setMotivo("");
    setResultado(null);
    setAcao(a);
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const v = lerNumero(valor);
    if (v == null || v < 0 || (acao !== "fechar" && v === 0)) return toast.error("Informe o valor.");
    setSalvando(true);
    if (acao === "fechar") {
      const { data, error } = await supabase.rpc("fechar_caixa", { _caixa_id: caixa.id, _valor_informado: v, _obs: motivo });
      setSalvando(false);
      if (error) return toast.error(error.message);
      setResultado(Number(data));
      if (imprimir) {
        const [{ data: r }, { data: c }] = await Promise.all([
          supabase.rpc("resumo_caixa", { _caixa_id: caixa.id }),
          supabase.from("caixas").select("*").eq("id", caixa.id).single(),
        ]);
        if (r && c) imprimirFechamento(cab, {
          abertoEm: c.aberto_em, fechadoEm: c.fechado_em, fundo: Number(c.valor_abertura), vendas: r.vendas, canceladas: r.canceladas,
          totalVendas: Number(r.total_vendas), porForma: (r.por_forma ?? []).map((x: { forma: string; valor: number }) => ({ forma: x.forma, valor: Number(x.valor) })),
          sangrias: Number(r.sangrias), suprimentos: Number(r.suprimentos), esperado: Number(c.valor_esperado), contado: Number(c.valor_informado), diferenca: Number(c.diferenca),
        });
      }
      return;
    }
    const { error } = await supabase.rpc("movimentar_caixa", { _caixa_id: caixa.id, _tipo: acao, _valor: v, _motivo: motivo });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success(acao === "sangria" ? `Sangria de ${fmtBRL(v)} registrada.` : `Suprimento de ${fmtBRL(v)} registrado.`);
    if (imprimir && (acao === "sangria" || acao === "suprimento")) imprimirMovimento(cab, acao, v, motivo);
    setAcao(null);
  }

  const titulo = acao === "sangria" ? "Sangria (retirar dinheiro)" : acao === "suprimento" ? "Suprimento (colocar dinheiro)" : "Fechar caixa";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <Wallet className="size-4 text-success" />
        <span className="mr-auto">Caixa aberto · {fmtDate(caixa.aberto_em)}{cab.terminal ? ` · ${cab.terminal}` : ""} · fundo {fmtBRL(Number(caixa.valor_abertura))}</span>
        <Button size="sm" variant="outline" onClick={() => abrir("sangria")}><ArrowUpCircle /> Sangria</Button>
        <Button size="sm" variant="outline" onClick={() => abrir("suprimento")}><ArrowDownCircle /> Suprimento</Button>
        <Button size="sm" variant="destructive" onClick={() => abrir("fechar")}><Lock /> Fechar caixa</Button>
      </div>

      <Dialog open={!!acao} onOpenChange={(v) => { if (!v) { if (resultado != null) onFechado(); setAcao(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>
              {acao === "fechar" ? "Conte o dinheiro da gaveta e informe o total. O sistema só mostra a conferência depois de fechar." : "O valor fica registrado no seu caixa."}
            </DialogDescription>
          </DialogHeader>
          {resultado != null ? (
            <div className="space-y-3 text-center">
              <div className={resultado === 0 ? "text-lg font-bold text-success" : "text-lg font-bold text-destructive"}>
                {resultado === 0 ? "Conferiu certinho!" : `Diferença de ${fmtBRL(resultado)}`}
              </div>
              <p className="text-sm text-muted-foreground">{resultado > 0 ? "Sobrou dinheiro na gaveta." : resultado < 0 ? "Faltou dinheiro na gaveta." : "Caixa fechado."}</p>
              <Button className="w-full" onClick={() => { setAcao(null); onFechado(); }}>OK</Button>
            </div>
          ) : (
            <form onSubmit={confirmar} className="space-y-3">
              <div><Label>{acao === "fechar" ? "Dinheiro contado na gaveta (R$)" : "Valor (R$)"}</Label><Input value={valor} onChange={(e) => setValor(e.target.value)} className="h-11 text-lg" autoFocus inputMode="decimal" /></div>
              <div><Label className="text-xs">{acao === "fechar" ? "Observação (opcional)" : "Motivo"}</Label><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={acao === "sangria" ? "Ex.: depósito no banco" : ""} /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} /> Imprimir comprovante</label>
              <Button type="submit" disabled={salvando} variant={acao === "fechar" ? "destructive" : "default"} className="w-full h-11">
                {salvando ? <Loader2 className="animate-spin" /> : acao === "fechar" ? "Fechar caixa" : "Registrar"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
