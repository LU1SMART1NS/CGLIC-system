# SALDOARP — FASE 4.3A: RELATÓRIO DE IMPLEMENTAÇÃO
## Modelo de Domínio de Alterações Contratuais e Apostilamento

**Data de Conclusão:** 23 de Setembro de 2026  
**Sistema:** SaldoARP 3.0 (SENASP / MJSP)  
**Etapa:** Fase 4.3A (Domínio de Alterações e Apostilamentos)  
**Status:** **CONCLUÍDO E HOMOLOGADO (100% VERDE)**  
**Resultado dos Testes:** 52 arquivos de teste / 413 testes passando (0 falhas)  
**Build de Produção:** Aprovado (`tsc -b && vite build`)  
**Migrations Novas:** **0 (Zero)**

---

## 1. OBJETIVO DA FASE 4.3A

Criar a fundação conceitual e técnica de **Domínio e Serviço Puro de Alterações Contratuais e Apostilamentos** no SaldoARP 3.0, respondendo de forma inequívoca às 8 perguntas fundamentais:
1. **O que aconteceu?** (Descrição formal do evento);
2. **Qual tipo de alteração?** (`ACRESCIMO`, `SUPRESSAO`, `ALTERACAO_QUALITATIVA`, `REAJUSTE`, `REPACTUACAO`, `PRORROGACAO`, `OUTRA_ALTERACAO`);
3. **Qual instrumento formal?** (`TERMO_ADITIVO`, `TERMO_APOSTILAMENTO`, `CONTRATO_INICIAL`, `OUTRO_INSTRUMENTO`);
4. **Qual impacto?** (`ALTERA_VALOR`, `ALTERA_QUANTITATIVO`, `ALTERA_VIGENCIA`, `ATUALIZA_DADOS`, `SEM_IMPACTO_FINANCEIRO_TEMPORAL`);
5. **Qual ciclo?** (`cycleRef` vinculado deterministicamente);
6. **Qual fonte?** (`PNCP`, `Contratos.gov.br`, `SEI`, `SaldoARP`);
7. **Qual evento oficial?** (`identificadorOficial`, ex: "1º Termo Aditivo");
8. **Qual informação ainda é apenas administrativa/proposta?** (Classificação estrita de `FATO_OFICIAL` vs. `DECISAO_INTERNA` vs. `PROPOSTA_ADMINISTRATIVA`).

---

## 2. DIAGNÓSTICO E PRESERVAÇÃO ARQUITETURAL

* **FATO OFICIAL ≠ EVENTO ≠ WORKFLOW ≠ TAREFA:** A camada de domínio implementada atua exclusivamente como modelagem de fatos e entidades de alteração, sem criar workflows, automações ou tarefas paralelas.
* **TERMO ADITIVO ≠ APOSTILAMENTO:** Diferenciação ontológica estrita entre atos bilaterais que alteram o encargo/objeto e atos unilaterais registrais da Administração.
* **INTENÇÃO ≠ PROPOSTA ≠ DECISÃO ≠ FATO OFICIAL:** Preservação estrita dos níveis de oficialidade.
* **Zero Duplicações:** Reutilização direta de `contractEvents.ts`, `calculateAditamentoLimits`, `temporalEngineService` e `generateIdempotentEventId`.

---

## 3. MODELO CRIADO (`src/types/contractAmendments.ts`)

| Tipo / Interface | Descrição e Finalidade |
| :--- | :--- |
| **`AmendmentCategory`** | `QUANTITATIVA`, `QUALITATIVA`, `ECONOMICA`, `TEMPORAL`, `ADMINISTRATIVA`, `OUTRA` |
| **`AmendmentType`** | `ACRESCIMO`, `SUPRESSAO`, `ALTERACAO_QUALITATIVA`, `REAJUSTE`, `REPACTUACAO`, `PRORROGACAO`, `OUTRA_ALTERACAO` |
| **`AmendmentInstrument`** | `TERMO_ADITIVO`, `TERMO_APOSTILAMENTO`, `CONTRATO_INICIAL`, `OUTRO_INSTRUMENTO` |
| **`InstrumentCompatibilityResult`** | Status (`COMPATIVEL`, `INCOMPATIVEL`, `REQUER_ANALISE`, `NAO_DETERMINADO`), justificativa e fundamentação legal |
| **`AmendmentValueEvolution`** | Rastreabilidade de valores: `valorOriginal`, `valorVigenteAnterior`, `valorProposto`, `valorAprovado`, `valorResultante`, variações |
| **`AmendmentOfficialityClassification`**| Nível (`FATO_OFICIAL`, `DECISAO_INTERNA`, `PROPOSTA_ADMINISTRATIVA`, `DADO_INTERNO`), fonte soberana e explicabilidade |
| **`ReajusteMetadata`** | Data-base da proposta, último reajuste, índice pactuado, periodicidade, cláusula contratual |
| **`RepactuacaoMetadata`** | Regime de mão de obra (DEMO), CCT, registro MTE, data-base, preclusão lógica, composição de custos |
| **`ApostilamentoMetadata`** | Objeto, dotação orçamentária, gestor/fiscal, retificação de erro material |
| **`ContractAmendmentDomain`** | Entidade canônica agregada de alteração contratual |

