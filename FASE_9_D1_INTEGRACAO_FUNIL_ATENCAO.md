# FASE 9-D1 — INTEGRAÇÃO DO FUNIL ÚNICO DE ATENÇÃO

> **Status:** CONCLUÍDO COM GO  
> **Data:** 24 de Setembro de 2026  
> **Escopo:** Integração de `ARP_SALDO_CRITICO` ao Funil Central de Atenção, Auditoria Técnica de Alocação Interna, Deduplicação Determinística, Suíte de Testes e Preservação de SSOTs.  
> **Regra Fundamental:** Zero migrations, zero tabelas novas, zero RPCs e zero views.

---

## 1. RESUMO EXECUTIVO

A **FASE 9-D1** integrou o sinal de **Saldo Físico Crítico de Ata de Registro de Preços (`ARP_SALDO_CRITICO`)** ao Funil Único de Atenção do SaldoARP, conectando a regra canônica já homologada na Fase 8 (`percentualConsumo >= 85%`) aos motores centrais de atenção (`centralPrazosService.ts`, `dashboardService.ts` e componente `ManagementAttentionNow.tsx`).

### Entregas Realizadas:
1. **Integração de `ARP_SALDO_CRITICO`**: Reutilização estrita da fórmula canônica sem duplicação no frontend ou criação de fórmulas paralelas.
2. **Semântica `ARP_SALDO_CRITICO = ALERTA`**: Alerta efêmero em memória baseado em projeção pura do Read Model; nenhuma tarefa, workflow ou notificação externa foi criada automaticamente.
3. **Deduplicação Determinística Rigorosa**: Identificadores canônicos determinísticos (`ATT-ARP-ITEM-${itemKey}` e `ARP::${itemKey}::SALDO_CRITICO::GATILHO_85PCT::SALDO`) garantem que o mesmo item nunca apareça duplicado.
4. **Drill-Down Funcional**: Redirecionamento contextual para a Ata (`#/atas/${numeroAta}` / `onNavigateAta`) ou Contrato 360° vinculado quando aplicável.
5. **Auditoria Técnica Completa de Alocação Interna**: Mapeamento estrutural do domínio e registro do `GAP — NECESSITA DEFINIÇÃO DE REGRA`.
6. **Preservação Canônica de Domínio**: Confirmação expressa de que remanejamento pendente e apostilamento pendente de Ata não foram artificialmente inferidos ("Fato $\neq$ Ação").

---

## 2. ARQUIVOS MODIFICADOS E CRIADOS

| Arquivo | Tipo | Alteração Realizada |
| :--- | :---: | :--- |
| `src/services/centralPrazosService.ts` | Backend / Serviço | Suporte a `arpItems` em `BuildCentralPrazosOptions` e geração determinística de gatilhos operacionais (`GATILHO_OPERACIONAL`) com explicabilidade para itens com consumo físico $\ge 85\%$. |
| `src/services/dashboardService.ts` | Backend / Serviço | Formatação padronizada e deduplicação determinística rigorosa de itens no bloco `calculateAttentionSummary`. |
| `src/components/dashboard/ManagementAttentionNow.tsx` | Frontend / UI | Propagação de `onNavigateAta`, renderização do botão "Ver Ata" para sinais de ARP sem contrato direto e suporte a drill-downs duplos. |
| `src/services/__tests__/funnelAttentionIntegration.test.ts` | Testes | 11 cenários de teste cobrindo todas as faixas percentuais, criticidade, deduplicação, drill-down e isolamento físico/financeiro. |
| `FASE_9_D1_INTEGRACAO_FUNIL_ATENCAO.md` | Documentação | Relatório de homologação técnica da fase. |

---

## 3. ESPECIFICAÇÃO DA REGRA E CHAVES DETERMINÍSTICAS

### 3.1. Regra Canônica Reutilizada
$$\text{Consumo Físico (\%)} = \left(\frac{\text{Quantidade Empenhada}}{\text{Quantidade Homologada}}\right) \times 100$$
- **Classificação:**
  - $\ge 85\%$: **CRÍTICO / URGENTE** (gera sinal no Funil de Atenção Agora);
  - $70\% \le \text{Consumo} < 85\%$: **PRÓXIMO AO LIMITE** (informativo na seção de ARP, sem poluir o radar crítico imediato);
  - $< 70\%$: **REGULAR**.

