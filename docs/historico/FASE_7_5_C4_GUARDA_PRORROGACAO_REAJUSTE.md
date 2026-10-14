# FASE 7.5-C4 — GUARDA ASSISTIDA DE PRORROGAÇÃO CONTRATUAL

## STATUS: CONCLUÍDO COM SUCESSO (VEREDITO: GO)
**Data:** 24 de Setembro de 2026  
**Baseline de Testes:** 783 / 783 testes PASS (88 suites de teste)  
**TypeScript (tsc):** PASS (0 erros)  
**ESLint:** PASS (0 erros/avisos)  
**Build:** PASS  
**Estrutura de Banco:** 0 novas tabelas | 0 migrations | 0 RPCs  

---

## 1. OBJETIVO DA FASE

Implementar a **Guarda Assistida de Prorrogação Contratual**, estendendo a avaliação de conformidade e prontidão legal (`evaluateProrrogationReadiness`) para identificar situações em que exista marco temporal ou pedido pendente de reajuste/repactuação antes da celebração de prorrogações contratuais.

A regra estrutural é estritamente:
> **ALERTAR → ORIENTAR → DOCUMENTAR → DECISÃO HUMANA**  
> *(A guarda é assistida, explicativa e NÃO BLOQUEANTE; ela nunca impede a assinatura ou conclusão da prorrogação).*

---

## 2. EXTENSÃO REALIZADA NO READINESS

1. **Tipos Adicionados (`src/types/contractProrrogation.ts`):**
   - `ProrrogationReajusteSituacao`: `'SEM_PENDENCIA' | 'MARCO_PROXIMO' | 'MARCO_ULTRAPASSADO' | 'DADOS_INSUFICIENTES'`.
   - `ProrrogationReajusteReadiness`: interface com `situacao`, `alertaRadarId`, `dataBaseReferencia`, `dataAniversario`, `diasRestantes`, `possuiEventoSubsequente`, `orientacao`, `sugestaoRessalva`.
   - Campo opcional adicionado em `ProrrogationReadinessChecklist`: `reajusteStatus?: ProrrogationReajusteReadiness`.

2. **Extensão de `evaluateProrrogationReadiness` (`src/services/contractProrrogationService.ts`):**
   - Recebe `options?: EvaluateProrrogationReadinessOptions` (`contract`, `events`, `radarAlert`).
   - Reutiliza diretamente o motor temporal da C3 (`evaluateContractReajusteRadar`).
   - Avalia a dimensão de reajuste sem jamais negativar `isProntoParaAssinatura` ou alterar o resultado dos critérios tradicionais (interesse público, manifestação do fornecedor, vantajosidade, regularidade SICAF, parecer CONJUR, tempestividade da vigência).

---

## 3. SITUAÇÕES IDENTIFICADAS

| Situação | Condição | Resultado Assistivo | Sugestão de Ressalva |
| :--- | :--- | :--- | :--- |
| **Situação A — Marco Próximo** | Marco anual nos próximos $\le 60$ dias | Orientação para avaliação administrativa de índices/CCT antes da formalização. | *"Avaliar a necessidade de consignar ressalva na minuta/ato de prorrogação caso haja pedido de reajuste/repactuação em tramitação."* |
| **Situação B — Marco Ultrapassado** | Marco anual transcorrido sem evento registrado posterior | Orientação para verificar eventual pedido formal pendente nos autos. | *"Avaliar a necessidade de consignar ressalva na minuta do Termo Aditivo de Prorrogação para resguardar eventual análise de reajuste/repactuação pendente."* |
| **Situação C — Evento Formalizado** | Reajuste/repactuação posterior devidamente registrado na timeline | `SEM_PENDENCIA` (`possuiEventoSubsequente: true`). Nenhuma pendência artificial gerada. | N/A |
| **Situação D — Dados Insuficientes** | Contrato sem data-base cadastrada | `DADOS_INSUFICIENTES` (`possuiEventoSubsequente: false`). Não inventa pendência impeditiva no checklist. | N/A |

---

## 4. LINGUAGEM ASSISTIVA E PRECLUSÃO LÓGICA

- O sistema **não declara** perda de direito nem afirma categoricamente *"houve preclusão lógica"*.
- A redação é exclusivamente orientativa: *"Verificar eventual pedido de reajuste/repactuação pendente antes da formalização da prorrogação e avaliar a necessidade de consignar ressalva na minuta do Termo Aditivo."*

---

## 5. INTEGRAÇÃO COM O TEMPLATE DE TAREFAS

No catálogo padrão `tpl-prorrogacao-padrao-14133` (`buildDefaultProrrogationTemplate`), foi incluída a tarefa operacional sob a macrotarefa **3. Instrução Processual e Análise Jurídica**:
- **ID:** `task-prorr-6b` (Ordem 7).
- **Nome:** *"Verificar existência de pedidos pendentes de reajuste/repactuação e incluir cláusula de ressalva na minuta quando aplicável"*.
- **Modo de Execução:** `INTERNA`.
- **Sistema Destino:** `SEI`.

---

## 6. AUDITORIA DE INTEGRIDADE ARQUITETURAL

- **SSOT Financeira:** `public.empenhos` 100% inalterada.
- **Saldos de Itens de ARP:** 100% preservados.
- **M16/M17/M18:** Regras e isolamento mantidos.
- **Banco de Dados:** 0 novas tabelas, 0 migrations, 0 RPCs.
- **Workflow de Prorrogação:** Preservado e retrocompatível com todos os testes prévios.

---

## 7. RESULTADO DA VALIDAÇÃO FORMAL

```text
======================================================================
FASE 7.5-C4 — GUARDA ASSISTIDA DE PRORROGAÇÃO CONTRATUAL
======================================================================
Suites de Testes: 88 passed (88 total)
Testes Unitários / Integração: 783 passed (783 total, 0 falhas)
TypeScript Compiler (tsc -b): 0 erros
ESLint: 0 erros / 0 avisos
Vite Production Build: 100% PASS
Alterações no Banco de Dados: 0 migrations, 0 tabelas, 0 RPCs
======================================================================
VEREDITO: GO (Aprovado sem pendências)
======================================================================
```
