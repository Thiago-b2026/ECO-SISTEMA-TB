// Botões "Excel" e "PDF" para qualquer tabela de dados.
import { FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { exportarExcel, exportarPdf, type Coluna, type Valor } from "@/lib/exportar";
import { Button } from "@/components/ui/button";

export function Exportar({ titulo, subtitulo = "", colunas, linhas }: { titulo: string; subtitulo?: string; colunas: Coluna[]; linhas: () => Valor[][] }) {
  return (
    <div className="flex gap-1">
      <Button type="button" size="sm" variant="outline" title="Baixar planilha para o Excel" onClick={() => {
        const l = linhas();
        if (!l.length) return toast.info("Nada para exportar com esse filtro.");
        exportarExcel(`${titulo} ${subtitulo}`, colunas, l);
      }}><FileSpreadsheet /> Excel</Button>
      <Button type="button" size="sm" variant="outline" title="Gerar PDF (escolha Salvar como PDF)" onClick={() => {
        const l = linhas();
        if (!l.length) return toast.info("Nada para exportar com esse filtro.");
        if (!exportarPdf(titulo, subtitulo, colunas, l)) toast.error("O navegador bloqueou a janela. Permita pop-ups para localhost.");
      }}><FileDown /> PDF</Button>
    </div>
  );
}
