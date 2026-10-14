# FASE 7.5-C1 — IMPLEMENTAÇÃO DO READ MODEL DE EVOLUÇÃO DO VALOR CONTRATUAL

**Data:** 2026-09-24  
**Status:** CONCLUÍDO E HOMOLOGADO  
**Veredito:** GO  
**Baseline de Testes:** 754/754 PASS (+14 novos testes unitários, 85 arquivos de teste)  
**TypeScript / Lint / Build:** 100% PASS (0 erros)  
**Integridade do Banco:** 0 novas tabelas | 0 migrations | 0 novas RPCs (M16/M17/M18 intactas)

---

## 1. OBJETIVO

Implementar o **Read Model de Evolução do Valor Contratual** ([`ContractValueEvolutionReadModel`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/contractValueEvolution.ts)) e seu serviço de projeção pura em memória ([`contractValueEvolutionService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/contractValueEvolutionService.ts)), estabelecendo a base matemática e contábil determinística para a visualização analítica no Contract 360° (Fase 7.5-C2).

---

## 2. ARQUIVOS CRIADOS E ALTERADOS

* **Novos Arquivos:**
  * [`src/types/contractValueEvolution.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/contractValueEvolution.ts): Interfaces do Read Model canônico e dos itens auditáveis de eventos contratuais.
  * [`src/services/contractValueEvolutionService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/contractValueEvolutionService.ts): Funções puras de cálculo de evolução de valor, ordenação determinística, classificação de oficialidade e extração de deltas monetários.
  * [`src/services/__tests__/contractValueEvolutionService.test.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/__tests__/contractValueEvolutionService.test.ts): 14 testes unitários exaustivos cobrindo todos os cenários exigidos.
* **Arquivos Alterados:**
  * [`src/types/index.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/index.ts): Exportação dos novos tipos de evolução do valor contratual.

---

## 3. INTERFACE E MODELO IMPLEMENTADO

```typescript
export interface ContractValueEvolutionEventItem {
  eventoId: string;
  tipoEvento: ContractEventType;
  identificadorOficial: string;
  descricao: string;
  dataEfeito: string;
  impacto: ContractEventImpact;
  impactoMonetario: boolean;
  deltaValor: number;
  valorAnterior: number;
  valorResultante: number;
  instrumento: ContractEventNature;
  oficialidade: OfficialityLevel;
  fonteOrigem: ContractEventSource | string;
  linkPncp?: string;
  processoSeiNumero?: string;
}

export interface ContractValueEvolutionReadModel {
  contractKey: string;
  uasg?: string;
  numeroContrato?: string;
  anoContrato?: number;
  valorOriginal: number;
  valorVigente: number;
  deltaAcumulado: number;
  percentualVariacaoAcumulada: number;
  totalAcrescimos: number;
  totalSupressoes: number;
  totalReajustes: number;
  totalRepactuacoes: number;
  totalReequilibrios: number;
  totalOutrosAditivos: number;
  totalEventosConsiderados: number;
  totalEventosMonetarios: number;
  dataUltimoEventoRelevante?: string;
  eventos: ContractValueEvolutionEventItem[];
}
```

---

## 4. FÓRMULA UTILIZADA

$$\text{ValorVigente} = \text{ValorOriginal} + \sum_{i=1}^{n} \Delta \text{Valor}_i$$

* $\text{ValorOriginal}$: Valor inicial pactuado na celebração (`contract.valorInicial` ou `contract.valorGlobal`).
* $\Delta \text{Valor}_i$: Variação líquida computada a cada evento contratual $i$.
* $\text{DeltaAcumulado} = \text{ValorVigente} - \text{ValorOriginal}$.
* $\text{PercentualVariacaoAcumulada} = \left(\frac{\text{DeltaAcumulado}}{\text{ValorOriginal}}\right) \times 100$.

---

## 5. REGRAS DE SINAIS E MATRIZ DE IMPACTO

| Tipo de Evento | Impacto Monetário | Sinal Aplicado | Tratamento do Delta |
|---|---|---|---|
| `CELEBRACAO` | Base Inicial | `0` | Base já capturada no `valorOriginal`. |
| `REAJUSTE` | Sim | `+` / `-` | Variação líquida do índice contratual. |
| `REPACTUACAO` | Sim | `+` / `-` | Variação dos custos de mão de obra (CCT). |
| `REEQUILIBRIO` | Sim | `+` / `-` | Variação decorrente de álea extraordinária. |
| `ACRESCIMO` | Sim | `+` | $+\|\Delta\text{Valor}\|$ (Acréscimo de até 25%/50%). |
| `SUPRESSAO` | Sim | `-` | $-\|\Delta\text{Valor}\|$ (Supressão de até 25%). |
| `APOSTILAMENTO` | Condicional | `+` / `-` / `0` | Se `ALTERA_VALOR` $\rightarrow \Delta\text{Valor}$; se dotação/fiscal $\rightarrow 0$. |
| `PRORROGACAO` | Condicional | `0` / `+` | Se prorrogação simples $\rightarrow 0$; se aditamento com valor $\rightarrow \Delta\text{Valor}$. |
| `ENCERRAMENTO` | Não | `0` | Efeito de ciclo de vida (`ENCERRADO`). |
| `RESCISAO` | Não | `0` | Efeito de ciclo de vida (`RESCINDIDO`). |

---

## 6. PRECISÃO MONETÁRIA

Para evitar anomalias de ponto flutuante IEEE 754 (ex: $0.1 + 0.2 = 0.30000000000000004$), foi implementada a função pura:
```typescript
export function roundCurrency(val: number): number {
  if (typeof val !== 'number' || isNaN(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}
```
Todos os acumuladores e deltas parciais são mantidos com rigorosa precisão em 2 casas decimais (centavos de real).

---

## 7. ORDENAÇÃO TEMPORAL DETERMINÍSTICA

A função `sortEventsForEvolution(events)` garante ordenação cronológica ascendente estrita:
1. **Data Canônica ASC:** `dataVigenciaEfeito` $\rightarrow$ `dataPublicacao` $\rightarrow$ `dataAssinatura` $\rightarrow$ `capturedAt`.
2. **Prioridade de Tipo:** `CELEBRACAO` precede termos aditivos com a mesma data.
3. **Número Sequencial ASC:** `numeroSequencial` ordinal (ex: 1º Termo Aditivo antes do 2º).
4. **Desempate por ID:** ID determinístico do evento.

---

## 8. TESTES CRIADOS E COBERTURA

Criados 14 testes unitários em [`src/services/__tests__/contractValueEvolutionService.test.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/__tests__/contractValueEvolutionService.test.ts):

1. `Contrato sem eventos`: Projeta `valorOriginal == valorVigente`, delta zero.
2. `Reajuste positivo (+5.43%)`: Atualiza valor vigente e categoriza `totalReajustes`.
3. `Múltiplos reajustes progressivos`: Acumula sequencialmente.
4. `Acréscimo quantitativo de 20%`: Gera delta positivo e categoriza `totalAcrescimos`.
5. `Supressão quantitativa de 10%`: Gera delta negativo e totaliza em `totalSupressoes`.
6. `Combinação complexa de eventos`: Reajuste + Acréscimo + Supressão + Repactuação com cálculo perfeito.
7. `Eventos sem impacto financeiro`: Prorrogação simples e Encerramento sem alteração de valor.
8. `Eventos na mesma data`: Ordenação determinística por sequencial e ID.
9. `Precisão monetária em centavos`: Teste de floating point drift.
10. `Determinismo absoluto`: Resultados idênticos com arrays de entrada desordenados.
11. `Lista vazia / undefined`: Tratamento defensivo sem falhas.
12. `Imutabilidade estrita`: Objetos e arrays congelados (`Object.freeze`) preservados sem mutações.
13. `Derivação de delta via valorPosterior/valorAnterior`: Fallback preciso quando `variacaoValor` for omitido.
14. `Isolamento Arquitetural`: Garantia de não-contaminação de empenhos nem do saldo da Ata.

---

## 9. RESULTADOS DAS VALIDAÇÕES

```text
================================================================================
                    PAINEL DE VALIDAÇÃO — FASE 7.5-C1
================================================================================
Testes Automatizados: 754/754 PASS (85 arquivos de teste em 4.86s)
Testes Unitários 7.5-C1: 14/14 PASS (11ms)
TypeScript Typecheck: PASS (0 erros)
Linter (Oxlint):      PASS (0 erros)
Vite Build:           PASS (636ms)
================================================================================
```

---

## 10. CONFIRMAÇÃO DE ISOLAMENTO E NÃO-CONTAMINAÇÃO

1. **Zero alterações de banco:** 0 novas tabelas, 0 migrations, 0 novas RPCs.
2. **Preservação do Domínio Financeiro:** `public.empenhos`, `v_contrato_empenhos_lastro` e `public.empenho_eventos_historico` permanecem 100% inalterados.
3. **Preservação da Ata:** O saldo quantitativo e físico dos itens da Ata de Registro de Preços não sofre nenhuma interferência.

---

## 11. GAPs RESTANTES PARA AS PRÓXIMAS SUBFASES

* **Fase 7.5-C2:** Integrar o Read Model no componente [`ContractEventsTimeline.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/ContractEventsTimeline.tsx) do Contract 360°.
* **Fase 7.5-C3:** Motor de marco de 1 ano de aniversário e alertas preditivos na Central de Atenção.
* **Fase 7.5-C4:** Guarda de preclusão lógica no workflow de prorrogação.
* **Fase 7.5-C5:** Homologação integrada e testes E2E.

---

### **VEREDITO: GO — READ MODEL HOMOLOGADO COM SUCESSO**
