# Fase 11-A — Auditoria e Plano de Padronização UX das Telas Restantes

> Objetivo: levar ao restante do sistema o padrão já aplicado em Visão Geral (`/instrumentos`), Carteira de Atas, Carteira de Contratos, Ata 360 e Contrato 360 — **um cartão-herói por instrumento, indicadores clicáveis, abas no endereço, uma única ação de atualização, nada repetido** — e eliminar duplicação de código e de informação.

---

## 1. O padrão de referência

| Elemento | Componente | Regra de UX |
| :--- | :--- | :--- |
| Topo do instrumento | `instrument360/Instrument360Hero` | Identificação, situação, gestor, objeto (com "ver mais"), dados cadastrais e indicadores **num só cartão** |
| Indicadores | `instrument360/HealthStripParts` (`HealthTile`, `HealthTileGrid`, `PendenciasTile`) | Cada número aparece **uma vez**; o tile leva à aba que o detalha |
| Navegação interna | `instrument360/Instrument360Tabs` + `?aba=` | Aba no URL (sobrevive a recarregar/compartilhar) |
| Seções | `Contract360Section` | Título + subtítulo + ações da seção |
| Listas | `carteira/*` (`CarteiraSummaryCards`, `CarteiraPagination`, `CarteiraPrazoPill`, `carteiraStyles`) | Resumo no topo, filtros, tabela paginada, prazo na mesma faixa de cores |
| Cabeçalho de página | `design-system/PageHeader` + `HeaderRefreshAction` | **Um** título e **um** botão de atualizar por página |

---

## 2. Tela de Item da Ata (`/atas/detalhe/:ataKey/itens/:numeroItem`) — gap **Alto**

`src/components/ItemBalances.tsx` tem **2.260 linhas**, ~30 `useState`, abas feitas à mão e centenas de estilos inline. A tela não usa nenhum componente do padrão 360.

### 2.1 Repetições visíveis (conforme a captura)

| Informação | Onde aparece hoje |
| :--- | :--- |
| "Item 00001" | Título da página **e** selo no cartão logo abaixo |
| Quantidade 4.863 un | "Quantidade Original" (cabeçalho), "Quantidade Registrada", "Saldo Calculado", "Saldo Informado na API", cartão "Saldo p/ Empenho" — **5 vezes** |
| Atualizar | "Sincronizar Empenhos" (topo) **e** "Atualizar" (reconciliação) — duas ações para a mesma coisa |
| Descrição do item | Título de 4 linhas que empurra todo o conteúdo para baixo |
| Reconciliação | Cartão inteiro + faixa verde "SALDOS CONSISTENTES" mesmo quando **não há nada a fazer** |

Além disso, a aba "Empenhos" junta duas seções grandes (Contratos celebrados + Notas de empenho), e os estados de carregamento/erro/sem acesso são copiados de `Ata360Page` com estilos inline.

### 2.2 Proposta: "Item 360"

```
┌ Instrument360Hero ───────────────────────────────────────────────┐
│ ← Voltar para a ata            [PNCP Ata] [PNCP Edital] [Sincronizar empenhos] │
│ 📦 Item 00001 · Tablet 10" 8 GB/128 GB…  (ver descrição completa)  [Aceita adesão] │
│ Fornecedor VANGUARDA… · CNPJ · Preço unit. R$ 1.528,80 · Material · Ata 00059/2025 │
│ ┌Saldo p/ empenho┐┌Saldo p/ adesões┐┌Valor disponível┐┌Reconciliação┐ │
│ │4.863 de 4.863  ││9.726 un        ││R$ 7,43 mi      ││✓ Consistente│ │
│ └────────────────┘└────────────────┘└────────────────┘└─────────────┘ │
└──────────────────────────────────────────────────────────────────┘
[Unidades] [Empenhos (n)] [Contratos (n)] [Alocação interna] [Adesões (n)]   ← ?aba=
```

