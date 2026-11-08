# Portal – ECO SISTEMA TB

Página de entrada dos sistemas do Grupo TB: https://portal-grupotb.vercel.app

**Agora:** página aberta, **sem login**. Mostra sempre os quadros GESTÃO SALVADOS (PDV) e GESTÃO RH.
Clicar abre o sistema na mesma aba; o próprio sistema pede a senha e mostra só o que a pessoa tem liberado.

**Sistema novo:** incluir o quadro na lista `SISTEMAS` de `src/pages/Inicio.tsx` (e em `MEU SUPERVISOR/sistemas.json`).

## Rodar no computador
```
npm install
npm run dev      # http://localhost:5190
```

## Publicar
Dentro desta pasta: `npx --yes vercel@latest deploy --prod --yes` (projeto `portal-grupotb`, time `grupotb`).
