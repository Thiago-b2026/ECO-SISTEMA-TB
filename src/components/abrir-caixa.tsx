import { useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { lerNumero } from "@/lib/precificacao";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AbrirCaixa({ lojaId, lojaNome, onAberto }: { lojaId: string; lojaNome: string; onAberto: () => void }) {
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const { error } = await supabase.rpc("abrir_caixa", { _loja_id: lojaId, _valor: lerNumero(valor) ?? 0 });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Caixa aberto.");
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
        <Button type="submit" disabled={salvando} className="w-full h-14 text-lg">{salvando ? <Loader2 className="animate-spin" /> : "Abrir caixa e começar a vender"}</Button>
      </form>
    </Card>
  );
}
