-- =====================================================================
-- PDV: nomes das telas iguais ao menu novo ("Caixa" e "Formas de pagamento").
-- PARADA: aplicar só quando voltarmos ao PDV (junto com a publicação do menu com esses nomes).
-- Só muda o NOME mostrado; códigos e permissões continuam iguais.
-- AO RETOMAR: trocar também no código do PDV (nav.ts, telas.ts, _app.caixa.tsx, _app.pagamentos.tsx e os testes).
-- =====================================================================
-- RENOMEIA_TELAS (código, nome)
update public.telas t set nome = x.nome
from (values
  ('pdv.caixa', 'Caixa'),
  ('pdv.pagamentos', 'Formas de pagamento')
) as x(codigo, nome)
where t.codigo = x.codigo;

