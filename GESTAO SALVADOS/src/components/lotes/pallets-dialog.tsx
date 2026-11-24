// Tela "Pallets" do lote: renomear, criar e excluir (só pallet vazio).
import { useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { codigoPallet, type Item, type Lote, type Pallet } from "@/lib/lotes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PalletsDialog({ lote, pallets, itens, onClose, onSalvo }: {
  lote: Lote; pallets: Pallet[]; itens: Item[]; onClose: () => void; onSalvo: () => void;
}) {
  const [nomes, setNomes] = useState<Record<string, string>>(() => Object.fromEntries(pallets.map((p) => [p.id, p.codigo])));
  const [novo, setNovo] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const qtd = (id: string) => itens.filter((i) => i.pallet_id === id).reduce((t, i) => t + i.quantidade, 0);
  const linhas = (id: string) => itens.filter((i) => i.pallet_id === id).length;
  const erroNome = (e: { message: string }, codigo: string) =>
    e.message.includes("duplicate") ? `Já existe o pallet ${codigo} neste lote.` : e.message;

  async function renomear(p: Pallet) {
    const codigo = codigoPallet(nomes[p.id] ?? "");
    if (!codigo) return toast.error("Informe o nome do pallet (letras e números).");
    if (codigo === p.codigo) return;
    setOcupado(p.id);
    const { error } = await supabase.from("pallets").update({ codigo }).eq("id", p.id);
    setOcupado(null);
    if (error) return toast.error(erroNome(error, codigo));
    setNomes((n) => ({ ...n, [p.id]: codigo }));
    toast.success(`Pallet ${p.codigo} renomeado para ${codigo}.`);
    onSalvo();
  }

  async function criar() {
    const codigo = codigoPallet(novo);
    if (!codigo) return toast.error("Informe o nome do pallet.");
    setOcupado("novo");
    const { error } = await supabase.from("pallets").insert({ lote_id: lote.id, codigo });
    setOcupado(null);
    if (error) return toast.error(erroNome(error, codigo));
    setNovo("");
    toast.success(`Pallet ${codigo} criado.`);
    onSalvo();
  }

  async function excluir(p: Pallet) {
    if (linhas(p.id)) return toast.error("O pallet tem produtos. Mude os produtos de pallet antes de excluir.");
    if (!window.confirm(`Excluir o pallet ${p.codigo}?`)) return;
    setOcupado(p.id);
    const { error } = await supabase.from("pallets").delete().eq("id", p.id);
    setOcupado(null);
    if (error) return toast.error(error.message);
    toast.success(`Pallet ${p.codigo} excluído.`);
    onSalvo();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pallets do lote</DialogTitle>
          <DialogDescription>Mude o nome e clique em ✓ (ou Enter). Até 15 letras/números; espaço vira hífen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {pallets.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pallet neste lote.</p>}
          {pallets.map((p) => {
            const mudou = codigoPallet(nomes[p.id] ?? "") !== p.codigo;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <Input
                  value={nomes[p.id] ?? ""}
                  onChange={(e) => setNomes((n) => ({ ...n, [p.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && renomear(p)}
                  maxLength={20}
                  className="font-mono uppercase"
                />
                <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">{linhas(p.id)} itens · {qtd(p.id)} un.</span>
                <Button size="icon" variant={mudou ? "default" : "ghost"} disabled={!mudou || ocupado === p.id} onClick={() => renomear(p)} title="Salvar o nome">
                  {ocupado === p.id ? <Loader2 className="animate-spin" /> : <Check />}
                </Button>
                <Button size="icon" variant="ghost" disabled={ocupado === p.id} onClick={() => excluir(p)} title="Excluir pallet vazio">
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          <div className="flex items-center gap-2 border-t pt-3">
            <Input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criar()} placeholder="Novo pallet (ex.: MZ-0410)" maxLength={20} className="font-mono uppercase" />
            <Button onClick={criar} disabled={ocupado === "novo"}>{ocupado === "novo" ? <Loader2 className="animate-spin" /> : <Plus />} Criar</Button>
          </div>
          <div className="flex justify-end pt-1"><Button variant="outline" onClick={onClose}>Fechar</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
