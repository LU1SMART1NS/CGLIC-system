# RELATÓRIO DE IMPLEMENTAÇÃO — FASE 6.6
## Integração da Ata ao Motor Temporal e Central de Prazos

---

## 1. CABEÇALHO E METADADOS FORMAIS

* **Projeto**: SaldoARP — Sistema de Gestão de Atas de Registro de Preços e Contratos
* **Fase**: 6.6 — Integração da Ata ao Motor Temporal e Central de Prazos
* **Ambiente**: Produção / Supabase (`bouutpmxexvwppcmmhdi`)
* **Branch**: `claude/practical-curie-l7be2j`
* **Data**: 2026-09-23
* **Status**: **CONCLUÍDO COM GO**
* **Responsável**: Engenheiro de Software / Antigravity Agent

---

## 2. AUDITORIA PRÉVIA DO MOTOR TEMPORAL

Antes de qualquer modificação, auditou-se exaustivamente o ecossistema temporal:
* **Motor Temporal Canônico (`src/services/temporalEngineService.ts`)**:
  - Centraliza o parsing com fuso horário `America/Sao_Paulo` (`parseDateBRT`);
  - Oferece manipulação aritmética pura (`addDays`, `addBusinessDays`, `differenceInDays`);
  - Deriva formalmente o estado (`deriveTemporalStatus`) e o nível de urgência (`deriveAtencaoNivel`);
  - Expõe a função mestre `calculateDeadline` com ficha de explicabilidade transparente (`ExplicabilidadePrazo`).
* **Consumidores do Motor**:
  - `centralPrazosService.ts` (agregador in-memory da Central de Prazos);
  - `contractEventService.ts` (transições de ciclos contratuais);
  - `contractProrrogationService.ts` (análise assistida de aditivos de prorrogação);
  - `useCentralPrazosData.ts` (hook React Query de alimentação de dashboard);
  - Componentes de UI (`CentralPrazosTable.tsx`, `ContractAttentionCenter.tsx`, `ExplicabilidadeModal.tsx`).
* **Diagnóstico**: O motor é coeso, robusto e perfeitamente extensível. Não havia necessidade de criar um segundo motor para Atas.

---

## 3. ARQUITETURA TEMPORAL ENCONTRADA

A arquitetura temporal existente confirmou a existência de um fluxo unificado:

```text
               Dados Oficiais (PNCP, Contratos.gov, Compras.gov)
                                   │
                                   ▼
                       MOTOR TEMPORAL CANÔNICO
                    (src/services/temporalEngineService.ts)
                         │ (parseDateBRT, calculateDeadline)
            ┌────────────┴────────────┐
            ▼                         ▼
         CONTRATOS                   ATAS
     (D-180, D-60, etc.)       (D-180, D-90)
            │                         │
            └────────────┬────────────┘
                         ▼
             CENTRAL DE PRAZOS (centralPrazosService.ts)
                         │
                         ▼
                   Painel de Prazos & Ações
```

---

## 4. ALTERAÇÕES REALIZADAS

1. **`src/services/temporalEngineService.ts`**:
   - Inclusão da regra canônica `ARP_PRORROGACAO_180D` no catálogo `REGRAS_OPERACIONAIS_PADRAO`.
   - Preservação da regra operacional existente `ARP_VIGENCIA_90D`.
   - Nenhuma função existente foi alterada ou quebrada.
2. **`src/services/centralPrazosService.ts`**:
   - Importação de `isInstrumentoSubstitutivo` de `../types`.
   - **Loop de Atas (`arps`)**:
     - Identificação de `dataVigenciaFinal`.
     - Verificação se a Ata já se encontra vencida (`differenceInDays < 0`).
     - Emissão do marco operacional `GATILHO_180D` (`ARP_PRORROGACAO_180D`) exclusivamente para Atas vigentes.
     - Preservação do alerta `GATILHO_90D` (`ARP_VIGENCIA_90D`).
   - **Loop de Contratos (`contracts`)**:
     - Aplicação da regra contextual para instrumentos substitutivos (Art. 95). Se o instrumento for substitutivo e não possuir período de vigência continuada prolongado, suprime os gatilhos ordinários de prorrogação de 180d e 60d.
3. **`src/services/__tests__/temporalEngineService.test.ts`**:
   - Teste unitário para a regra `ARP_PRORROGACAO_180D`.
4. **`src/services/__tests__/centralPrazosService.test.ts`**:
   - Adicionada seção de testes cobrindo Ata em D-180, D-179, fora da janela, vencida, saldo zero, instrumentos substitutivos e contratos normais.
