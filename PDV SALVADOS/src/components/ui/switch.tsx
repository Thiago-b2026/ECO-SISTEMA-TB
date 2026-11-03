// Chave liga/desliga simples e acessível.
import { cn } from "@/lib/utils";

export function Switch({ checked, onChange, disabled, label, size = "md" }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string; size?: "sm" | "md";
}) {
  const sm = size === "sm";
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
        sm ? "h-5 w-9" : "h-6 w-11",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span className={cn("inline-block rounded-full bg-white shadow transition-transform", sm ? "size-4" : "size-5", checked ? (sm ? "translate-x-[18px]" : "translate-x-[22px]") : "translate-x-0.5")} />
    </button>
  );
}
