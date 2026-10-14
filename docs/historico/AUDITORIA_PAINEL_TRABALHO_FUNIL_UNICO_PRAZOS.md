# SALDOARP — AUDITORIA
## O PAINEL DE TRABALHO E O FUNIL ÚNICO DE PRAZOS

**Data**: 24 de Setembro de 2026
**Status**: AUDITORIA DE BACKEND (Zero Código Alterado)
**Objetivo**: Verificar, lendo o backend real (não por inferência), se o painel de trabalho ("Home") apresenta ao usuário **todas** as atividades que demandam ação hoje — princípio de UX/gestão ágil de que nenhum trabalho pendente pode ficar invisível. Simulação de referência: um dia de trabalho da gestora de contratos.
**Documento relacionado**: `PLANO_GESTAO_ATA_LEI14133_CONSOLIDADO.md` (este documento aprofunda, com evidência de código, um achado levantado ali)

---

## 1. Resumo executivo

O painel Home (`HomeRoute.tsx`) é alimentado por um **funil único**: tudo o que o usuário vê ao abrir o sistema pela manhã passa, direta ou indiretamente, por `centralPrazosService.ts`. Esse funil hoje cobre apenas dois tipos de gatilho — vigência de Contrato (5 marcos) e vigência de Ata (1 marco, só por data). Nenhum dos outros riscos já mapeados no plano consolidado (saldo, remanejamento, aditivo de valor, alocação interna) chega ao painel, **mesmo quando os dados que os alimentariam já existem no banco** (`Empenho`, `InternalAllocation`).

Conclusão central: **o problema não é a interface, é a estreiteza da fonte que a alimenta.** Nenhuma melhoria de UI resolve isso — é preciso alargar `centralPrazosService.ts` antes.

---

## 2. Mapa real do fluxo de dados (rastreado por código, não por suposição)

```text
HomeRoute.tsx
 ├── useHomeDashboardData('200331')
 │     └── calculateHomeDashboardKPIs(contracts, arps)
 │           └── expiringContracts: filtra CONTRATOS com dataVigenciaFim ≤ 90 dias
 │               (Atas entram só como contagem total/ativas — NÃO geram item de ação)
 │
 └── useCentralPrazosData('200331')
       └── centralPrazosService.ts → buildCentralPrazosItems()
             ├── 1. Processa Contratos: 5 gatilhos temporais (-180/-120/-90/-60/-15d)
             └── 2. Processa Atas (ARP): 1 gatilho — REGRAS_OPERACIONAIS_PADRAO.ARP_VIGENCIA_90D
                   (linhas ~279-333: olha SÓ arp.dataVigenciaFinal; nenhuma leitura de saldo)
             ↓
       centralItems  ──┬──► ImmediateAttentionBanner (banner superior, via centralKpis)
                        └──► ActionableAttentionCenter ("Ações Prioritárias do Setor", top 5)
```

Os dois componentes de UI (`ImmediateAttentionBanner.tsx`, `ActionableAttentionCenter.tsx`) **não têm bug** — eles renderizam fielmente o que recebem. Foram lidos por completo e ambos aceitam `items: CentralPrazosItem[]` de forma genérica; o gargalo é inteiramente anterior a eles.

---

## 3. O que a gestora vê vs. o que precisaria ver (simulação de um dia)

| Situação real (mapeada no plano consolidado) | Aparece no painel hoje? | Motivo (com referência de código) |
|---|---|---|
| Contrato a 45 dias do vencimento | ✅ Sim | `centralPrazosService.ts`, gatilhos de contrato |
| Ata a 60 dias do vencimento | ✅ Sim | `ARP_VIGENCIA_90D` |
| Ata com saldo 🔴 esgotado, vigência ainda longe do D-180 | ❌ Não | Nenhuma leitura de saldo em `centralPrazosService.ts` — a ata pode estar juridicamente extinta por escopo (regra do plano, seção 3.2) e o painel mostra "regular" |
| Remanejamento parado há 16 dias, já escalado (`ESTAGNADO`) | ❌ Não | `AtaEventType.REMANEJAMENTO` ainda não existe no domínio (plano, seção 7) |
| Reajuste/repactuação pendente de apostilamento | ❌ Não | Mesmo motivo — nenhum `AtaEvent` modelado |
| Alocação interna (ex: DFNSP) com cota departamental esgotada, mesmo com saldo confortável na UASG como um todo | ❌ Não | `InternalAllocation`/`calculateSaldoAlocado` (`balanceService.ts`) existem e funcionam, mas nunca são lidos por `centralPrazosService.ts` |
| Contrato sem `tipoInstrumento` classificado (Termo vs. substitutivo art. 95) | ❌ Não | Campo ainda não existe no schema |