5. **`src/hooks/__tests__/useCentralPrazosData.test.ts`**:
   - Atualizada a asserção de agregação para contemplar os 2 gatilhos de ARP (D-180 e D-90), totalizando 5 itens agregados.

---

## 5. MARCO OPERACIONAL D-180 DA ATA

* **Identificador da Regra**: `ARP_PRORROGACAO_180D`
* **Nome**: `Planejamento de Prorrogação da Ata (180d)`
* **Tipo**: `OPERACIONAL`
* **Natureza**: Trata-se estritamente de um **gatilho operacional de planejamento preventivo**, e não de um prazo legal peremptório.
* **Ação Gerada na Central de Prazos**:
  `"Planejamento e análise de vantajosidade de prorrogação da Ata (Janela preventiva 180d)"`.
* **Idempotência**: Chave determinística no formato:
  `ARP::{arpKey}::PRORROGACAO_ARP::GATILHO_180D::VIG_{cicloAta}`.

---

## 6. CENTRAL DE PRAZOS UNIFICADA

A Central de Prazos agora monitora holisticamente Atas e Contratos:
* **Entidade ARP**:
  - Exibe tanto a janela de planejamento de prorrogação (**D-180**) quanto o alerta de exaustão de vigência (**D-90**).
  - Ícone dedicado (`Package`), UASG gerenciadora e número da compra devidamente associados.
* **Entidade CONTRATO**:
  - Exibe início da análise de prorrogação (**D-180**) e remessa aos órgãos jurídicos/controle (**D-60**).
  - Associa gestor de contrato atribuído e tarefas do plano.

---

## 7. SALDO × TEMPORALIDADE (SEPARAÇÃO ORGÂNICA)

Respeitou-se com rigor o princípio de que o **saldo não altera a cronologia temporal**:
* A data-alvo de D-180 e D-90 é calculada unicamente a partir de `dataVigenciaFinal - offsetDias`.
* Se o saldo registrado da Ata for zero, o prazo de vigência permanece existindo até o término formal do instrumento.
* Saldo é informação contextual para prontidão e auditoria, e nunca um componente da equação cronológica.

---

## 8. INSTRUMENTOS SUBSTITUTIVOS (ART. 95 DA LEI 14.133/2021)

Implementou-se a avaliação contextual de instrumentos substitutivos:
* Se `isInstrumentoSubstitutivo(contract.tipoInstrumento) === true`:
  - Instrumentos substitutivos como notas de empenho ou ordens de serviço de entrega imediata (sem vigência futura estendida ou com data inicial igual a final) **não geram** os alertas de prorrogação continuada de 180d e 60d.
  - Instrumentos substitutivos com vigência prolongada declarada seguem o comportamento temporal compatível.
* Contratos ordinários solenes (`TERMO_CONTRATO` ou contratos sem discriminador nominal) continuam gerando 100% dos gatilhos preventivos normalmente.

---

## 9. TRATAMENTO DE ATA VENCIDA E SALDO ZERO

1. **Ata Vencida (`diasAteVencimentoAta < 0`)**:
   - Se `arp.dataVigenciaFinal < currentDate`, o sistema reconhece a expiração temporal do instrumento e **não gera o gatilho prospectivo de planejar prorrogação** (`GATILHO_180D`), eliminando sugestões anacrônicas de planejamento futuro para atas já expiradas.
2. **Ata Vigente com Saldo Zero**:
   - Se `saldo === 0` e `arp.dataVigenciaFinal >= currentDate`, a Ata **NÃO é classificada como vencida**. O cálculo cronológico prossegue normalmente, permitindo que o gestor examine a viabilidade de renovação de cotas (se prevista em edital) antes da expiração da vigência.

---

## 10. REVISÃO DOS ACHADOS DA FASE 6.5-A

1. **`ACH-6.5-01` (`classifyAtaEvent` lançando `throw`)**:
   - A implementação da Fase 6.6 não necessitou invocar `classifyAtaEvent` para a geração de gatilhos na Central de Prazos, pois os gatilhos temporais são gerados diretamente via `calculateDeadline` a partir dos metadados de vigência oficial (`dataVigenciaFinal`).
   - O `throw` permanece estritamente como guarda ontológica do domínio puro, sendo mantido sem alterações laterais desnecessárias.
2. **`ACH-6.5-02` (Prontidão assistiva vs anuência do fornecedor)**:
   - Separou-se formalmente o **Marco Temporal** (computado pelo motor temporal canônico) da **Prontidão Processual** (avaliada assistivamente pela função `evaluateAtaProrrogationReadiness`). O motor temporal não toma decisões jurídicas.

