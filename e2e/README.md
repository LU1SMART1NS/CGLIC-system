# Testes e2e de layout mobile

Percorrem as rotas e abas do sistema em 375px (e conferem estouro de página também em 320px e 768px) com os
critérios da auditoria mobile: sem rolagem horizontal da página, nenhum controle inalcançável, ações visíveis,
alvos de toque ≥ 44px, inputs ≥ 16px e texto ≥ 12px (ver `AUDITORIA_MOBILE_FECHAMENTO.md`).

Usam o **Chrome instalado na máquina** (nenhum navegador é baixado).

## Primeira vez

1. Suba nada: o `npm run e2e` inicia o servidor de desenvolvimento sozinho (ou reaproveita o que já estiver em :5173).
2. Salve uma sessão: `npm run e2e:login`. Abre o Chrome; entre no sistema normalmente. A senha é digitada
   por você no navegador e nunca é lida pelo script. Só o estado do navegador vai para `e2e/.auth/state.json`
   (ignorado pelo git). Use um usuário com acesso amplo (admin ou gestor) para cobrir as telas de administração.
3. Rode: `npm run e2e` (ou `npx playwright test --project=mobile-375`).

Sem sessão salva, os testes são ignorados com um aviso.

## Dados de teste

As telas de detalhe usam chaves de exemplo que existem no ambiente de desenvolvimento. Troque por variáveis
de ambiente se os dados mudarem:

| Variável | Padrão |
|---|---|
| `E2E_ATA_KEY` | `00059/2025-200331` |
| `E2E_CONTRACT_KEY` | `200331-00141-2025` |
| `E2E_ITEM` | `00001` |

## Limites

Medem layout, não fluxos: nenhum teste grava dados. Estados que dependem de dados específicos (plano de gestão
aplicado, ciclos de pagamento em volume, linha do tempo extensa) só são cobertos se o ambiente tiver esses dados.
