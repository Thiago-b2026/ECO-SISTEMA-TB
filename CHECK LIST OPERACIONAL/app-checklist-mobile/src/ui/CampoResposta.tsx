// Controles de resposta por tipo. Botões grandes, com texto + ícone (nunca só cor), navegáveis por teclado.
import { useEffect, useState } from "react";
import { Check, CircleSlash, Minus, X } from "lucide-react";
import type { Item, ValorResposta } from "../domain/tipos";
import { classeEntrada, cx } from "./base";

interface Props {
  item: Item;
  valor: ValorResposta | null | undefined;
  somenteLeitura?: boolean;
  onChange: (v: ValorResposta | null) => void;
}

function Opcao({ ativo, onClick, icone: I, rotulo, tom, desativado }: {
  ativo: boolean; onClick: () => void; icone: typeof Check; rotulo: string; tom: "ok" | "meio" | "ruim" | "neutro"; desativado?: boolean;
}) {
  const cores = {
    ok: "border-green-700 bg-green-700 text-white",
    meio: "border-amber-600 bg-amber-500 text-black",
    ruim: "border-red-700 bg-red-700 text-white",
    neutro: "border-gray-600 bg-gray-600 text-white",
  };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      disabled={desativado}
      onClick={onClick}
      className={cx(
        "flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-2 text-sm font-semibold transition",
        ativo ? cores[tom] : "border-gray-300 bg-white text-gray-800 hover:border-gray-500",
        desativado && "cursor-not-allowed opacity-70",
      )}
    >
      <I className="size-5 shrink-0" aria-hidden /> {rotulo}
    </button>
  );
}

export function CampoResposta({ item, valor, somenteLeitura, onChange }: Props) {
  const [texto, setTexto] = useState(valor?.tipo === "texto" ? valor.v : "");
  const [numero, setNumero] = useState(valor?.tipo === "numero" ? String(valor.v).replace(".", ",") : "");
  useEffect(() => { if (valor?.tipo === "texto") setTexto(valor.v); }, [valor]);
  useEffect(() => { if (valor?.tipo === "numero") setNumero(String(valor.v).replace(".", ",")); }, [valor]);

  if (item.tipo === "sim_nao") {
    const v = valor?.tipo === "sim_nao" ? valor.v : undefined;
    const esperado = item.resposta_esperada ?? true;
    return (
      <div role="radiogroup" aria-label={item.texto} className="flex gap-2">
        <Opcao ativo={v === true} onClick={() => onChange({ tipo: "sim_nao", v: true })} icone={Check} rotulo="Sim" tom={esperado ? "ok" : "ruim"} desativado={somenteLeitura} />
        <Opcao ativo={v === false} onClick={() => onChange({ tipo: "sim_nao", v: false })} icone={X} rotulo="Não" tom={esperado ? "ruim" : "ok"} desativado={somenteLeitura} />
        {item.permite_na && <Opcao ativo={v === "na"} onClick={() => onChange({ tipo: "sim_nao", v: "na" })} icone={CircleSlash} rotulo="N/A" tom="neutro" desativado={somenteLeitura} />}
      </div>
    );
  }

  if (item.tipo === "conformidade") {
    const v = valor?.tipo === "conformidade" ? valor.v : undefined;
    const set = (x: "conforme" | "parcial" | "nao_conforme" | "na") => onChange({ tipo: "conformidade", v: x });
    return (
      <div role="radiogroup" aria-label={item.texto} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Opcao ativo={v === "conforme"} onClick={() => set("conforme")} icone={Check} rotulo="Conforme" tom="ok" desativado={somenteLeitura} />
        <Opcao ativo={v === "parcial"} onClick={() => set("parcial")} icone={Minus} rotulo="Parcial" tom="meio" desativado={somenteLeitura} />
        <Opcao ativo={v === "nao_conforme"} onClick={() => set("nao_conforme")} icone={X} rotulo="Não conforme" tom="ruim" desativado={somenteLeitura} />
        <Opcao ativo={v === "na"} onClick={() => set("na")} icone={CircleSlash} rotulo="N/A" tom="neutro" desativado={somenteLeitura} />
      </div>
    );
  }

  if (item.tipo === "numero") {
    const salvar = () => {
      const n = Number(numero.replace(/\./g, "").replace(",", "."));
      onChange(numero.trim() === "" || !Number.isFinite(n) ? null : { tipo: "numero", v: n });
    };
    return (
      <label className="flex items-center gap-2">
        <span className="sr-only">{item.texto}</span>
        <input inputMode="decimal" className={classeEntrada} value={numero} disabled={somenteLeitura}
          onChange={(e) => setNumero(e.target.value)} onBlur={salvar} placeholder={item.min != null || item.max != null ? `Faixa: ${item.min ?? "…"} a ${item.max ?? "…"}` : "Número"} />
        {item.unidade && <span className="text-gray-700">{item.unidade}</span>}
      </label>
    );
  }

  if (item.tipo === "texto") {
    return (
      <label className="block">
        <span className="sr-only">{item.texto}</span>
        <textarea className={cx(classeEntrada, "min-h-24 py-2")} value={texto} disabled={somenteLeitura}
          onChange={(e) => setTexto(e.target.value)} onBlur={() => onChange(texto.trim() ? { tipo: "texto", v: texto } : null)} placeholder="Escreva aqui…" />
      </label>
    );
  }

  if (item.tipo === "multipla") {
    const marcados = valor?.tipo === "multipla" ? valor.v : [];
    const alternar = (o: string) => {
      const novo = item.multipla_selecao ? (marcados.includes(o) ? marcados.filter((x) => x !== o) : [...marcados, o]) : [o];
      onChange(novo.length ? { tipo: "multipla", v: novo } : null);
    };
    return (
      <div role={item.multipla_selecao ? "group" : "radiogroup"} aria-label={item.texto} className="grid gap-2 sm:grid-cols-2">
        {(item.opcoes ?? []).map((o) => (
          <button key={o} type="button" role={item.multipla_selecao ? "checkbox" : "radio"} aria-checked={marcados.includes(o)} disabled={somenteLeitura}
            onClick={() => alternar(o)}
            className={cx("flex min-h-12 items-center gap-2 rounded-lg border-2 px-3 text-left text-sm font-medium",
              marcados.includes(o) ? "border-marca bg-marca-claro text-marca" : "border-gray-300 bg-white")}>
            {marcados.includes(o) ? <Check className="size-5" aria-hidden /> : <span className="size-5 rounded border-2 border-gray-400" aria-hidden />} {o}
          </button>
        ))}
      </div>
    );
  }

  return null; // foto e assinatura têm componentes próprios
}

/** Texto curto da resposta (relatórios e modo leitura). */
export function textoResposta(v: ValorResposta | null | undefined): string {
  if (!v) return "—";
  switch (v.tipo) {
    case "sim_nao": return v.v === "na" ? "N/A" : v.v ? "Sim" : "Não";
    case "conformidade": return { conforme: "Conforme", parcial: "Parcial", nao_conforme: "Não conforme", na: "N/A" }[v.v];
    case "numero": return String(v.v).replace(".", ",");
    case "texto": return v.v;
    case "multipla": return v.v.join(", ");
    case "assinatura": return "Assinado";
    case "foto": return "Foto";
  }
}
