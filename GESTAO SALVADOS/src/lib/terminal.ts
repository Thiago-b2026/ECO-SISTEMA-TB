// Nome do terminal (este computador/caixa), guardado no navegador.
const CHAVE = "eco.terminal";

export function lerTerminal(): string {
  try {
    return localStorage.getItem(CHAVE) || "CAIXA 01";
  } catch {
    return "CAIXA 01";
  }
}

export function salvarTerminal(nome: string) {
  try {
    localStorage.setItem(CHAVE, nome.trim().toUpperCase());
  } catch {
    /* navegador sem storage: usa o padrão */
  }
}
