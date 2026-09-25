# FASE 7.5-B — PLANEJAMENTO TÉCNICO DE REAJUSTES E EVENTOS CONTRATUAIS

**Data:** 2026-09-24  
**Status do Planejamento:** CONCLUÍDO  
**Veredito:** GO — PLANEJAMENTO APROVADO  
**Baseline de Código e Banco:** 0 alterações de código | 0 novas tabelas | 0 migrations | 0 novas RPCs  
**Alinhamento Legal:** Lei nº 14.133/2021 (Arts. 25, 92, 106, 107, 124, 125, 126, 134, 135, 136, 137, 140)

---

## 1. OBJETIVO

Transformar o diagnóstico consolidado na **Fase 7.5-A** ([`FASE_7_5_A_AUDITORIA_REAJUSTES_EVENTOS_CONTRATUAIS.md`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/FASE_7_5_A_AUDITORIA_REAJUSTES_EVENTOS_CONTRATUAIS.md)) em um plano técnico determinístico, modular e auditável para posterior implementação na **Fase 7.5-C**, resolvendo os três GAPs identificados:

* **`GAP-7.5-01` (LOW):** Projeção visual no Contract 360° integrando o histórico de aditamentos/apostilamentos com o delta monetário acumulado em read models puros.
* **`GAP-7.5-02` (LOW):** Alertas preditivos da Central de Atenção para o marco de 1 ano de aniversário contratual, relacionado à data-base de reajuste/repactuação.
* **`GAP-7.5-03` (INFO):** Checklist de guarda jurídica no workflow de prorrogação para identificar pedidos pendentes de repactuação/reajuste antes da conclusão.

---

## 2. BASELINE

* **Testes de Regressão:** 740/740 testes PASS (84 suítes de teste em 5.21s).
* **TypeScript Typecheck (`npx tsc -b`):** 100% PASS (0 erros).
* **Linter (`npm run lint`):** 100% PASS (0 erros).
* **Production Build (`npm run build`):** 100% PASS (755ms).
* **Integridade Estrutural:** 0 novas tabelas, 0 migrations, 0 novas RPCs (M16/M17/M18 preservadas).

---

## 3. GAP-7.5-01 — PROJEÇÃO VISUAL E HISTÓRICO DE VALORES

Definição do modelo de composição visual e contábil no Contract 360°:

```text
Valor Original (Celebração Inicial)
      │
      ├── [+] Reajuste por Índice de Preços (Apostilamento Art. 136, I)
      ├── [+] Repactuação Salarial / DEMO (Apostilamento Art. 136, I)
      ├── [±] Reequilíbrio Econômico-Financeiro (Termo Aditivo Art. 124, II, "d")
      ├── [+] Acréscimo Quantitativo / Qualitativo (Termo Aditivo Art. 124, I)
      ├── [-] Supressão de Itens / Valores (Termo Aditivo Art. 124, I)
      └── [ ] Eventos Administrativos sem alteração de valor (Prorrogação, Apostila de dotação)
      │
      ▼
Valor Vigente Homologado / Projeção Atualizada
```

* **Fonte de Dados:** Eventos contratuais normalizados via [`ContractEvent`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/contractEvents.ts) originários do PNCP/SIAFI/SEI.
* **Classificação de Oficialidade:** Distinção visual explícita entre `FATO_OFICIAL` (lastro governamental), `DECISAO_INTERNA` (despacho/SEI) e `PROPOSTA_ADMINISTRATIVA` (minuta/requerimento).

---

## 4. GAP-7.5-02 — MARCO ANUAL DE REAJUSTE / REPACTUAÇÃO

* **Finalidade:** Notificar a equipe de gestão sobre a proximidade do marco de 1 ano de aniversário da data-base (Arts. 25, §7º e 135 da Lei nº 14.133/2021).
* **Regra Semântica:** O alerta significa *"Marco temporal de reajuste/repactuação se aproxima e requer análise"*; **NUNCA** significa *"O fornecedor tem direito ao reajuste"*.
* **Semântica Temporal:** Alerta preditivo a partir de 60 dias antes da data-base, integrado ao [`ContractAttentionCenter`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/ContractAttentionCenter.tsx).

