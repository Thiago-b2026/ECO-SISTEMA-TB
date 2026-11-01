import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { lerNumero } from "@/lib/precificacao";
import { useAuth } from "@/lib/auth";
import { useLoja } from "@/lib/loja";
import { lerTerminal, salvarTerminal } from "@/lib/terminal";
import { imprimirAbertura } from "@/lib/impressao";
import { formatarDocumento } from "@/lib/documento";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AbrirCaixa({ lojaId, lojaNome, onAberto }: { lojaId: string; lojaNome: string; onAberto: () => void }) {
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [terminal, setTerminal] = useState(lerTerminal());
  const [imprimir, setImprimir] = useState(true);
  const { profile } = useAuth();
  const { lojas } = useLoja();
  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const fundo = lerNumero(valor) ?? 0;
    salvarTerminal(terminal || "CAIXA 01");
    const { error } = await supabase.rpc("abrir_caixa", { _loja_id: lojaId, _valor: fundo, _terminal: terminal });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Caixa aberto.");
    if (imprimir) {
      const cnpj = (lojas.find((l) => l.id === lojaId) as { cnpj?: string | null } | undefined)?.cnpj;
      imprimirAbertura({ loja: lojaNome, cnpj: cnpj ? formatarDocumento(cnpj) : null, operador: profile?.nome ?? "", terminal }, fundo, new Date().toISOString());
    }
    onAberto();
  }
  return (
    <Card className="w-full max-w-md p-6 sm:p-8 space-y-5 shadow-xl">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="size-16 rounded-2xl bg-primary grid place-items-center"><Wallet className="size-8 text-primary-foreground" /></div>
        <div className="text-2xl font-bold">Frente de loja</div>
        <div className="text-sm text-muted-foreground">{lojaNome} · caixa fechado</div>
      </div>
      <form onSubmit={abrir} className="space-y-3">
        <div>
          <Label>Troco inicial na gaveta (R$)</Label>
          <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" autoFocus inputMode="decimal" className="h-14 text-center text-2xl" />
        </div>
        <div className="grid grid-cols-2 gap-2 text-left">
          <div><Label className="text-xs">Terminal</Label><Input value={terminal} onChange={(e) => setTerminal(e.target.value.toUpperCase())} /></div>
          <div><Label className="text-xs">Operador</Label><Input value={profile?.nome ?? ""} disabled /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} /> Imprimir comprovante de abertura</label>
        <Button type="submit" disabled={salvando} className="w-full h-14 text-lg">{salvando ? <Loader2 className="animate-spin" /> : "Abrir caixa e começar a vender"}</Button>
      </form>
    </Card>
  );
}
