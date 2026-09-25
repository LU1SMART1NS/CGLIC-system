# FASE 9-D0 — AUDITORIA DO FUNIL ÚNICO DE ATENÇÃO

> **Status:** CONCLUÍDO COM GO  
> **Data:** 24 de Setembro de 2026  
> **Escopo:** Auditoria e Mapeamento Arquitetural do Funil Único de Atenção do SaldoARP  
> **Regra Fundamental:** Zero alteração de código de produção, zero migrations, zero RPCs, zero tabelas e zero views.

---

## 1. RESUMO EXECUTIVO

A auditoria da **FASE 9-D0** avaliou a cadeia completa de atenção e detecção de anomalias/eventos do SaldoARP. O objetivo central foi mapear de ponta a ponta como os fatos operacionais, financeiros, contratuais e temporais são detectados, como são promovidos a alertas ou tarefas, como chegam ao Dashboard Gerencial e à Central de Atenção/Prazos, e como o gestor é direcionado para o respectivo plano de ação (drill-down).

### Principais Conclusões:
1. **SSOTs Estáveis e Homologados:** O SaldoARP possui 100% dos seus fatos canônicos ancorados em fontes únicas de verdade (SSOTs) sem conflitos ou duplicações (`public.contratos`, `public.itens_ata`, `public.empenhos`, `public.contract_tasks`, `public.contract_events`, `public.ata_events`).
2. **Separação Rigorosa de Camadas:** A arquitetura preserva a distinção essencial entre:
   $$\text{Fato Oficial (SSOT)} \longrightarrow \text{Detecção/Projeção} \longrightarrow \text{Alerta Efêmero} \longrightarrow \text{Tarefa Persistida} \longrightarrow \text{Workflow Formal} \longrightarrow \text{Notificação}$$
3. **Auditoria dos 4 Achados Históricos:**
   - `ARP_SALDO_CRITICO`: **HOMOLOGADO na Fase 8** via `dashboardService.ts` / `v_arp_item_saldo_detalhado`. Classificado como *GAP DE INTEGRAÇÃO* com a `centralPrazosService.ts` (unificação do funil).
   - `ALOCACAO_INTERNA_CRITICA`: **GAP DE REGRA & INTEGRAÇÃO**. O SSOT existe (`arp_allocations`), mas não há projeção de threshold para órgãos/departamentos específicos.
   - `ARP_REMANEJAMENTO_ATIVO`: **GAP DE DOMÍNIO/DADO**. O fato formalizado existe em `ata_events`, mas não há workflow/solicitação prévia intermediária ("Fato $\neq$ Ação").
   - `ARP_APOSTILAMENTO_PENDENTE`: **GAP DE DOMÍNIO**. Apostilamento de Ata é evento formal (`ata_events`), sem pipeline de instrução prévia implementado para Atas (existe apenas para contratos).

---

## 2. MAPA DE MOTORES E SERVIÇOS DE DETECÇÃO EXISTENTES

| Serviço / Motor | Responsabilidade Primária | SSOT Consultado | Tipo de Detecção |
| :--- | :--- | :--- | :--- |
| `temporalEngineService.ts` | Análise temporal pura de vigência, reajustes, garantias e prazos regulatórios | `public.contratos`, `public.itens_ata` | Computação determinística de datas e marcos |
| `contractProrrogationService.ts` | Detecção de tempestividade de renovação e regras de prorrogação (Art. 106/107) | `public.contratos`, `contract_tasks` | Tempestividade (Tempestivo, Risco, Intempestivo) |
| `contractReajusteRadarService.ts` | Monitoramento da janela anual de reajuste (IPC-A/IGP-M/IPCA/FIPE) | `public.contratos`, `contract_events` | Janela de aniversário contratual |
| `paymentFollowUpService.ts` | Fluxo operacional de atesto, liquidação e pagamento de faturas | `public.contract_tasks` (`PAYMENT_ORDER`) | SLA de etapas operacionais e atrasos |
| `financialExecutionService.ts` | Execução financeira oficial e saldos empenhados/liquidados/pagos | `public.empenhos`, `v_empenhos_resumo` | Empenho sem liquidação, divergência orçamentária |
| `balanceService.ts` | Saldo físico quantitativo de Atas de Registro de Preços | `v_arp_item_saldo_detalhado`, `itens_ata` | Saldo físico esgotado ou próximo do fim |
| `allocationService.ts` | Controle de cotas e distribuição entre unidades participantes | `public.arp_allocations` | Saldo alocado vs empenhado por unidade |
| `dashboardService.ts` | Consolidação do Read Model Executivo e Atenção Agora | Agregação dos serviços canônicos acima | Regras de criticidade, alertas globais e KPIs |
| `centralPrazosService.ts` | Visão temporal unificada e agenda consolidada | `temporalEngineService`, `contract_tasks` | Alertas temporais e vencimentos |