---

## 5. GAP-7.5-03 — GUARDA JURÍDICA NA PRORROGAÇÃO

* **Problema Jurídico:** A celebração de Termo Aditivo de Prorrogação de Vigência sem ressalva expressa de pedido pendente de repactuação/reajuste gera **preclusão lógica** (Acórdãos 1.827/2008 e 1.828/2021 do TCU Plenário).
* **Solução:** Checklist assistido no workflow de prorrogação ([`contractProrrogationService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/contractProrrogationService.ts)) e na avaliação de prontidão (`evaluateProrrogationReadiness`), sem bloqueio automático da decisão humana.

---

## 6. DECISÕES ARQUITETURAIS

* **Prioridade de Engenharia:** `REUTILIZAR > ESTENDER > CRIAR`.
* **Persistência:** **Zero novas tabelas, zero migrations, zero novas RPCs**.
* **Modelagem em Memória:** Projeção e evolução de valores calculadas puramente em memória no cliente através de funções determinísticas em [`contractEventService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/contractEventService.ts).
* **Unicidade de Timeline:** Não criar uma segunda timeline. O componente [`ContractEventsTimeline.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/ContractEventsTimeline.tsx) será estendido com um cabeçalho executivo de síntese financeira.

---

## 7. READ MODEL

Interface canônica do Read Model de Evolução de Valor a ser implementada:

```typescript
export interface ContractValueEvolutionReadModel {
  contractKey: string;
  valorOriginal: number;
  valorVigenteAtual: number;
  totalAcrescimos: number;
  totalSupressoes: number;
  totalReajustes: number;
  totalRepactuacoes: number;
  totalReequilibrios: number;
  deltaAcumuladoTotal: number;
  percentualVariacaoAcumulada: number;
  eventosComImpactoFinanceiro: {
    eventoId: string;
    tipoEvento: ContractEventType;
    identificadorOficial: string;
    dataEfeito: string;
    deltaValor: number;
    valorResultanteAposEvento: number;
    instrumento: ContractEventNature;
    oficialidade: OfficialityLevel;
  }[];
}
```

---

## 8. REGRAS DE CÁLCULO

### Tabela de Decisão de Eventos e Impacto Monetário

| Evento | Impacto monetário | Sinal | Fonte | Regra de Cálculo |
|---|---|---|---|---|
| **`CELEBRACAO`** | Base Inicial | `+` (Base) | PNCP / Contrato Inicial | `valorOriginal = contract.valorInicial \|\| contract.valorGlobal` |
| **`REAJUSTE`** | **SIM** | `+` / `-` (usualmente `+`) | Apostila PNCP / SEI / `ReajusteMetadata` | `delta = event.variacaoValor \|\| (event.valorPosterior - event.valorAnterior)` |
| **`REPACTUACAO`** | **SIM** | `+` / `-` (usualmente `+`) | Apostila PNCP / SEI / `RepactuacaoMetadata` | `delta = event.variacaoValor \|\| (event.valorPosterior - event.valorAnterior)` |
| **`REEQUILIBRIO`** | **SIM** | `+` / `-` | Termo Aditivo PNCP / SEI | `delta = event.variacaoValor \|\| (event.valorPosterior - event.valorAnterior)` |
| **`ACRESCIMO`** | **SIM** | `+` | Termo Aditivo PNCP / `AditamentoLimits` | `delta = +Math.abs(event.variacaoValor \|\| (event.valorPosterior - event.valorAnterior))` |
| **`SUPRESSAO`** | **SIM** | `-` | Termo Aditivo PNCP / `AditamentoLimits` | `delta = -Math.abs(event.variacaoValor \|\| (event.valorAnterior - event.valorPosterior))` |
| **`APOSTILAMENTO`** | **CONDICIONAL** | `+` / `-` / `0` | Apostila PNCP / `ApostilamentoMetadata` | Se for reajuste/reforço: `delta = variacaoValor`. Se for dotação/fiscal: `delta = 0`. |
| **`PRORROGACAO`** | **CONDICIONAL** | `0` / `+` | Termo Aditivo PNCP | Se for prorrogação simples: `delta = 0`. Se houver termo aditivo conjunto com valor: `delta = variacaoValor`. |
| **`ENCERRAMENTO`** | **NÃO** | `0` | Termo Recebimento Definitivo | `delta = 0`. Impacto exclusivamente de estado (`ENCERRADO`). |
| **`RESCISAO`** | **NÃO** | `0` | Ato de Rescisão / DOU | `delta = 0`. Impacto exclusivamente de estado (`RESCINDIDO`). |

* **Fórmula de Acumulação Determinística:**
  $$\text{Valor Acumulado}_n = \text{Valor Original} + \sum_{i=1}^{n} \Delta \text{Valor}_i$$
* **Tratamento de Dados Ausentes:** Quando o evento não discriminar `variacaoValor`, o delta é fixado em `0` e marcado como *não quantificado na publicação*.

---

## 9. REGRAS TEMPORAIS

1. **Data de Referência (Data-Base):**
   * Prioridade 1: `ReajusteMetadata.dataBaseProposta` ou `dataBaseOrcamentoEstimativo`.
   * Prioridade 2: `ReajusteMetadata.dataUltimoReajuste`.
   * Fallback de Contingência: `contract.dataAssinatura` ou `contract.dataVigenciaInicio`.
2. **Cálculo do Ciclo Anual:** Aniversário calculado adicionando $12 \times N$ meses à data-base de referência.
3. **Janela de Antecedência:** 60 dias corridos antes do aniversário contratual.
4. **Comportamento Pós-Aniversário:**
   * $0$ a $30$ dias após o aniversário: Estado `VENCIDA` (aviso para conferir existência de pleito tempestivo).
   * Após registro de aditivo/apostila de reajuste: Alerta encerrado e próximo ciclo projetado para $+12$ meses.

---

## 10. CENTRAL DE ATENÇÃO

Integração nativa com [`ContractAttentionCenter.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/ContractAttentionCenter.tsx):

* **Identificador Determinístico:** `ALERT::ANIVERSARIO_REAJUSTE::{contractKey}::{cicloAnual}`
* **Condição de Disparo:** `diasRestantes <= 60` dias antes do aniversário contratual.
* **Escala de Severidade:**
  * `60 a 31 dias:` **`PROXIMA`** (Informativo preventivo).
  * `30 a 1 dia:` **`URGENTE`** (Alerta operacional de conferência de índices).
  * `0 dias:` **`HOJE`**.
  * `< 0 dias:` **`VENCIDA`** (Marco transcorrido).
* **Título:** `Marco Anual de Reajuste / Repactuação (Ano {N})`
* **Descrição:** *"O contrato completará {N} ano(s) em {dataAniversario} ({diasRestantes} dias). Verifique índices oficiais e CCT para instrução tempestiva."*
* **Deduplicação:** Chave única por contrato e ciclo anual.
* **Encerramento:** Conclusão da tarefa correspondente ou registro do evento de reajuste/repactuação.

---

## 11. GUARDA DE PRORROGAÇÃO

* **Mecanismo:** Checklist de prontidão em [`evaluateProrrogationReadiness`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/contractProrrogationService.ts#L219-L296).
* **Verificação Automatizada:** Consulta tarefas ativas de reajuste/repactuação e processos SEI vinculados com descritores de repactuação/CCT.
* **Item do Checklist:** *"Verificação de pedidos pendentes de repactuação/reajuste (evitar preclusão lógica)"*.
* **Orientação ao Usuário:** *"Se houver pedido pendente de repactuação não concluído, certifique-se de fazer constar cláusula de ressalva na minuta do Termo Aditivo de Prorrogação."*

---

## 12. SEI (SISTEMA ELETRÔNICO DE INFORMAÇÕES)

* **Reutilização de Dados:** Consumir a coleção em memória de `processos_sei` associados ao `contractKey`.
* **Filtro Semântico Assistido:** Varredura por termos-chave nos processos vinculados (`"REAJUSTE"`, `"REPACTUACAO"`, `"REEQUILIBRIO"`, `"CCT"`, `"CONVENÇÃO COLETIVA"`).
* **Limitação Registrada:** Caso não haja processo cadastrado com os termos-chave, o sistema apresenta o item como checklist declaratório do gestor.

---

## 13. CONTRACT 360°

Extensão de [`ContractEventsTimeline.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/ContractEventsTimeline.tsx):

1. **Painel de Síntese Financeira no Topo da Timeline:**
   * Card 1: *Valor Original* (R$);
   * Card 2: *Variação Acumulada Aditada* ($\Delta$ R$ e % acumulado);
   * Card 3: *Valor Vigente Homologado* (R$).
2. **Badges de Oficialidade por Evento:**
   * `FATO_OFICIAL`: Azul com ícone de confirmação governamental.
   * `DECISAO_INTERNA`: Roxo com ícone de processo administrativo.
   * `PROPOSTA_ADMINISTRATIVA`: Âmbar com ícone de minuta/estudo.

---

## 14. TAREFAS

Reutilização do motor de tarefas `public.contract_tasks` e [`ContractTaskTemplate`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/contractTasks.ts):

* Inclusão no template padrão de prorrogação (`tpl-prorrogacao-padrao-14133`):
  * **Tarefa:** `"Verificar existência de pedidos pendentes de reajuste/repactuação e incluir cláusula de ressalva na minuta de Termo Aditivo para evitar preclusão lógica (TCU)"`
  * **Modo de Execução:** `INTERNA`
  * **Sistema Destino:** `SEI`
  * **Macrotarefa:** `3. Instrução Processual e Análise Jurídica`

---

## 15. SEGURANÇA E NÃO-BLOQUEIO DA DECISÃO HUMANA

```text
Sistema identifica situação
        ↓
Sistema emite alerta de conformidade
        ↓
Servidor público analisa
        ↓
Servidor público decide soberanamente
```

* O sistema **NUNCA** bloqueia a assinatura ou a conclusão da prorrogação.
* O sistema fornece suporte à decisão, alertas e registros de auditoria, preservando a autonomia discricionária do gestor.

---

## 16. RELAÇÃO COM O ITEM DA ATA DE REGISTRO DE PREÇOS

* **Isolamento de Domínio:** O saldo físico da Ata de Registro de Preços (quantitativo de itens) é **intangível**.
* **Regra Absoluta:** Aditamentos, acréscimos (Art. 125), supressões ou reajustes no contrato **NÃO** alteram nem consomem a quantidade física registrada no Item da ARP.

---

## 17. RELAÇÃO COM A EXECUÇÃO FINANCEIRA

* **SSOT Preservado:** A tabela [`public.empenhos`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/empenhos.ts), a view `v_contrato_empenhos_lastro` e o histórico `public.empenho_eventos_historico` permanecem 100% intangíveis.
* **Regra Absoluta:** Fatos contratuais alteram o valor contratual vigente, mas **NUNCA** inserem ou alteram diretamente empenhos, liquidações ou pagamentos. O reforço orçamentário decorrente de aditamento é sincronizado exclusivamente via SIAFI/Contratos.gov.br.

---

## 18. PLANO DE IMPLEMENTAÇÃO DA FASE 7.5-C

| Subfase | Objetivo Técnico | Módulos Impactados | Critério de Aceite |
|---|---|---|---|
| **7.5-C1** | Motor e Read Model de Projeção de Valores | [`contractEventService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/contractEventService.ts), [`contractEvents.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/types/contractEvents.ts) | Função pura `buildContractValueEvolutionModel` implementada com testes unitários. |
| **7.5-C2** | Síntese Financeira no Contract 360° | [`ContractEventsTimeline.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/ContractEventsTimeline.tsx) | Cabeçalho executivo renderizado no topo da timeline existente sem duplicações. |
| **7.5-C3** | Marco Anual e Central de Atenção | [`temporalEngineService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/temporalEngineService.ts), [`ContractAttentionCenter.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/ContractAttentionCenter.tsx) | Alertas preditivos (60d, 30d, 0d) disparados e deduplicados por ciclo anual. |
| **7.5-C4** | Guarda Jurídica de Preclusão na Prorrogação | [`contractProrrogationService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/contractProrrogationService.ts) | Checklist e tarefa padrão no template `tpl-prorrogacao-padrao-14133`. |
| **7.5-C5** | Testes e Homologação Integrada | Suíte de testes geral | 100% de testes verdes, 0 erros no build e 0 alterações em banco. |

---

## 19. TESTES OBRIGATÓRIOS DA FASE 7.5-C

1. `contractEventService.test.ts`: Projeção de contrato sem aditivos (valor inicial = vigente).
2. `contractEventService.test.ts`: Contrato com Reajuste por Apostilamento (+5% com delta positivo).
3. `contractEventService.test.ts`: Contrato com Repactuação CCT (+R$ 12.000,00).
4. `contractEventService.test.ts`: Contrato com Acréscimo (+20%) e Supressão (-10%) apurados isoladamente.
5. `contractEventService.test.ts`: Evento sem impacto financeiro (Prorrogação de vigência) com $\Delta = 0$.
6. `contractEventService.test.ts`: Múltiplos eventos fora de ordem cronológica com ordenação determinística.
7. `temporalEngineService.test.ts`: Cálculo de aniversário aos 70 dias (sem alerta).
8. `temporalEngineService.test.ts`: Cálculo de aniversário aos 45 dias (alerta `PROXIMA`).
9. `temporalEngineService.test.ts`: Cálculo de aniversário aos 10 dias (alerta `URGENTE`).
10. `ContractAttentionCenter.test.ts`: Deduplicação determinística do alerta de reajuste.
11. `contractProrrogationService.test.ts`: Prorrogação com processo SEI de repactuação pendente (emissão de aviso de ressalva).
12. `contractProrrogationService.test.ts`: Prorrogação sem pendências (prontidão limpa).
13. Teste Transversal: Intangibilidade de `public.empenhos` após eventos contratuais.
14. Teste Transversal: Intangibilidade do saldo quantitativo da Ata após eventos contratuais.

---

## 20. CRITÉRIOS DE ACEITE

* [ ] Projeção de valores calcula com precisão monetária (em centavos de real) o valor original, deltas de cada aditamento e valor vigente.
* [ ] Timeline contratual exibe cabeçalho executivo sem criar uma segunda timeline.
* [ ] Central de Atenção apresenta alertas preditivos aos 60 dias do marco anual sem falsos positivos.
* [ ] Workflow de prorrogação alerta preventivamente sobre preclusão lógica de repactuação pendente.
* [ ] 100% dos testes existentes e novos passando.
* [ ] 0 novas tabelas, 0 migrations, 0 novas RPCs.

---

## 21. RISCOS E MITIGAÇÕES

| Risco | Severidade | Mitigação |
|---|---|---|
| Criação de timeline redundante na UI | Baixa | Estender exclusivamente o componente existente [`ContractEventsTimeline.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/ContractEventsTimeline.tsx). |
| Bloqueio indevido de prorrogação pelo sistema | Média | Alerta puramente orientativo/checklist, garantindo a soberania da decisão do servidor. |
| Divergência da data-base da proposta | Baixa | Priorizar metadados explícitos com fallback transparente para a data de assinatura. |
| Inconsistência de arredondamento | Baixa | Normalização matemática em 2 casas decimais (`Math.round(v * 100) / 100`). |

---

## 22. GAPs RESIDUAIS

Não há GAPs residuais impeditivos. Os três GAPs da Fase 7.5-A estão completamente detalhados e cobertos pelas especificações técnicas deste planejamento.

---

### **VEREDITO: GO — PLANEJAMENTO APROVADO**
