import { useEffect, useState, type ReactNode } from "react";
import { brl } from "../lib/calc";

export function Card({ titulo, acoes, children, className = "" }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-card rounded-xl border border-border p-5 shadow-lg shadow-black/20 ${className}`}>
      {(titulo || acoes) && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          {titulo && <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{titulo}</h3>}
          {acoes}
        </div>
      )}
      {children}
    </div>
  );
}

/** Campo de dinheiro: digita só números, mostra em R$ (igual ao app original). */
export function CampoDinheiro({ valor, onChange, disabled }: { valor: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [txt, setTxt] = useState(brl(valor));
  useEffect(() => setTxt(brl(valor)), [valor]);
  return (
    <input
      inputMode="numeric"
      disabled={disabled}
      value={txt}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, "");
        const v = digitos ? Number(digitos) / 100 : 0;
        setTxt(brl(v));
        onChange(v);
      }}
      className="campo text-right tabular-nums disabled:opacity-70"
    />
  );
}

export function Valor({ v, destaque = false }: { v: number; destaque?: boolean }) {
  return (
    <div
      className={`w-full rounded-md px-3 py-2 text-sm text-right tabular-nums border border-border ${
        destaque ? "bg-primary/10 text-primary font-semibold" : "bg-muted text-foreground"
      }`}
    >
      {brl(v)}
    </div>
  );
}

export function Aviso({ tipo = "erro", children }: { tipo?: "erro" | "ok" | "info"; children: ReactNode }) {
  const cls =
    tipo === "erro"
      ? "border-danger/40 bg-danger/10 text-danger"
      : tipo === "ok"
        ? "border-success/40 bg-success/10 text-success"
        : "border-primary/40 bg-primary/10 text-primary";
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