---

## 3. MATRIZ COMPLETA DO FUNIL DE ATENÇÃO

| Situação Auditada | SSOT Canônico | Serviço de Detecção | Gera Alerta? | Gera Tarefa? | Exibe na Home? | Exibe na Central de Atenção? | Destino Drill-down |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Vigência Crítica Contratual (<60d)** | `public.contratos` | `temporalEngineService` / `contractProrrogationService` | Sim | Sim (Workflow) | Sim (`itemsCriticos`) | Sim (`CentralPrazos`) | Contrato 360° $\to$ Prorrogações |
| **Janela de Reajuste Aberta** | `public.contratos` / `events` | `contractReajusteRadarService` | Sim | Não (Op.) | Sim (`reajustesPendentes`) | Sim (`ReajusteRadar`) | Contrato 360° $\to$ Reajustes |
| **Pagamento Atrasado (>30d)** | `public.contract_tasks` | `paymentFollowUpService` | Sim | Sim (`task`) | Sim (`pagamentosCriticos`) | Sim (`FaturamentoPagamentos`) | Módulo Pagamentos / Tarefa |
| **Item ARP com Saldo $\ge 85\%$** | `v_arp_item_saldo_detalhado` | `dashboardService.calculateArpSummary` | Sim | Não (Físico) | Sim (`ManagementArpBalances`) | Parcial (GAP) | Ata Detalhe $\to$ Saldos |
| **Item ARP Próximo do Limite (70–85%)** | `v_arp_item_saldo_detalhado` | `dashboardService.calculateArpSummary` | Sim (Info) | Não | Sim (`ManagementArpBalances`) | Não | Ata Detalhe $\to$ Saldos |
| **Empenho não Liquidado (>60d)** | `public.empenhos` | `financialExecutionService` | Sim | Não | Sim (`FinancialExecutionSection`) | Não | Contrato 360° $\to$ Financeiro |
| **Tarefa Operacional Vencida** | `public.contract_tasks` | `paymentFollowUpService` / `taskService` | Sim | Sim | Sim (`ManagementAttentionSection`) | Sim | Minhas Tarefas / Detalhe |
| **Alocação Interna Órgão $\ge 85\%$** | `public.arp_allocations` | `allocationService` | Não (GAP) | Não | Não (GAP) | Não (GAP) | Gestão de Alocações |
| **Remanejamento Solicitado** | *Sem tabela de workflow* | N/A | Não (GAP) | Não | Não | Não | Atas / Eventos |
| **Apostilamento Ata Pendente** | `public.ata_events` | N/A | Não (GAP) | Não | Não | Não | Atas / Eventos |

---

## 4. AUDITORIA DETALHADA DOS 4 ACHADOS HISTÓRICOS

### 4.1. `ARP_SALDO_CRITICO`
- **Diagnóstico:** O SaldoARP **JÁ IMPLEMENTOU E HOMOLOGOU** a detecção de saldo crítico na Fase 8.
- **Implementação:** `dashboardService.ts` calcula `isCritico` ($\ge 85\%$) e `isProximoLimite` ($70\%-85\%$) consumindo `v_arp_item_saldo_detalhado`.
- **Classificação:** `GAP DE INTEGRAÇÃO`.
- **Ação:** No frontend da Home Gerencial 3.0, integrar o bloco de alertas de ARP ao funil unificado visual de Atenção Agora.