---

## 4. Diagnóstico: por que isso é um problema de arquitetura, não de tela

Em termos de gestão ágil: o painel funciona como um Kanban corretamente desenhado (cor, prioridade, ação de um clique) de um **backlog incompleto**. Um item que não vira card no backlog não compete por atenção — não é adiado, é invisível. Isso quebra a premissa central do plano consolidado (seção 5): "backlog priorizado por urgência objetiva" só funciona se **tudo** que é urgente estiver nele.

O dado em si não está perdido — `Empenho`, `InternalAllocation` e a fórmula de saldo (`balanceService.ts`) já existem e são coerentes (ver `PLANO_GESTAO_ATA_LEI14133_CONSOLIDADO.md`, seção 4.1). O gargalo é estritamente que **`centralPrazosService.ts` nunca lê essas fontes** — ele foi construído (Fase 3) antes de as regras de saldo/remanejamento/aditivo de valor terem sido mapeadas (Fase atual).

---

## 5. Os 4 gatilhos que faltam em `centralPrazosService.ts`

Nomeando no mesmo padrão dos gatilhos existentes (`ARP_VIGENCIA_90D`), para adição futura na função que processa Atas (seção "2. Processar Atas de Registro de Preços (ARP)", linha ~279):

| Gatilho proposto | Dispara quando | Fonte de dado (já existe) |
|---|---|---|
| `ARP_SALDO_CRITICO` | Farol de saldo do item/unidade em 🟠 ou 🔴 (plano, seção 4) | `balanceService.ts` (fórmula de saldo por empenho) |
| `ARP_REMANEJAMENTO_ATIVO` | Existe `AtaEvent` tipo `REMANEJAMENTO` em `EM_NEGOCIACAO` ou `ESTAGNADO` | A criar — depende de `AtaEvent` (plano, seção 7) |
| `ARP_APOSTILAMENTO_PENDENTE` | Reajuste/repactuação/reequilíbrio solicitado, sem apostila/aditivo formalizado | A criar — mesmo motivo |
| `ALOCACAO_INTERNA_CRITICA` | `calculateSaldoAlocado` de algum departamento em estado crítico, mesmo com a UASG agregada regular | `balanceService.ts`/`allocationService.ts` (já existem, só não são consultados aqui) |

Os dois primeiros da lista (`ARP_SALDO_CRITICO`, `ALOCACAO_INTERNA_CRITICA`) são implementáveis **hoje**, sem esperar a arquitetura `AtaEvent` completa — a fonte de dado já existe. Os outros dois dependem do domínio de eventos de Ata ainda não criado.

---

## 6. Recomendação de ordem

1. `ARP_SALDO_CRITICO` e `ALOCACAO_INTERNA_CRITICA` primeiro — maior impacto, menor custo (dado já existe, só falta a leitura em `centralPrazosService.ts`).
2. `AtaEvent`/`AtaWorkflow` (plano consolidado, seção 7) — pré-requisito para `ARP_REMANEJAMENTO_ATIVO` e `ARP_APOSTILAMENTO_PENDENTE`.
3. Só então revisitar a UI (`ActionableAttentionCenter.tsx`) — hoje ela já está pronta para receber mais tipos de `entidadeOrigem`, mas vale confirmar iconografia/cor por tipo quando os 4 gatilhos existirem.

Nada disso foi implementado nesta auditoria — fica registrado para decisão de prioridade nas próximas sessões.
