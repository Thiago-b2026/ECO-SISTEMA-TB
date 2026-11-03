import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Tela provisória usada enquanto o módulo não é construído. */
export function EmBreve({ titulo, fase, itens }: { titulo: string; fase: number; itens: string[] }) {
  return (
    <div className="p-4 lg:p-6 space-y-4">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <Card className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-warning-foreground">
          <Construction className="size-5 text-warning" />
          <span className="font-semibold">Em construção — entra na Fase {fase}</span>
        </div>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          {itens.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
