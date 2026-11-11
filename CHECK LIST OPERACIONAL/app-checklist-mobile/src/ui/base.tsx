// Componentes básicos. Regra J: estado SEMPRE com texto + ícone (nunca só cor),
// alvos de toque grandes (min 48px) e foco visível no teclado.
import { cloneElement, isValidElement, useId, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variante = "primario" | "secundario" | "perigo" | "fantasma";

export function Botao({ variante = "primario", grande, className, children, carregando, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; grande?: boolean; carregando?: boolean }) {
  const cores: Record<Variante, string> = {
    primario: "bg-marca text-white hover:bg-[#0b3d26] disabled:bg-gray-400",
    secundario: "bg-white text-marca border-2 border-marca hover:bg-marca-claro disabled:text-gray-400 disabled:border-gray-300",
    perigo: "bg-red-700 text-white hover:bg-red-800 disabled:bg-gray-400",
    fantasma: "bg-transparent text-marca hover:bg-marca-claro",
  };
  return (
    <button
      {...p}
      disabled={p.disabled || carregando}
      className={cx("inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 font-semibold transition disabled:cursor-not-allowed",
        grande && "w-full text-lg", cores[variante], className)}
    >
      {carregando && <Loader2 className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Cartao({ children, className, ...p }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx("rounded-xl border border-gray-200 bg-white p-4 shadow-sm", className)}>{children}</div>;
}

export type Tom = "ok" | "alerta" | "erro" | "info" | "neutro";

const TONS: Record<Tom, { classe: string; Icone: typeof Info }> = {
  ok: { classe: "bg-green-50 text-green-900 border-green-300", Icone: CheckCircle2 },
  alerta: { classe: "bg-amber-50 text-amber-900 border-amber-300", Icone: AlertTriangle },
  erro: { classe: "bg-red-50 text-red-900 border-red-300", Icone: XCircle },
  info: { classe: "bg-blue-50 text-blue-900 border-blue-300", Icone: Info },
  neutro: { classe: "bg-gray-50 text-gray-800 border-gray-300", Icone: Info },
};

/** Selo de estado: ícone + texto. */
export function Selo({ tom, icone, children }: { tom: Tom; icone?: typeof Info; children: ReactNode }) {
  const t = TONS[tom];
  const I = icone ?? t.Icone;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", t.classe)}>
      <I className="size-3.5 shrink-0" aria-hidden /> {children}
    </span>
  );
}

export function Aviso({ tom = "info", titulo, children, acao }: { tom?: Tom; titulo?: string; children?: ReactNode; acao?: ReactNode }) {
  const t = TONS[tom];
  return (
    <div role={tom === "erro" ? "alert" : "status"} className={cx("flex items-start gap-3 rounded-lg border p-3 text-sm", t.classe)}>
      <t.Icone className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {titulo && <div className="font-semibold">{titulo}</div>}
        {children}
      </div>
      {acao}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-gray-600" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden /> {texto}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-600">{children}</div>;
}

/** Rótulo + campo. A ajuda fica FORA do rótulo (o leitor de tela anuncia só o rótulo) e é ligada ao campo por aria-describedby. */
export function Campo({ rotulo, children, ajuda }: { rotulo: string; children: ReactNode; ajuda?: string }) {
  const id = useId();
  const filho = ajuda && isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": `${id}-ajuda` })
    : children;
  return (
    <div className="block text-sm">
      <label className="block">
        <span className="mb-1 block font-semibold text-gray-800">{rotulo}</span>
        {filho}
      </label>
      {ajuda && <span id={`${id}-ajuda`} className="mt-1 block text-xs text-gray-600">{ajuda}</span>}
    </div>
  );
}

export const classeEntrada = "w-full min-h-12 rounded-lg border-2 border-gray-300 bg-white px-3 text-base focus:border-marca";

export function Titulo({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h1 className="text-xl font-bold text-gray-900">{children}</h1>
      {acao}
    </div>
  );
}