### 4.2. `ALOCACAO_INTERNA_CRITICA`
- **Diagnóstico:** O SaldoARP possui o modelo `arp_allocations`, mas o cálculo de saturação é apenas reativo (consultado sob demanda).
- **Classificação:** `GAP DE REGRA E INTEGRAÇÃO`.
- **Ação Futura (Fase de Regras/Serviços):** Adicionar projeção `isCotaCritica` no `allocationService` para alimentar a Central de Atenção quando uma unidade atingir $\ge 85\%$ de sua cota atribuída.

### 4.3. `ARP_REMANEJAMENTO_ATIVO`
- **Diagnóstico:** Remanejamentos são gravados em `ata_events` após formalizados. Não existe entidade para gerenciar a solicitação prévia aberta em instrução.
- **Classificação:** `GAP DE DOMÍNIO / DADO`.
- **Ação:** Preservar a regra *"Fato $\neq$ Ação"*. Não inventar alertas baseados em fatos já consumados. Manter como backlog para expansão de workflows de ARP.

### 4.4. `ARP_APOSTILAMENTO_PENDENTE`
- **Diagnóstico:** Não há fila de instrução processual para apostilamento de Ata (diferente de Contratos, que possui `contractAmendmentWorkflowService`).
- **Classificação:** `GAP DE DOMÍNIO`.
- **Ação:** Manter fora do funil operacional imediato até que um workflow formal de instrução de Ata seja especificado.

---

## 5. REGRAS DE ISOLAMENTO E DEDUPLICAÇÃO DE ALERTAS

1. **Alerta Efêmero $\neq$ Tarefa Persistida:** Alertas de atenção visual na Home são projeções puras em memória a partir do Read Model. Eles nunca gravam no banco de dados e são atualizados a cada reload/refresh.
2. **Deduplicação Contratual:** Um contrato que possua simultaneamente 3 itens de risco (ex: prorrogação crítica + reajuste aberto + fatura atrasada) deve aparecer como **1 card de contrato** com tags discriminadas, evitando poluição visual 3x no funil executivo.
3. **Escopo por Perfil (RBAC):**
   - *Gestor Geral / Direção:* Visão global consolidada (todos os contratos e todas as atas).
   - *Fiscal / Gestor Setorial:* Visão restrita aos contratos e tarefas sob sua responsabilidade direta (`usuario_id` ou unidade de lotação).

---

## 6. DIRETRIZES PARA A HOME GERENCIAL 3.0 (FASE 9-D)

1. **Funil Unificado Visual:** A Home Gerencial 3.0 apresentará os 4 grandes blocos de atenção integrados:
   - Bloco 1: Contratos e Vigências Críticas (`itemsCriticos`);
   - Bloco 2: Janelas de Reajuste Ativas (`reajustesPendentes`);
   - Bloco 3: Faturas e Pagamentos Atrasados (`pagamentosCriticos`);
   - Bloco 4: Itens de ARP com Saldo Esgotando (`itensConsumoCritico`).
2. **Sem Regras de Negócio no Frontend:** Todos os dados devem ser consumidos diretamente do `ManagementDashboardReadModel` provido pelo `dashboardService.ts`.
3. **Drill-Down com 1 Clique:** Cada item do funil de atenção deve direcionar exatamente para a aba correta do Contrato 360°, da Ata ou da Central de Pagamentos.

---

## 7. VERIFICAÇÃO DE INTEGRIDADE DA BASELINE

- **Testes:** 868/868 testes PASS (99 test suites)
- **TypeScript:** PASS (`npx tsc -b` sem erros)
- **Lint:** PASS (`npm run lint` limpo)
- **Build:** PASS (`npm run build` bem-sucedido)
- **Database/Migrations:** 0 migrations, 0 tabelas novas, 0 RPCs, 0 views.

---

**STATUS: GO — FASE 9-D0 AUDITORIA DO FUNIL CONCLUÍDA**
