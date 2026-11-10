// Modelos reais do Supermix Braz, tirados da planilha
// "CHECK LIST OPERACIONAL/CHECK LIST DO LIDER DE LOJA DO BRAZ.xlsx" (9 abas, 109 itens).
// Textos revisados (ortografia), mesmo sentido. Itens marcados "SUGERIDO" não estavam na planilha.
// Este arquivo alimenta o modo demonstração e o SQL de carga (scripts/gerar-seed.ts).
import type { ConteudoModelo, Item, Perfil, Secao, TipoItem } from "../domain/tipos";

type Extra = Partial<Omit<Item, "id" | "texto">>;

const base = (tipo: TipoItem): Omit<Item, "id" | "texto"> => ({
  tipo,
  obrigatorio: true,
  foto: "nunca",
  observacao: tipo === "conformidade" || tipo === "sim_nao" ? "se_nao_conforme" : "nunca",
  gera_plano: tipo === "conformidade" || tipo === "sim_nao",
  pontua: tipo === "conformidade" || tipo === "sim_nao",
  peso: 1,
});

/** sim/não (Sim = feito / conforme) */
const sn = (id: string, texto: string, e: Extra = {}): Item => ({ id, texto, ...base("sim_nao"), permite_na: true, ...e });
/** conforme / parcial / não conforme / N/A */
const cf = (id: string, texto: string, e: Extra = {}): Item => ({ id, texto, ...base("conformidade"), ...e });
const tx = (id: string, texto: string, e: Extra = {}): Item => ({ id, texto, ...base("texto"), ...e });
const FOTO: Extra = { foto: "sempre" };
const FOTO_NC: Extra = { foto: "se_nao_conforme" };

const sec = (id: string, titulo: string, setor: string, itens: Item[]): Secao => ({ id, titulo, setor, itens });

export interface ModeloSeed {
  codigo: string;
  nome: string;
  descricao: string;
  categoria: "diaria" | "semanal" | "mensal" | "avaliacao";
  perfil_executor: Perfil;
  aba_planilha: string;
  conteudo: ConteudoModelo;
  /** agenda sugerida (o gestor aplica por unidade na tela Agendamentos) */
  agenda: {
    frequencia: "diaria" | "semanal" | "mensal";
    dias_semana?: number[];
    dia_mes?: number;
    dias_antes_fim_mes?: number;
    hora_inicio: string;
    hora_limite: string;
  };
}

const SCRIPT_ATENDIMENTO =
  "Caixa livre! · Bom dia / boa tarde / boa noite! · Já tem cadastro no Clube Braz? · CPF na nota? · " +
  "Encontrou tudo o que precisava? (se não, anotar o produto e o contato) · Oferecer a meta do dia · " +
  "Forma de pagamento: PIX, dinheiro ou cartão de débito? · Obrigado por comprar no Super Mix Braz!";

const PRECIFICACAO = "Precificação, placas de oferta, \"Aproveite\" e informativos: cada informação embaixo do produto certo";