---

## 11. SUÍTE DE TESTES E COMPROVAÇÃO DE COBERTURA

Foram implementados 8 novos testes unitários e de integração:
* **`temporalEngineService.test.ts`**:
  - Teste da regra `ARP_PRORROGACAO_180D` no catálogo padrão.
* **`centralPrazosService.test.ts`**:
  - Cenário 1: Ata exatamente em D-180 (`diasRestantes === 0`, `VENCE_HOJE`);
  - Cenário 2: Ata em D-179 (`diasRestantes === -1`, marco operacional atingido/atrasado);
  - Cenário 3: Ata fora da janela preventiva (200 dias de vigência restante, D-180 a 20 dias);
  - Cenário 4: Ata vencida (supressão do gatilho prospectivo de prorrogação D-180);
  - Cenário 5: Ata com saldo zero vs positivo (cálculo cronológico rigorosamente idêntico);
  - Cenário 6: Instrumento substitutivo (Art. 95) de entrega imediata silenciado no radar D-180;
  - Cenário 7: Contrato ordinário gerando normalmente D-180 e D-60.
* **`useCentralPrazosData.test.ts`**:
  - Teste de agregação consolidado com os 2 gatilhos de ARP (D-180 e D-90).

---

## 12. REGRESSÃO DE CONTRATOS E SISTEMA GLOBAL

Executou-se o pipeline completo de qualidade:
* **Vitest (`npm test -- --run`)**: **70 arquivos / 611 testes PASS (100% de sucesso)**;
* **TypeScript (`npx tsc -b`)**: **0 erros**;
* **ESLint (`npm run lint`)**: **0 erros**;
* **Build de Produção (`npm run build`)**: **Sucesso (dist em 551ms)**.

Todos os testes de contratos, alocações, empenhos e tarefas humanas permaneceram rigorosamente intactos e verdes.

---

## 13. AUDITORIA DE BANCO DE DADOS

* **Novas Migrations**: **0** (mantidas as 15 migrations existentes);
* **Novas Tabelas / Colunas**: **0**;
* **Novas RPCs / Triggers**: **0**;
* **Políticas RLS**: **Inalteradas**.

---

## 14. ACHADOS DA FASE 6.6

### `ACH-6.6-01` — GAP de Modelo: Ausência de flag booleano explícito de entrega imediata em `ContractDashboardRecord`
* **Severidade**: **INFO** (Não bloqueante)
* **Evidência**: A interface `ContractDashboardRecord` possui `dataVigenciaInicio`, `dataVigenciaFim` e `tipoInstrumento`, mas não possui atributo específico `isPrestacaoContinuada` ou `isEntregaImediata`.
* **Impacto**: A heurística contextual utilizou a correspondência `dataVigenciaInicio === dataVigenciaFim` para inferir entrega imediata em instrumentos substitutivos.
* **Recomendação**: Em etapas futuras de ingestão/sincronização do PNCP, enriquecer os metadados do contrato com a classificação explícita de prestação continuada.

---

## 15. LIMITAÇÕES E ESCOPO PRESERVADO

Permanecem expressamente preservados para as etapas posteriores do roadmap:
* Burn rate e taxa de queima orçamentária;
* Farol preditivo de esgotamento de saldo;
* Série histórica e conciliação bancária de empenhos;
* Workflows e planos de tarefas de Atas de Registro de Preços;
* Criação de tarefas automáticas a partir de gatilhos da Central de Prazos.

---

## 16. VEREDITO FINAL

Todos os critérios de aceitação foram cumpridos com integridade e rigor:
1. Existe um **único motor temporal** no SaldoARP;
2. As Atas foram integradas ao motor existente sem código paralelo;
3. O marco **D-180** de planejamento de prorrogação de Atas está operacional e rotulado adequadamente;
4. O alerta **D-90** pré-existente foi preservado;
5. Atas vencidas não geram sugestões anacrônicas de planejamento futuro;
6. O saldo da Ata não interfere na matemática cronológica;
7. Instrumentos substitutivos de entrega imediata não entram indevidamente no radar D-180 de prorrogação contínua;
8. Não houve nenhuma alteração em banco de dados;
9. Toda a regressão está verde (611 testes PASS).

---

### **FASE 6.6 — GO**

**Fase 6.6 definitivamente concluída e homologada.**
O próximo passo será definido pelo roadmap estratégico estabelecido no Checkpoint 6.4.
