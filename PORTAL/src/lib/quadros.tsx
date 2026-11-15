// Como cada sistema aparece no quadro. QUEM VÊ cada quadro vem do banco (public.meus_sistemas()):
// cada pessoa vê só os sistemas em que tem pelo menos uma tela liberada (o admin vê todos).
// >>> SISTEMA NOVO: cadastrar em public.sistemas (migration) e, se quiser ícone/descrição, incluir aqui.
import type { ReactNode } from "react";

const svg = (filhos: ReactNode) => (
  <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {filhos}
  </svg>
);

export const IconeCarrinho = () => svg(<><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>);
export const IconePessoas = () => svg(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>);
export const IconePrancheta = () => svg(<><rect x="5" y="4" width="14" height="18" rx="2" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="m9 12 2 2 4-4" /><path d="M9 18h6" /></>);
export const IconeLivro = () => svg(<><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></>);
export const IconeEtiqueta = () => svg(<><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><circle cx="7" cy="7" r="1.5" /></>);
export const IconeConversa = () => svg(<path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 0 1-4-1L3 20l1.1-4.2A8.5 8.5 0 1 1 21 11.5z" />);
export const IconeRobo = () => svg(<><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 4v4" /><circle cx="12" cy="3" r="1" /><path d="M9 14h.01M15 14h.01" /></>);
export const IconeTrofeu = () => svg(<><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3" /><path d="M7 5H4v2a3 3 0 0 0 3 3" /></>);
export const IconeGrade =() => svg(<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>);

export interface InfoQuadro {
  titulo: string;
  descricao: string;
  icone: ReactNode;
  /** true = abre DENTRO do Portal (página de arquivos em /<codigo>), e não em outro site. */
  interno?: boolean;
}

export const QUADROS: Record<string, InfoQuadro> = {
  pdv: { titulo: "Gestão Salvados", descricao: "PDV, estoque, caixa e financeiro", icone: <IconeCarrinho /> },
  rh: { titulo: "Gestão RH", descricao: "Custos de pessoal por loja", icone: <IconePessoas /> },
  checklist: { titulo: "Check List Operacional", descricao: "Rotinas, fotos e planos de ação por loja", icone: <IconePrancheta /> },
  metas: { titulo: "Meta de Vendas", descricao: "Metas por loja, ranking e premiação dos vendedores", icone: <IconeTrofeu /> },
  pop: { titulo: "Treinamentos com POP", descricao: "POPs, fluxos e workbooks de treinamento", icone: <IconeLivro />, interno: true },
  precificacao: { titulo: "Precificação", descricao: "Plano de ação, relatório e listas de preço", icone: <IconeEtiqueta />, interno: true },
};

/** Quadros "EM BREVE" (sistemas ainda sem tela). Aparecem só para o admin, sem clique. */
export const EM_BREVE: { codigo: string; info: InfoQuadro }[] = [
  { codigo: "crm", info: { titulo: "CRM Super Mix Braz", descricao: "Clientes, clube e campanhas (substituir o Mercafácil)", icone: <IconeConversa /> } },
  { codigo: "supervisor", info: { titulo: "Meu Supervisor", descricao: "Supervisor do ecossistema, pelo WhatsApp", icone: <IconeRobo /> } },
];

export const infoDo = (codigo: string, nome: string): InfoQuadro =>
  QUADROS[codigo] ?? { titulo: nome, descricao: "", icone: <IconeGrade /> };
