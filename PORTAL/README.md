# Portal – ECO SISTEMA TB (QUADRO GERAL)

Entrada única dos sistemas do Grupo TB: https://portal-grupotb.vercel.app

**Com login** (mesmo e-mail e senha do Gestão Salvados, RH e Check List; sem "Criar conta").
Cada pessoa vê **só os quadros que tem liberados** (`public.meus_sistemas()`); o admin vê todos e os "Em breve".
- Quadros que abrem **outro site**: Gestão Salvados, Gestão RH, Check List.
- Quadros que abrem **dentro do Portal** (`/pop`, `/precificacao`): lista os arquivos do bucket PRIVADO
  `portal-arquivos/<codigo>/`. HTML e Markdown abrem numa moldura isolada; PDF abre; planilha baixa.
  Só o admin envia/troca/apaga (botão "+ Enviar arquivos").
- Liberar para alguém: PDV → Cadastros → Login de acesso → Permissões (telas `pop.treinamentos`, `precificacao.resultados`).

**Sistema novo:** migration em `GESTAO SALVADOS/supabase/migrations` (public.sistemas + grupos + telas),
espelho em `GESTAO SALVADOS/src/lib/telas.ts`, `MEU SUPERVISOR/sistemas.json` e, se quiser ícone/descrição,
`src/lib/quadros.tsx`. Quadro que abre dentro do Portal: `interno: true` + pasta no bucket + liberar a pasta
em `public.portal_pode_ler_pasta`.

`para-enviar/` (fora do git e da Vercel): cópias dos arquivos para subir pelo botão "+ Enviar arquivos".

## Rodar no computador
```
npm install
npm run dev      # http://localhost:5190  (precisa do .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY)
```

## Publicar
Dentro desta pasta: `npx --yes vercel@latest deploy --prod --yes` (projeto `portal-grupotb`, time `grupotb`).