export const MODELOS_SEED: ModeloSeed[] = [
  {
    codigo: "lider_manha",
    nome: "Líder – Rotina da manhã (abertura)",
    descricao: "Abertura da loja, conferência das ofertas e ronda de padaria, hortifrúti e açougue.",
    categoria: "diaria",
    perfil_executor: "supervisor",
    aba_planilha: "1 ROTINA DA MANHÃ – líder",
    agenda: { frequencia: "diaria", hora_inicio: "07:00", hora_limite: "10:00" },
    conteudo: { secoes: [
      sec("abertura", "Abertura da loja", "loja", [
        sn("lm_fiscais", "Verificar e acompanhar o checklist dos fiscais para o bom funcionamento da abertura"),
      ]),
      sec("ofertas", "Ofertas do dia", "ofertas", [
        sn("lm_of_ciss", "A oferta está lançada no CISS?", { ref_ciss: "150006", ajuda: "Conferir pelo relatório 150006." }),
        sn("lm_of_app", "A oferta está certa no App Braz / portal Mercafácil?"),
        sn("lm_of_balanca", "Os produtos pesáveis da oferta estão certos na balança do açougue?"),
        sn("lm_of_avulso", "Códigos avulsos (melancia, uva, linguiça, salsicha…) repassados ao setor responsável?",
          { ajuda: "Evita gargalo no caixa e prejuízo." }),
        cf("lm_of_placas", "Placas e cartazes corretos: produto, gramatura do encarte, seção e pontos extras", { ...FOTO, peso: 2 }),
        sn("lm_of_listas", "Listas de transmissão do grupo da loja alimentadas com as ofertas do dia?"),
        sn("lm_of_status", "Primeira postagem no status feita (depois, a cada 30 minutos)?", { ...FOTO, ajuda: "Foto: print do status." }),
        sn("lm_of_radio", "As ações da rádio estão rodando com as atualizações?"),
      ]),
      sec("padaria", "Padaria", "padaria", [
        cf("lm_pad_balcao", "Balcões: layout, quantidade e qualidade dos produtos expostos", { ...FOTO, peso: 2 }),
        cf("lm_pad_equip", "Funcionamento e limpeza dos equipamentos", FOTO_NC),
        cf("lm_pad_limpeza", "Limpeza do piso e das paredes", FOTO_NC),
        cf("lm_pad_preco", PRECIFICACAO, FOTO_NC),
      ]),
      sec("hortifruti", "Hortifrúti", "hortifruti", [
        cf("lm_hf_qualidade", "Qualidade de frutas, legumes e verduras, com atenção especial aos ovos (um a um)", { ...FOTO, peso: 2 }),
        cf("lm_hf_limpeza", "Limpeza do setor: bancas, embaixo das bancas e das prateleiras, chão limpo", FOTO_NC),
        cf("lm_hf_preco", PRECIFICACAO, FOTO_NC),
      ]),
      sec("acougue", "Açougue", "acougue", [
        cf("lm_ac_balcao", "Balcão e qualidade das carnes expostas; sem ruptura no mix de bandejas e carnes penduradas", { ...FOTO, peso: 2 }),
        sn("lm_ac_carne_sol", "Tem carne de sol no balcão ou no expositor de fora?"),
        cf("lm_ac_limpeza", "Limpeza do balcão, piso de dentro, porta, parede e equipamentos; limpeza da balança orientada e acompanhada", FOTO_NC),
        cf("lm_ac_preco", PRECIFICACAO, FOTO_NC),
      ]),
    ] },
  },
  {
    codigo: "lider_analise",
    nome: "Líder – Análise do dia anterior e ofertas",
    descricao: "Relatórios do CISS do dia anterior e preparação das ofertas do dia seguinte (confirmação até 14:00).",
    categoria: "diaria",
    perfil_executor: "supervisor",
    aba_planilha: "2 ROTINA DA MANHÃ – líder",
    agenda: { frequencia: "diaria", hora_inicio: "08:00", hora_limite: "14:00" },
    conteudo: { secoes: [
      sec("relatorios", "Análise dos resultados do dia anterior", "gestao", [
        sn("la_rel_venda", "Relatório de venda, ticket médio e quantidade de cupons analisado", { ref_ciss: "160356", gera_plano: false }),
        sn("la_rel_abc", "Números do dia anterior analisados com a curva ABC", { ref_ciss: "100047", gera_plano: false }),
        sn("la_rel_promo", "Relatório de promoções analisado", { ref_ciss: "160661", gera_plano: false }),
        sn("la_rel_secao", "Relatório de venda por seção, grupo e subgrupo analisado", { ref_ciss: "65", gera_plano: false }),
        sn("la_rel_produto", "Análise específica de algum produto ou comparativo", { ref_ciss: "338", gera_plano: false, permite_na: true }),
        sn("la_rel_sem_venda", "Relatório de dias sem venda analisado", { ref_ciss: "160705", gera_plano: false }),
      ]),
      sec("ofertas_seguinte", "Ofertas do dia seguinte", "ofertas", [
        sn("la_of_sucesso", "As ofertas do dia anterior (ou de hoje) foram bem-sucedidas?", { gera_plano: false, peso: 2, observacao: "nunca" }),
        sn("la_of_manter", "Manter as ofertas no próximo dia?", {
          pontua: false, gera_plano: false, observacao: "nunca", condicao: { item_id: "la_of_sucesso", valores: [true] },
        }),
        tx("la_of_causa", "Qual a causa provável de a ação não ter dado certo?", {
          condicao: { item_id: "la_of_sucesso", valores: [false] }, ajuda: "Investigue: antecipação, divulgação, ruptura, placa.",
        }),
        sn("la_of_antecipacao", "Houve antecipação conforme necessário?"),
        sn("la_of_radio", "Houve divulgação na rádio?"),
        sn("la_of_lista", "Houve divulgação na lista de transmissão?"),
        sn("la_of_ruptura", "Sem ruptura na prateleira e com a placa no local correto?"),
        tx("la_of_acoes", "Ações corretivas para melhorar a ação do dia anterior (ou nova ação)"),
        sn("la_of_confirmar", "Oferta do dia seguinte confirmada, com o estoque de todas as lojas conferido", {
          prazo_hora: "14:00", peso: 3, ajuda: "Prazo máximo 14:00. A matriz pode decidir pelas outras lojas, por ter a distribuição.",
        }),
        sn("la_of_marketing", "Oferta confirmada com o marketing e na Rádio TB?"),
      ]),
    ] },
  },
  {
    codigo: "lider_tarde",
    nome: "Líder – Rotina da tarde e fechamento",
    descricao: "Confirmação da oferta (14:00), pedido (15:00), ronda das seções, laticínios, pico da noite e fechamento.",
    categoria: "diaria",
    perfil_executor: "supervisor",
    aba_planilha: "3 ROTINA DA TARDE – líder",
    agenda: { frequencia: "diaria", hora_inicio: "13:00", hora_limite: "22:00" },
    conteudo: { secoes: [
      sec("tarde", "Rotinas da tarde", "loja", [
        sn("lt_oferta", "A oferta já foi confirmada?", { prazo_hora: "14:00", peso: 3, ajuda: "Prazo final 14:00." }),
        cf("lt_limpeza", "Limpeza da loja e de cada setor verificada e acompanhada", FOTO_NC),
        cf("lt_ronda", "Ronda nas seções: layout inteligente, reposição, sem buracos nem rupturas", { ...FOTO, peso: 2 }),
        sn("lt_criticas", "Seções críticas que não bateram a meta no dia anterior foram auxiliadas?"),
        sn("lt_etiquetas", "Alterações de preço do CPD verificadas e etiquetas trocadas", { ref_ciss: "75" }),
        sn("lt_varredura", "O fiscal fez a varredura dos produtos da padaria na área de venda?"),
        sn("lt_pedido", "Estoque de açougue, hortifrúti e frios verificado para o pedido", { prazo_hora: "15:00", peso: 2, ajuda: "O pedido fecha às 15:00." }),
        sn("lt_placas", "Placas da oferta do dia seguinte prontas?"),
        sn("lt_sacos", "Os repositores estão separando os sacos para reaproveitamento?"),
      ]),
      sec("laticinios", "Balcão de laticínios", "laticinios", [
        cf("lt_lat_balcao", "Balcões: layout, quantidade e validade dos produtos expostos", { ...FOTO, peso: 2 }),
        cf("lt_lat_equip", "Funcionamento e limpeza dos equipamentos", FOTO_NC),
        cf("lt_lat_preco", PRECIFICACAO, FOTO_NC),
      ]),
      sec("pico", "Preparo para o pico da noite", "loja", [
        cf("lt_pico", "Açougue, padaria e hortifrúti preparados para o pico da noite", FOTO_NC),
      ]),
      sec("fechamento", "Fechamento", "loja", [
        cf("lt_fechamento", "Geladeiras e seções abastecidas para o fechamento", FOTO),
      ]),
    ] },
  },
  {
    codigo: "fiscal_manha",
    nome: "Fiscal de caixa – Rotina da manhã",
    descricao: "Abertura da frente de caixa e acompanhamento do script de atendimento.",
    categoria: "diaria",
    perfil_executor: "operador",
    aba_planilha: "1 ROTINA DA MANHÃ DOS FISCAIS",
    agenda: { frequencia: "diaria", hora_inicio: "07:00", hora_limite: "09:00" },
    conteudo: { secoes: [
      sec("operacao", "Abertura da frente de caixa", "frente_caixa", [
        cf("fm_equip", "Equipamentos do caixa funcionando; limpeza, embalagens, carrinhos e cestinhas; pelo menos uma bobina de reserva", { ...FOTO_NC, peso: 2 }),
        sn("fm_oferta_ciss", "A oferta está lançada no CISS?", { ref_ciss: "150006" }),
        sn("fm_encarte", "Encarte impresso e colocado em cada caixa (o operador conhece a oferta do dia)?", FOTO),
        sn("fm_avulso", "Produtos da oferta com código avulso informados à equipe de caixa?"),
        sn("fm_radio", "Rádio da loja com as propagandas da loja (YouTube não é permitido)?"),
        sn("fm_retornaveis", "A equipe de frente de caixa está atenta às informações das retornáveis?"),
        sn("fm_telefone", "Telefone da loja sempre com o fiscal?"),
        sn("fm_script", "O script de atendimento está sendo executado?", { ajuda: SCRIPT_ATENDIMENTO }),
      ]),
      sec("script", "Script de atendimento (observar o operador)", "frente_caixa", [
        sn("fm_sc_livre", "Disse \"Caixa livre!\"?"),
        sn("fm_sc_saudacao", "Cumprimentou (bom dia / boa tarde / boa noite)?"),
        sn("fm_sc_clube", "Perguntou se já tem cadastro no Clube Braz?"),
        sn("fm_sc_cpf", "Perguntou se quer CPF na nota?"),
        sn("fm_sc_encontrou", "Perguntou se encontrou tudo? (se não, anotou o produto e o contato do cliente)"),
        sn("fm_sc_meta", "Ofereceu a meta do dia?"),
        sn("fm_sc_pagamento", "Perguntou a forma de pagamento (PIX, dinheiro, cartão de débito)?"),
        sn("fm_sc_obrigado", "Agradeceu: \"Obrigado por comprar no Super Mix Braz!\"?"),
      ]),
    ] },
  },
  {
    codigo: "fiscal_tarde",
    nome: "Fiscal de caixa – Rotina da tarde",
    descricao: "Controles da frente de caixa e validade da padaria (entre 14:00 e 15:00).",
    categoria: "diaria",
    perfil_executor: "operador",
    aba_planilha: "1 ROTINA DA TARDE DOS FISCAIS",
    agenda: { frequencia: "diaria", hora_inicio: "13:00", hora_limite: "16:00" },
    conteudo: { secoes: [
      sec("tarde", "Rotina da tarde dos fiscais", "frente_caixa", [
        sn("ft_copos", "Copos descartáveis só de 180 e 200 ml na frente de loja?"),
        sn("ft_alcool", "Álcool de uso na frente: meio a meio, água e álcool?"),
        sn("ft_faltas", "Anotações de falta dos operadores acompanhadas no caderno?"),
        sn("ft_fita", "Uso da fita de empacotamento acompanhado e controlado?"),
        cf("ft_validade_padaria", "Validade dos produtos da padaria na exposição da frente de loja verificada com o responsável da padaria", {
          ...FOTO, prazo_hora: "15:00", peso: 3, observacao: "se_nao_conforme",
          ajuda: "Todos os dias entre 14:00 e 15:00. Se precisar, dar o desconto permitido pelo crachá (30%) para evitar perda.",
        }),
        sn("ft_chinelos", "Chinelos Havaianas todos amarrados com abraçadeira plástica?"),
        sn("ft_radio", "Rádio da loja com as propagandas da loja, sem músicas aleatórias do YouTube?"),
        sn("ft_flanela", "Flanela e fita de empacotamento disponíveis?"),
        sn("ft_telefone", "Telefone da loja sempre com os fiscais?"),
        sn("ft_cpf_operador", "Operadores orientados a não colocar o próprio CPF na nota do cliente?"),
        sn("ft_sacola", "Uso da sacola 50×60 orientado e acompanhado?"),
      ]),
    ] },
  },
  {
    codigo: "lider_semanal",
    nome: "Líder – Rotinas semanais",
    descricao: "Rotinas de cada dia da semana (balanços, pedidos, RH, tesouraria, preparação do fim de semana).",
    categoria: "semanal",
    perfil_executor: "supervisor",
    aba_planilha: "6 ROTINAS SEMANAIS",
    agenda: { frequencia: "semanal", dias_semana: [1, 2, 3, 4, 5, 6], hora_inicio: "07:00", hora_limite: "20:00" },
    conteudo: { secoes: [
      sec("segunda", "Segunda-feira", "acougue", [
        sn("ls_seg_balanco", "Balanço do açougue e levantamento para o pedido", { dias_semana: [1] }),
      ]),
      sec("terca", "Terça-feira", "loja", [
        sn("ls_ter_bebida", "Levantamento das bebidas para fazer a compra", { dias_semana: [2], setor: "bebidas" }),
        sn("ls_ter_hortifruti", "Balanço do hortifrúti", { dias_semana: [2], setor: "hortifruti" }),
        sn("ls_ter_faltas", "O fiscal passou a lista de faltas e sugestões?", { dias_semana: [2], setor: "frente_caixa" }),
      ]),
      sec("quarta", "Quarta-feira", "administrativo", [
        sn("ls_qua_rh", "Verificado com o RH quem está com banco de horas positivo ou negativo", { dias_semana: [3] }),
        sn("ls_qua_limpeza", "Produtos de limpeza da loja verificados", { dias_semana: [3], setor: "loja" }),
      ]),
      sec("quinta", "Quinta-feira", "loja", [
        sn("ls_qui_bebidas", "Abastecimento das bebidas para o fim de semana", { dias_semana: [4], setor: "bebidas" }),
        cf("ls_qui_cestinhas", "Limpeza das cestinhas", { dias_semana: [4], ...FOTO }),
        sn("ls_qui_frios", "Pedido de frios feito", { dias_semana: [4], prazo_hora: "14:00", setor: "frios", ajuda: "No máximo até 14:00." }),
        sn("ls_qui_carvao", "Pedido de carvão feito", { dias_semana: [4] }),
        sn("ls_qui_etiquetas", "Etiquetas de balança e papel para cartaz verificados", { dias_semana: [4] }),
      ]),
      sec("sexta", "Sexta-feira", "administrativo", [
        sn("ls_sex_vales", "Verificado com a tesouraria os vales que não foram assinados", { dias_semana: [5] }),
        sn("ls_sex_tabela", "Tabela de códigos do açougue e da padaria atualizada?", { dias_semana: [5], setor: "loja" }),
        sn("ls_sex_script", "Script de atendimento impresso e colado", { dias_semana: [5], ...FOTO, setor: "frente_caixa" }),
        sn("ls_sex_radio", "Rádio preparada para o fim de semana", { dias_semana: [5], setor: "ofertas" }),
        sn("ls_sex_veiculos", "Veículos abastecidos para o fim de semana?", { dias_semana: [5] }),
      ]),
      sec("sabado", "Sábado", "loja", [
        cf("ls_sab_impecavel", "A loja está pronta para abrir impecável no domingo? (rotinas da semana, em especial de quinta a sábado, cumpridas)", {
          dias_semana: [6], ...FOTO, peso: 3,
        }),
        sn("ls_sab_bebidas", "Vendas conferidas e quantidades de bebidas repassadas (saber o que tem em cada freezer)", { dias_semana: [6], setor: "bebidas" }),
      ]),
    ] },
  },
  {
    codigo: "lider_mensal",
    nome: "Líder – Rotinas mensais",
    descricao: "Escala, feriados, trocas e perdas (8 dias antes do fim do mês) e estoque de material.",
    categoria: "mensal",
    perfil_executor: "supervisor",
    aba_planilha: "5 ROTINAS MENSAIS",
    agenda: { frequencia: "mensal", dias_antes_fim_mes: 8, hora_inicio: "07:00", hora_limite: "20:00" },
    conteudo: { secoes: [
      sec("planejamento", "Planejamento do mês", "administrativo", [
        sn("lme_escala", "Escala do mês de todos os setores feita"),
        sn("lme_feriados", "Feriados do mês verificados e planejamento feito"),
        sn("lme_trocas", "Trocas e perdas resolvidas (faltando 8 dias para encerrar o mês)", { peso: 2 }),
      ]),
      sec("material", "Estoque de material", "loja", [
        sn("lme_etq_balanca", "Estoque de etiquetas de balança verificado"),
        sn("lme_etq_gondola", "Estoque de etiquetas de gôndola verificado"),
        sn("lme_ribbon", "Estoque de ribbon verificado"),
        sn("lme_papel", "Estoque de papel para cartaz verificado"),
      ]),
    ] },
  },
  {
    codigo: "metodo_polar",
    nome: "Método Polar – Avaliação da seção",
    descricao: "Avaliação com nota (precificação, operação, limpeza, atendimento e rupturas). Avarias e perdas descontam da meta.",
    categoria: "avaliacao",
    perfil_executor: "supervisor",
    aba_planilha: "7 MÉTODO POLAR",
    agenda: { frequencia: "semanal", dias_semana: [5], hora_inicio: "08:00", hora_limite: "18:00" },
    conteudo: { secoes: [
      sec("precificacao", "Precificação", "loja", [
        cf("mp_preco", "Precificação dos produtos expostos: etiqueta embaixo do produto correto", { ...FOTO_NC, peso: 2 }),
        cf("mp_pontas", "Pontas e pontos extras com placa de oferta ou \"Aproveite\"", { ...FOTO_NC, peso: 2 }),
      ]),
      sec("operacao", "Operação", "loja", [
        cf("mp_pontualidade", "Pontualidade e frequência", { peso: 1 }),
        cf("mp_deposito", "Organização do depósito; sem mercadoria fora da embalagem", { ...FOTO_NC, peso: 1 }),
        cf("mp_avarias", "Sem avarias e perdas por má exposição", { ...FOTO_NC, peso: 2, ajuda: "Perdas por má exposição descontam do valor da meta." }),
        cf("mp_vencidos", "Sem produtos vencidos", { ...FOTO_NC, peso: 3 }),
      ]),
      sec("limpeza", "Limpeza", "loja", [
        cf("mp_limpeza", "Limpeza da seção, dos produtos e dos pontos extras", { ...FOTO_NC, peso: 2 }),
      ]),
      sec("atendimento", "Atendimento", "frente_caixa", [
        cf("mp_atendimento", "Atendimento ao cliente conforme o script da loja", {
          peso: 1, ajuda: "SUGERIDO: a planilha não tinha itens nesta seção. Ajuste ou remova no próximo rascunho.",
        }),
      ]),
      sec("rupturas", "Rupturas", "loja", [
        cf("mp_rupturas", "Seção sem rupturas (sem buracos na gôndola)", {
          ...FOTO_NC, peso: 2, ajuda: "SUGERIDO: a planilha não tinha itens nesta seção. Ajuste ou remova no próximo rascunho.",
        }),
      ]),
    ] },
  },
];

/** Setores (mesmos códigos da migration). */
export const SETORES: Record<string, string> = {
  frente_caixa: "Frente de caixa", ofertas: "Ofertas e marketing", padaria: "Padaria", hortifruti: "Hortifrúti",
  acougue: "Açougue", laticinios: "Laticínios", frios: "Frios", bebidas: "Bebidas", loja: "Loja (geral)",
  gestao: "Gestão e resultados", administrativo: "Administrativo",
};
export const nomeSetor = (s?: string | null) => (s ? SETORES[s] ?? s : "Sem setor");
