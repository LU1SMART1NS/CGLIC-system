# FASE 7.5-C3 — CENTRAL DE ATENÇÃO: RADAR DE REAJUSTE / REPACTUAÇÃO

## STATUS: CONCLUÍDO COM SUCESSO (VEREDITO: GO)
**Data:** 24 de Setembro de 2026  
**Baseline de Testes:** 776 / 776 testes PASS (88 suites de teste)  
**TypeScript (tsc):** PASS (0 erros)  
**ESLint:** PASS (0 erros/avisos)  
**Build:** PASS  
**Estrutura de Banco:** 0 novas tabelas | 0 migrations | 0 RPCs  

---

## 1. OBJETIVO DA FASE

Implementar com precisão cirúrgica e rigor determinístico o **Radar Preditivo de Reajuste e Repactuação** na Central de Atenção (`ContractAttentionCenter.tsx`), permitindo que a equipe de gestão e fiscalização contratual visualize proativamente contratos que se aproximam da janela temporal de 12 meses (aniversário anual) para instrução administrativa.

---

## 2. PRINCÍPIOS E REGRAS ESTRUTURAIS

1. **Radar Operacional, Não Decisão Jurídica:**
   - O radar **não** decide se há direito líquido a reajuste ou repactuação.
   - O radar **não** aplica índices ou percentuais automaticamente.
   - O radar **não** cria tarefas compulsórias no banco de dados.
   - O radar apenas **alerta e orienta** a necessidade de verificação administrativa (índice oficial divulgado, CCT homologada, planilha de custos e formação de preços).

2. **Hierarquia Canônica de Data-Base:**
   - Prioridade 1: Data do último evento formal de Reajuste/Repactuação registrado na timeline (`dataUltimoReajuste`).
   - Prioridade 2: Data-base da proposta ou orçamento estimado (`dataBaseProposta`).
   - Prioridade 3: Data de assinatura do contrato (`dataAssinatura`).
   - Prioridade 4 (Fallback): Data de início da vigência (`dataVigenciaInicio`).

3. **Janela Operacional e Níveis de Gravidade:**
   - Ativação apenas para marcos dentro de 60 dias (`diasRestantes <= 60`).
   - `PROXIMA`: de 31 a 60 dias restantes (Badge Azul).
   - `URGENTE`: de 1 a 30 dias restantes (Badge Âmbar/Laranja).
   - `HOJE`: 0 dias restantes (Badge Vermelho).
   - `VENCIDA`: < 0 dias restantes (marco atingido sem reajuste formal registrado — Badge Vermelho Escuro/Bordô).

4. **Chave Determinística Idempotente:**
   - Formato padronizado: `ALERT::ANIVERSARIO_REAJUSTE::{contractKey}::{ciclo}`.
   - Exemplo: `ALERT::ANIVERSARIO_REAJUSTE::CONTRATO::123456::00010::2026::ANO_1`.

---

## 3. ARQUIVOS CRIADOS E MODIFICADOS

### Novos Arquivos:
1. `src/types/contractReajusteRadar.ts`:
   - Definição dos tipos `ReajusteRadarPriorityLevel`, `ReajusteRadarOrigemDataBase`, e interface `ReajusteRadarAlert`.
2. `src/services/contractReajusteRadarService.ts`:
   - Motor puro de cálculo determinístico de marcos anuais (`evaluateContractReajusteRadar`, `generateReajusteRadarAlertId`, `addYears`).
3. `src/services/__tests__/contractReajusteRadarService.test.ts`:
   - 12 testes unitários exaustivos cobrindo precedência de data-base, janelas de 60/30/0/dias negativos, avanço de ciclo pós-evento e múltiplos ciclos.
4. `src/components/contracts/__tests__/ContractAttentionCenterRadar.test.tsx`:
   - 4 testes de integração de componentes cobrindo renderização, badges de severidade, texto orientativo e isolamento de contratos sem marco no horizonte.

### Arquivos Modificados:
1. `src/types/index.ts`:
   - Exportação unificada dos tipos de `contractReajusteRadar`.
2. `src/components/contracts/ContractAttentionCenter.tsx`:
   - Integração do radar na lista de alertas da Central de Atenção com badges estilizados, nota orientativa institucional e link de navegação rápida para a timeline.

---

## 4. AUDITORIA DE INTEGRIDADE ARQUITETURAL

- **SSOT Financeira:** `public.empenhos` 100% inalterada.
- **Saldo de Ata/ARP:** 100% preservado e isolado de desvios contábeis.
- **M16/M17/M18:** Regras estritas de integridade de saldo preservadas.
- **Isolamento de Estado:** 100% em memória / Read Model puro em React/TypeScript sem overhead de persistência.

---

## 5. RESULTADO DA VALIDAÇÃO FORMAL

```text
======================================================================
FASE 7.5-C3 — CENTRAL DE ATENÇÃO: RADAR DE REAJUSTE / REPACTUAÇÃO
======================================================================
Suites de Testes: 88 passed (88 total)
Testes Unitários/Integração: 776 passed (776 total)
TypeScript Compiler (tsc -b): 0 erros
ESLint: 0 erros / 0 avisos
Vite Production Build: 100% PASS
Alterações no Banco de Dados: 0 migrations, 0 tabelas, 0 RPCs
======================================================================
VEREDITO: GO (Aprovado sem pendências)
======================================================================
```
