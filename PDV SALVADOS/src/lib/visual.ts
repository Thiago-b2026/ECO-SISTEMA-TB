// Preferência de visual do sistema (por navegador): "classico" (menu lateral) ou "erp" (menu no topo).
import { useEffect, useState } from "react";

export type Visual = "classico" | "erp";
const CHAVE = "eco.visual";
const EVENTO = "eco-visual";

export function lerVisual(): Visual {
  try {
    return localStorage.getItem(CHAVE) === "erp" ? "erp" : "classico";
  } catch {
    return "classico";
  }
}

export function salvarVisual(v: Visual) {
  try {
    localStorage.setItem(CHAVE, v);
  } catch {
    /* sem storage: vale só nesta tela */
  }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: v }));
}

export function useVisual(): Visual {
  const [v, setV] = useState<Visual>(lerVisual());
  useEffect(() => {
    const f = (e: Event) => setV((e as CustomEvent<Visual>).detail);
    window.addEventListener(EVENTO, f);
    return () => window.removeEventListener(EVENTO, f);
  }, []);
  return v;
}
