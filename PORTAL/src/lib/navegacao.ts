// Navegação simples por endereço (sem biblioteca): "/", "/pop", "/precificacao".
// A Vercel já devolve o index.html para qualquer endereço (vercel.json).
import { useEffect, useState } from "react";

export function irPara(caminho: string) {
  if (window.location.pathname !== caminho) {
    window.history.pushState(null, "", caminho);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export function useCaminho() {
  const [caminho, setCaminho] = useState(window.location.pathname);
  useEffect(() => {
    const atualizar = () => setCaminho(window.location.pathname);
    window.addEventListener("popstate", atualizar);
    return () => window.removeEventListener("popstate", atualizar);
  }, []);
  return caminho.replace(/\/+$/, "") || "/";
}