- **Hero único** absorve `ItemBalancesHeader` + `ItemBalancesSummaryCards` + `ItemReconciliationCard`.
- **Reconciliação vira um tile**: verde "Consistente" quando bate; quando diverge, tile em alerta com o delta ("Divergência de 7 un") e clique abre o detalhe (API × manuais × calculado) na aba Empenhos. Nada de faixa grande quando está tudo certo.
- **Uma só ação "Sincronizar empenhos"**, que também recarrega contratos e dados manuais (hoje é o que o "Atualizar" faz).
- **Descrição longa** fica em uma linha, com "ver mais", como o `objeto` do hero.
- **Abas com `Instrument360Tabs` e `?aba=`**. "Empenhos" e "Contratos" passam a ser abas separadas.
- **Divisão do arquivo**: um hook `useItemBalanceData` (busca, cálculos e reconciliação) e um componente por aba (`ItemEmpenhosTab`, `ItemContratosTab`, `ItemAlocacaoTab`, junto com os `UnidadesTab` e `AdesoesTab` que já existem). O alvo é ficar com menos de 300 linhas na página.

---

## 3. Demais telas

| Tela | Gap | Principais problemas | Ação |
| :--- | :---: | :--- | :--- |
| `/pagamentos` (`ManagementPaymentsOverview`, 1.000 l.) | **Alto** | 2º cabeçalho e 2º botão de atualizar sob o `PageHeader`; KPIs, filtros e tabela feitos à mão, sem paginação; mostra nomes internos (`paymentFollowUpService`, nomes de tabela) | Remover o cabeçalho e o botão duplicados; usar `CarteiraSummaryCards`, filtros e paginação da carteira; esconder os nomes técnicos |
| `/empenhos` (`ManagementFinancialExecution`, 807 l.) | **Alto** | Mesmo problema de cabeçalho e botão duplicados; funil e cartões de saldo próprios; banner de sincronização em lote com cores fixas em vez de `AlertCard`; expõe nomes de *views* | Mesma receita de `/pagamentos`; banner com `AlertCard` |
| `/atas/saldos-unidade` | Médio | KPIs, filtros e tabela próprios; selo de vigência que reimplementa `CarteiraPrazoPill` | Padrão Carteira completo |
| `/atas/modelos` e `/contratos/modelos` | Médio / **Alto (código)** | Dois arquivos idênticos de 626 linhas, mais uma 3ª cópia em `ContractTaskTemplatesModal`; uso de `alert`/`confirm` | Um único `TaskTemplatesPage` genérico que recebe os hooks como parâmetro |
| `/admin/departamentos` | **Alto** | `InternalUnitsModal` reimplementa a página inteira; emoji no título; dois `confirm` seguidos | Manter só a página e fazer o modal reutilizar os componentes dela (ou levar para a página) |
| `/admin/usuarios` | Médio | Filtros, tabela, toast e modal próprios; 7 `alert`/`confirm` | Filtros e tabela da carteira; `Modal` e `ConfirmDialog` compartilhados |
| `/admin/perfis` | Baixo | `h2`/`h3` com tamanhos ad hoc | Usar `SectionHeader` |
| Modais (`components/modals/*`) | **Alto** | Não há `Modal` compartilhado; o z-index varia entre 1000, 1100 e 9999; emojis (⚠️ 🔒 ★); `alert()` | Criar `Modal` e `ConfirmDialog` no design-system e migrar todos |

---

## 4. Duplicação de código a consolidar

- **Formatação**: o formato de moeda pt-BR se repete em **13 arquivos**, a data BR em 8, o CNPJ em 3, e números e percentuais em vários outros lugares. Criar `src/utils/format.ts` (`formatCurrency`, `formatCurrencyCompact`, `formatNumber`, `formatPercent`, `formatDateBR`, `formatCnpj`) e reexportar a data canônica de `temporalEngineService`.
- **Situação do pagamento — bug**: `ManagementPaymentsOverview.tsx:52-80` e `ContractPaymentFollowUpSection.tsx:37-45` mapeiam o mesmo status com **rótulos e cores diferentes**. Por exemplo, "Em Instrução" aparece verde numa tela e âmbar na outra. Criar um mapa único (`paymentStatusDisplay.ts`) com variantes do `StatusBadge`.
- **Estados de página** (carregando, erro, não encontrado, sem acesso): copiados em `Ata360Page`, `Contract360Page` e `ItemBalancesRoute`. Criar `InstrumentPageState`.
- **`alert` e `window.confirm`**: trocar por `ConfirmDialog` e toast.