---

## 4. MATRIZ DE COMPATIBILIDADE DE INSTRUMENTOS (`evaluateInstrumentCompatibility`)

Conforme a Lei nº 14.133/2021 (arts. 124, 135 e 136):

| Tipo de Alteração | Instrumento Formal | Status de Compatibilidade | Fundamento / Justificativa | Exige Parecer CONJUR? |
| :--- | :--- | :---: | :--- | :---: |
| **Acréscimo** | `TERMO_ADITIVO` | `COMPATIVEL` | Art. 124, I, "b". Acréscimo bilateral de objeto/valor. | **SIM** |
| **Acréscimo** | `TERMO_APOSTILAMENTO`| `INCOMPATIVEL` | Nulo por simples apostila (altera encargo das partes). | **SIM** |
| **Supressão** | `TERMO_ADITIVO` | `COMPATIVEL` | Art. 124, I, "b" c/c Art. 126. | **SIM** |
| **Supressão** | `TERMO_APOSTILAMENTO`| `INCOMPATIVEL` | Supressão exige Termo Aditivo formal. | **SIM** |
| **Alt. Qualitativa** | `TERMO_ADITIVO` | `COMPATIVEL` | Art. 124, I, "a". Modificação de projeto/especificações. | **SIM** |
| **Alt. Qualitativa** | `TERMO_APOSTILAMENTO`| `INCOMPATIVEL` | Modificação de projeto não pode ser apostilada. | **SIM** |
| **Prorrogação** | `TERMO_ADITIVO` | `COMPATIVEL` | Art. 106/107. Prorrogação de vigência. | **SIM** |
| **Prorrogação** | `TERMO_APOSTILAMENTO`| `INCOMPATIVEL` | Prorrogação de vigência exige Termo Aditivo. | **SIM** |
| **Reajuste** | `TERMO_APOSTILAMENTO`| `COMPATIVEL` | Art. 136, I. Variação de índice pactuado em edital. | **NÃO** |
| **Reajuste** | `TERMO_ADITIVO` | `REQUER_ANALISE` | Admissível se houver alteração de cláusula de reajuste. | **SIM** |
| **Repactuação** | `TERMO_ADITIVO` | `COMPATIVEL` | Art. 135. Variação de custos de mão de obra (CCT). | **SIM** |
| **Repactuação** | `TERMO_APOSTILAMENTO`| `INCOMPATIVEL` | Repactuação exige análise analítica de custos. | **SIM** |
| **Outra Alteração**| `TERMO_APOSTILAMENTO`| `REQUER_ANALISE` | Cabível para dotação, fiscal/gestor, erro material. | **NÃO** |

---

## 5. IMPACTOS MÚLTIPLOS E COERÊNCIA

A função `classifyAmendment` deriva de forma não-excludente múltiplos impactos:
* **Prorrogação:** `ALTERA_VIGENCIA` e (se houver alteração de valor) `ALTERA_VALOR`.
* **Acréscimo / Supressão:** `ALTERA_QUANTITATIVO` e `ALTERA_VALOR`.
* **Reajuste / Repactuação:** `ALTERA_VALOR`.
* **Apostilamento Administrativo:** `ATUALIZA_DADOS`.

---

## 6. EVOLUÇÃO E RASTREABILIDADE DE VALORES

A função `calculateAmendmentValueEvolution` assegura que:
1. `valorOriginal` **nunca é sobrescrito**;
2. `valorVigenteAnterior` serve como base comparativa para a variação absoluta e percentual;
3. `valorProposto` e `valorAprovado` são mantidos distintos;
4. `isOficial: false` é sinalizado enquanto a alteração for apenas proposta/interna.