### 3.2. Chaves de Idempotência e Deduplicação
- **Central de Prazos:** `ARP::{itemKey}::SALDO_CRITICO::GATILHO_85PCT::SALDO`
- **Atenção Agora (Dashboard):** `ATT-ARP-ITEM-{itemKey}`
- Onde `itemKey` canônico é `{numeroAta}-{codigoUasg}-{numeroItem}`.

---

## 4. AUDITORIA TÉCNICA: ALOCAÇÃO INTERNA DE COTAS (`ALOCACAO_INTERNA_CRITICA`)

### 4.1. Diagnóstico Estrutural do Modelo Existente
- **SSOTs Envolvidos:** `public.arp_allocations`, `public.empenho_links`, `allocationService.ts`.
- **Grandezas Existentes:**
  - `allocatedQty`: Quantidade física alocada para a unidade departamental (ex: DTI, CGP, DIREF);
  - `empenhadaQty`: Quantidade física já empenhada com vínculo a essa unidade;
  - $\text{Saldo da Cota} = \text{allocatedQty} - \text{empenhadaQty}$;
  - $\text{Percentual de Consumo da Cota} = \left(\frac{\text{empenhadaQty}}{\text{allocatedQty}}\right) \times 100$.
- **Unidade de Medida:** Físico-quantitativa (unidades, caixas, postos, licenças), herdada do item da Ata (zero moeda R$).
- **Escopo e Limites:** A soma de todas as cotas departamentais ($\sum \text{allocatedQty}$) é restrita pela `quantidadeHomologada` do item.

### 4.2. Proposta Objetiva de Regra Futura
$$\text{Cota Crítica} \iff \text{Percentual Consumo Cota} \ge 85\% \quad \text{OU} \quad \text{Saldo da Cota} \le \text{Threshold Mínimo}$$

### 4.3. Motivo do Não-Acionamento Imediato
> **Classificação:** `GAP — NECESSITA DEFINIÇÃO DE REGRA`.  
> Não existe norma regulatória ou diretriz operacional homologada definindo se uma cota departamental em 85% deve bloquear novos pedidos ou se deve apenas disparar remanejamento interno. A implementação foi suspensa em conformidade com o princípio de não inventar regras jurídicas.

---

## 5. CONFIRMAÇÃO: REMANEJAMENTO E APOSTILAMENTO NÃO INFERIDOS

1. **Remanejamento de Ata:**
   - O sistema registra formalmente `AtaEventType = 'REMANEJAMENTO'` na tabela `public.ata_events`.
   - **Nenhum** estado artificial de "Remanejamento Estagnado" ou "Atrasado" foi inferido.
   - *Necessário para implementação futura:* Criação de workflow de instrução de remanejamento (solicitação, concordância entre unidades, análise jurídica e publicação).
2. **Apostilamento de Ata:**
   - O sistema registra o evento formal após concluído.
   - **Nenhum** alerta de "Apostilamento Pendente" foi inferido a partir da ausência de evento.
   - *Necessário para implementação futura:* Módulo formal de instrução processual de apostilamento para Atas (análogo ao `contractAmendmentWorkflowService` de Contratos).

---

## 6. IMPACTO NO DASHBOARD E FUTURA HOME 3.0

- **Preservação 100% do Dashboard Gerencial:** A seção de Saldos de ARP (`ManagementArpBalances.tsx`) e a seção Atenção Agora (`ManagementAttentionNow.tsx`) continuam operando de forma integrada e sem conflitos.
- **Preparação para Home Gerencial 3.0:** O read model consolidado agora já expõe os 4 eixos unificados de atenção:
  1. Contratos em vigência crítica;
  2. Janelas de reajuste contratual abertas;
  3. Faturas e pagamentos com atraso/prazo crítico;
  4. Itens de Ata com saldo quantitativo $\ge 85\%$.

---

## 7. RESULTADOS DA VALIDAÇÃO TÉCNICA

| Verificação | Comando | Resultado |
| :--- | :--- | :---: |
| **Suíte de Testes** | `npm test -- --run` | **PASS** (879/879 testes em 100 suítes) |
| **Checagem de Tipos** | `npx tsc -b` | **PASS** (0 erros) |
| **Linter** | `npm run lint` | **PASS** (0 erros) |
| **Build de Produção** | `npm run build` | **PASS** (gerado com sucesso) |
| **Banco de Dados** | Análise de Schema | **INTACTO** (0 migrations, 0 tabelas, 0 RPCs, 0 views) |

---

**STATUS: GO — FASE 9-D1 INTEGRAÇÃO DO FUNIL CONCLUÍDA**