---

## 5. Plano por etapas

| Etapa | Escopo | Entrega | Critério de aceite |
| :--- | :--- | :--- | :--- |
| **11-B Fundação** | `utils/format.ts`, mapa único de status de pagamento, `Modal`, `ConfirmDialog`, `Toast`, `InstrumentPageState` | Componentes com testes; Ata 360 e Contrato 360 já migrados para `InstrumentPageState` | Nenhuma mudança visual nas telas já padronizadas |
| **11-C Item 360** | Seção 2 inteira | Novo hero, abas no URL, `ItemBalances` dividido | Cada número aparece uma vez; um único "Sincronizar"; os testes de `ItemBalancesRoute` passam; homologação no navegador |
| **11-D Execução financeira** | `/pagamentos` e `/empenhos` | Cabeçalho único, resumo, filtros e tabela paginada | Sem 2º cabeçalho nem 2º botão; sem nomes técnicos visíveis |
| **11-E Saldos por unidade** | `/atas/saldos-unidade` | Padrão Carteira | Selo de prazo vindo de `CarteiraPrazoPill` |
| **11-F Modelos e Admin** | Página única de modelos; Departamentos sem o modal duplicado; Usuários | Remoção de cerca de 1.200 linhas duplicadas | Mesmos fluxos, sem `alert`/`confirm` |
| **11-G Modais e acabamento** | Todos os modais no `Modal` compartilhado, sem emoji; `SectionHeader` em Perfis | z-index único e teclado (Esc, foco) consistente | Varredura sem `alert(`, `confirm(` ou emoji em `src/components` |

Cada etapa segue o fluxo habitual do projeto: implementação → testes (`vitest`) → homologação visual no navegador → relatório `FASE_11_X_*`.

---

## 6. Decisões tomadas

1. **Alocação interna fica no Item.** Edição só para admin e gestor de saldos (permissão `allocations.manage` no backend); gestor e leitor só leem. O vínculo empenho→unidade segue a mesma regra. O backend já impõe isso; a tela agora esconde os controles de quem não pode.
2. **"Órgãos participantes" e "Adesões" continuam abas separadas.** São dados e regras diferentes: participantes são as UASGs da ata (saldo por órgão), adesões são caronas de órgãos não participantes (limite próprio). A aba antes chamada "Unidades" passa a se chamar "Órgãos participantes" para não se confundir com as unidades internas da Alocação.
3. **Contratos e empenhos manuais, vínculo de contrato oficial e ajuste de quantidade**: admin e gestor (regra do backend, `has_role`).
4. **Achado:** o gestor de saldos era redirecionado ao clicar em "Ver Saldo" em `/atas/saldos-unidade`, porque a rota do item não o admitia. Corrigido na 11-C.

---

## 7. Andamento

| Etapa | Situação |
| :--- | :--- |
| 11-B Fundação (`utils/format`, status de pagamento único, `Modal`, `ConfirmDialog`, `Toast`, `InstrumentPageState`) | Concluída |
| 11-C Item 360 | Concluída (falta extrair um componente por aba de `ItemBalances.tsx`) |
| 11-D `/pagamentos` e `/empenhos` | Concluída |
| 11-E `/atas/saldos-unidade` | Concluída |
| 11-F Modelos de Gestão, Unidades Internas, Usuários | Concluída |
| 11-G Modais, emojis, `alert`/`confirm` | Concluída; `src/__tests__/uiConventions.test.ts` impede a volta de `alert()`, `window.confirm()`, emojis e overlays próprios |

Pendências conhecidas: extrair as abas de `ItemBalances.tsx`; migrar as demais cópias de formatação de moeda e data (formatos levemente diferentes); validar visualmente no navegador, com login, as telas alteradas.