---

## 7. INTEGRAÇÃO DE CICLOS E IDEMPOTÊNCIA

* Toda alteração é ancorada em `contractKey` e `cycleRef` (ex: `VIG_20270115`).
* Identidade determinística canônica gerada por `generateIdempotentEventId`.
* **Garantia de Não-Colisão:** Dois eventos do mesmo contrato em instrumentos diferentes ou ciclos diferentes geram chaves distintas.

---

## 8. NÍVEIS DE OFICIALIDADE DOS DADOS

A função `classifyOfficiality` estabelece:
* **`FATO_OFICIAL`:** Dados com evidência soberana no PNCP ou Contratos.gov.br (`dataPublicacaoOficial` ou `numeroPublicacaoOficial`).
* **`DECISAO_INTERNA`:** Ato formalizado no SEI/Portaria interna ainda não sincronizado nas APIs federais.
* **`PROPOSTA_ADMINISTRATIVA`:** Informação em instrução técnica ou requerimento em análise.
* **`DADO_INTERNO`:** Anotação gerencial ou meta-dado interno.

---

## 9. HISTÓRICO NÃO-DESTRUTIVO

O encadeamento de eventos permite representar a linha do tempo completa sem apagar o passado:
$$\text{Contrato Inicial} \to \text{1º Termo Aditivo (Prorrogação)} \to \text{1º Apostilamento (Reajuste IPCA)} \to \text{2º Termo Aditivo (Acréscimo 10\%)}$$

---

## 10. REAJUSTE E REPACTUAÇÃO: DADOS REAIS

* **Sem regra cega de 12 meses:** O objeto `ReajusteMetadata` armazena a `dataBaseProposta`, o `indicePactuado` e a `clausulaContratual`.
* **Repactuação:** O objeto `RepactuacaoMetadata` armazena o regime de dedicação de mão de obra (DEMO), os dados da CCT/MTE e a verificação de preclusão lógica.

---

## 11. REUTILIZAÇÃO DA VALIDAÇÃO DE LIMITES QUANTITATIVOS

A função `evaluateAmendmentLimits` consome diretamente `calculateAditamentoLimits` de `contractEventService.ts`, garantindo:
* Apuração isolada de acréscimos e supressões (sem compensação de sinais);
* Limite ordinário de 25% e limite de 50% para reforma;
* Supressão > 25% com alerta de necessidade de acordo bilateral (art. 126);
* **Zero bloqueios cegos de salvamento (`podeRegistrarComJustificativa: true`).**

---

## 12. SUÍTE DE TESTES AUTOMATIZADOS

Foram adicionados **20 novos testes unitários** em [`src/services/__tests__/contractAmendmentService.test.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/__tests__/contractAmendmentService.test.ts):
* Classificação de instrumentos e alterações (7 testes);
* Matriz de compatibilidade jurídica assistida (6 testes);
* Rastreabilidade e evolução de valores (2 testes);
* Classificação de oficialidade de dados (3 testes);
* Avaliação de limites quantitativos (1 teste);
* Construção de entidade canônica e mapeamento para `ContractEvent` (1 teste).

*Total do Sistema:* **52 arquivos de teste aprovados / 413 testes passando (100% de sucesso).**

---

## 13. MIGRATIONS E BANCO DE DADOS

* **Migrations Criadas:** **0 (Zero)**
* O domínio opera puramente em memória e é compatível com os esquemas existentes.

---

## 14. ARQUIVOS CRIADOS E ALTERADOS

1. [`src/types/contractAmendments.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/contractAmendments.ts) (Novo)
2. [`src/types/index.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/index.ts) (Exportação centralizada)
3. [`src/services/contractAmendmentService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/contractAmendmentService.ts) (Novo serviço puro)
4. [`src/services/__tests__/contractAmendmentService.test.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/__tests__/contractAmendmentService.test.ts) (Nova suíte de testes)

---

## 15. RISCOS E LIMITAÇÕES CONHECIDAS

* **Nenhum risco arquitetural ou crítico identificado.**
* As limitações baixas já registradas na Fase 4.2 (AB-02 e AB-03) permanecem catalogadas para as fases visuais/workflows futuros.

---

## 16. RECOMENDAÇÃO FINAL

A **Fase 4.3A** está concluída, estável e homologada com sucesso. O sistema está pronto para receber instruções para a **Fase 4.3B** (ou próxima etapa conforme diretriz do usuário).
