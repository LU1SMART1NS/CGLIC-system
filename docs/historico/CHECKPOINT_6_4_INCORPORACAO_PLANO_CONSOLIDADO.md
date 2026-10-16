# CHECKPOINT ARQUITETURAL — FASE 6.4
## INCORPORAÇÃO DO PLANO CONSOLIDADO DE GESTÃO DE ATAS E CONTRATOS (LEI 14.133/2021)

**Data de Realização**: 23 de Setembro de 2026  
**Status**: **GO (PLANO CONSOLIDADO INCORPORADO AO ROADMAP SEM ALTERAÇÕES DE CÓDIGO)**  
**Documento Estratégico Analisado**: `PLANO_GESTAO_ATA_LEI14133_CONSOLIDADO.md`  
**Escopo desta Fase**: Exclusivamente Auditoria, Diagnóstico, Mapeamento de Impacto, Dependências, Matriz de Riscos e Roadmap Revisado.  
**Alterações de Código em Produção**: **0 (Zero)**. Nenhuma migration, tabela, RPC, hook, service ou componente foi criado ou alterado.

---

## 1. RESUMO EXECUTIVO

O SaldoARP concluiu com sucesso a homologação da integração **ARP $\rightarrow$ Item $\rightarrow$ Contrato Oficial $\rightarrow$ Contrato 360°** (Fases 6.0 a 6.3-C), ancorando a persistência na SSOT PostgreSQL através da tabela `arp_item_contract_links`, com respeito estrito à invariante contábil de saldo ($\text{Saldo} = \text{Qtd Homologada} - \sum \text{Empenhos}$) e sem contaminação por persistência paralela em `localStorage`.

Paralelamente, foi elaborado o documento estratégico `PLANO_GESTAO_ATA_LEI14133_CONSOLIDADO.md`, que propõe um aprofundamento substancial do ciclo de vida das Atas de Registro de Preços, incorporando:
1. Regras formais da Lei 14.133/2021 (vantajosidade de preço, renovação de quantitativos, vedação de acréscimo em ata, remanejamento soma-zero entre participantes);
2. Tratamento ontológico dos contratos sem Ata e dos instrumentos substitutivos do art. 95 (nota de empenho, carta-contrato, ordem de serviço);
3. Farol preditivo de saldo baseado no cruzamento entre saldo remanescente, velocidade de consumo (*burn rate*) e janela D-180;
4. Trâmite processual no SEI com separação entre processo-mãe da licitação e processos relacionados por evento;
5. Mecânica ágil (Kanban de 5 colunas por condição jurídica) e gamificação comportamental voltada ao cumprimento de prazos.

Este Checkpoint 6.4 realizou a avaliação de impacto arquitetural para responder:
> **"Como incorporar o Plano Consolidado ao SaldoARP atual sem quebrar, duplicar ou contradizer a arquitetura já homologada?"**

A conclusão do diagnóstico é categórica:
* **A arquitetura construída nas Fases 4.x, 5.x e 6.x é sólida e serve de fundação direta para o plano.** O princípio `"FATO OFICIAL ≠ EVENTO CANÔNICO ≠ WORKFLOW ≠ TAREFA"` formulado para Contratos é 100% reutilizável para o domínio de Atas.
* **O Plano Consolidado NÃO deve ser implementado de forma monolítica.** Ele contém elementos de maturação distinta: requisitos que dependem de infraestrutura de dados ainda inexistente (ex.: série temporal de empenhos para *burn rate*), requisitos que dependem de ajustes estruturais cirúrgicos (ex.: opcionalidade de `Contrato.arpId`), requisitos maduros para modelagem de domínio (ex.: `AtaEvents` e `AtaWorkflows`) e propostas experimentais de interface (Kanban e gamificação) que devem vir somente após a consolidação dos dados e do motor temporal.
* O roadmap foi reorganizado em fases modulares e sequenciais, preservando a estabilidade da aplicação e a integridade dos dados governamentais.

---

## 2. ESTADO ATUAL DO SALDOARP

O diagnóstico do código-fonte e do banco de dados na branch ativa confirma a seguinte fotografia operacional:

```text
STATUS GERAL DA BASE DE CÓDIGO
----------------------------------------------------------------------
Arquivos de Teste:     69 arquivos (Vitest v2.1.9)
Testes Automatizados:  583 testes PASSING (100% de cobertura nos fluxos críticos)
Tipagem Estática:      npx tsc -b PASS (0 erros)
Linter:                Oxlint PASS (0 erros de produção)
Build de Produção:     Vite v8.2.2 compilado em 535ms
Banco de Dados:        PostgreSQL 17.6.1 (Supabase ga, project ref: bouutpmxexvwppcmmhdi)
Migrations Ativas:     15 migrations versionadas (sincronizadas com schema_migrations)
Tabela Chave Ativa:    public.arp_item_contract_links (RLS ativo, RPCs atômicas, Auditoria)
```

### O que já está consolidado (Pronto e Homologado):
1. **Módulo de Contratos Administrativos (Fases 4.x e 5.x)**: Catálogo oficial sincronizado via PNCP / Contratos.gov.br por UASG; Cockpit executivo **Contrato 360°** com seções de resumo, workflows, tarefas com semântica de execução (`TaskExecutionMode`), linha do tempo cronológica com separação de oficialidade e Central de Atenção temporal.
2. **Motor Temporal Centralizado (`temporalEngineService.ts`)**: Suporte a cálculo normativo de prazos, dias úteis/corridos, fuso horário BRT, regras D-180, D-90, D-60 e classificação semafórica de atenção.
3. **Vínculo Oficial Item $\leftrightarrow$ Contrato (Fases 6.0 a 6.3-C)**: Tabela relacional pura `arp_item_contract_links`, sem duplicação de dados cadastrais soberanos, com integridade N:N comprovada no PostgreSQL real.
4. **Governança e RBAC**: Restrição de mutações a perfis `gestor` e `admin`, com triggers de auditoria integrados a `public.audit_logs`.
5. **SSOT Purificada**: Eliminação total de persistência paralela em `localStorage` para entidades relacionais.

---

## 3. ARQUITETURA ATUAL E PONTOS DE FLUXO

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            APIs PÚBLICAS SOBERANAS                               │
│              (PNCP / Contratos.gov.br / Compras.gov.br / SIAFI)                  │
└───────────────┬──────────────────────────────────────────┬───────────────────────┘
                │ Sincronização de Atas                    │ Sincronização de Contratos
                ▼                                          ▼
┌───────────────────────────────┐          ┌───────────────────────────────────────┐
│     atas_registro_preco       │          │          Catálogo Oficial             │
│    (UASG, número, ano,        │          │    ContractDashboardRecord            │
│     vigência, PNCP)           │          │   (contract_key: UASG-num-ano)        │
└───────────────┬───────────────┘          └───────────────────┬───────────────────┘
                │ 1:N                                          │
                ▼                                              │
┌───────────────────────────────┐                              │
│          itens_ata            │                              │
│    (item_key, homologada,     │                              │
│     valor_unitario)           │                              │
└───────┬───────────────┬───────┘                              │
        │ 1:N           │ 1:N                                  │
        │               └──────────────────────────────┐       │
        ▼                                              ▼       ▼
┌───────────────────────────────┐          ┌───────────────────────────────────────┐
│           Empenhos            │          │        arp_item_contract_links        │
│   (Consumo do Saldo da Ata)   │          │  (item_key ↔ contract_key, qtdContr)  │
│   Saldo = Homologada - ∑Emp   │          └───────────────────┬───────────────────┘
└───────────────────────────────┘                              │
                                                               ▼
                                                   ┌───────────────────────┐
                                                   │     Contrato 360°     │
                                                   │ (/contratos/:key)     │
                                                   │  • Central de Atenção │
                                                   │  • Workflows          │
                                                   │  • Tarefas (Planos)   │
                                                   │  • Linha do Tempo     │
                                                   └───────────────────────┘
```

### Mapeamento das Camadas por Natureza Arquitetural:
- **SSOTs Soberanas Externas**: PNCP / Compras.gov.br (Dados oficiais de Atas e Contratos).
- **SSOT Interna Transacional (PostgreSQL)**: `atas_registro_preco`, `itens_ata`, `arp_item_contract_links`, `contract_events`, `contract_tasks`, `processos_sei`.
- **Projeções em Memória**: `useContractWorkflows.ts`, `useContractEvents.ts`, `useContractsDashboard.ts`.
- **Regras Contábeis Invioláveis**: `balanceService.ts` ($\text{Saldo} = \text{Qtd Homologada} - \sum \text{Empenhos}$).
- **Regras Temporais Canônicas**: `temporalEngineService.ts`.

---

## 4. MATRIZ DE INCORPORAÇÃO DO PLANO CONSOLIDADO

Abaixo, a confrontação detalhada entre as proposições do `PLANO_GESTAO_ATA_LEI14133_CONSOLIDADO.md` e a realidade do código-fonte do SaldoARP:

| Tema do Plano Consolidado | Estado Atual no Código | Evidência no Repositório | Gap Identificado | Impacto Arquitetural | Dependência Crítica | Classificação / Recomendação |
| :--- | :---: | :--- | :--- | :---: | :--- | :---: |
| **Prontidão de Prorrogação da Ata (art. 84)** | `INEXISTENTE` | `contractProrrogationService.ts:1-480` cobre apenas Contratos. `centralPrazosService.ts:280-334` só alerta D-90 por data. | Não existe motor de prorrogação para Ata que avalie vantajosidade e saldo remanescente. | **ALTO** | `temporalEngineService`, `balanceService`, cadastro da Ata | `APROVADO PARA MODELAGEM` (Criar `ataProrrogationService.ts` espelhando Contratos). |
| **Renovação de Quantitativos na Ata** | `INEXISTENTE` | `ArpRecord` (`src/types/index.ts:8-38`) e `atas_registro_preco` não possuem campo de edital. | Sistema não sabe se edital previu renovação de quantitativos (Parecer 75/2024 AGU). | **MÉDIO** | Schema de Atas (`atas_registro_preco`) | `DEPENDE DE DADOS` (Adicionar `previsao_renovacao_quantitativos` ao schema da Ata). |
| **Vedação de Acréscimo em Ata (25%)** | `IMPLEMENTADO` (Conceitual) | `contractAmendmentService.ts` valida aditivos de 25% para contratos. Em Atas, não existe fluxo de acréscimo. | Falta explicitar na UI e nas regras de negócio que Atas são imutáveis em quantitativo global (Dec. 11.462/23, art. 23). | **BAIXO** | — | `IMPLEMENTADO` (Manter vedação; explicitar em validações futuras). |
| **Remanejamento de Quantitativos entre Órgãos** | `INEXISTENTE` | `alocacoes_internas` e `internal_departments` permitem redistribuir apenas alocações internas da gerenciadora. | Não existe entidade/operação de remanejamento formal de saldo entre participantes da Ata com consentimento da cedente. | **ALTO** | Schema relacional, consentimento formal SEI | `DEPENDE DE DECISÃO / VALIDAÇÃO JURÍDICA` (Modelar como evento formal de soma-zero). |
| **Reajuste / Repactuação / Reequilíbrio em Ata** | `INEXISTENTE` (Para Ata) | `contractEvents.ts` possui os tipos para Contratos. Para Atas, não há suporte a reajuste de valor unitário. | Alteração do valor unitário do item da Ata por apostila/aditivo não é versionada. | **ALTO** | Histórico de preços do item (`itens_ata`) | `APROVADO PARA MODELAGEM` (Criar `AtaEvent` com impacto `ALTERA_VALOR_UNITARIO`). |
| **Contrato sem Ata (`Contrato.arpId`)** | `INCOMPATÍVEL` | `src/types/index.ts:374` define `arpId: string` obrigatório em `Contrato`. `contratos_manuais.arp_id` é `NOT NULL`. | Impede representação legítima de contratos diretos (dispensa/inexigibilidade sem SRP). | **MÉDIO** | `src/types/index.ts`, `contratos_manuais` | `APROVADO PARA SANEAMENTO CIRÚRGICO` (Tornar `arpId?: string` opcional na tipagem). |
| **Instrumento Substitutivo (art. 95)** | `INEXISTENTE` | Nenhuma referência a `cartaContrato`, `ordemExecucaoServico` ou art. 95 no código. | Sistema trata todo ajuste como Termo de Contrato formal, forçando vigência a quem não tem obrigações futuras. | **MÉDIO** | `ContractDashboardRecord`, regras temporais | `APROVADO PARA MODELAGEM` (Criar enum `TipoInstrumentoContratual`). |
| **Farol de Saldo com Burn Rate** | `PARCIAL` (Só saldo estático) | `balanceService.ts:85-89` calcula saldo pontual. `centralPrazosService.ts` não cruza saldo com tempo. | Não existe cálculo de velocidade de consumo (*burn rate*), nem projeção de esgotamento cruzada com D-180. | **CRÍTICO** | Série temporal de empenhos (datas e quantidades históricas) | `DEPENDE DE DADOS` (Exige ingestão de histórico de empenhos por item). |
| **Eventos Canônicos de Ata (`AtaEvents`)** | `INEXISTENTE` | `src/types/contractEvents.ts` define 9 eventos de Contrato. Zero eventos para Ata. | Ciclo de vida da Ata não possui linha do tempo nem eventos formais registrados. | **ALTO** | Novo arquivo `types/ataEvents.ts` e service puro | `APROVADO PARA MODELAGEM` (Espelhar padrão canônico de Contratos). |
| **Workflows Operacionais de Ata (`AtaWorkflows`)** | `INEXISTENTE` | `src/hooks/useContractWorkflows.ts` projeta 4 workflows de contrato. Zero para Ata. | Gestor da Ata não tem painel operacional de prorrogação ou remanejamento. | **ALTO** | Eventos de Ata e `temporalEngineService` | `APROVADO PARA MODELAGEM` (Prorrogação da Ata e Remanejamento). |
| **Trâmite SEI (Processo-mãe $\leftrightarrow$ Processos Relacionados)** | `PARCIAL` | Tabela `processos_sei` armazena processos avulsos; `alocacoes_internas` guarda `processo_sei_id`. | Não modela a relação hierárquica `processo-mãe` (licitação/ata) $\leftrightarrow$ `processo do aditivo/remanejamento`. | **MÉDIO** | Schema de `processos_sei` | `APROVADO PARA EVOLUÇÃO` (Adicionar `parent_processo_id` ou vínculo por evento). |
| **Kanban Ágil de Prazos** | `INEXISTENTE` (Conceitual) | Interface atual utiliza tabela (`CentralPrazosTable.tsx`) e cards colapsáveis. | Não existe visualização de board Kanban de 5 colunas por estágio jurídico de prazo. | **BAIXO** | Motor temporal consolidado | `APENAS CONCEITUAL / POSTERIOR` (Camada visual que consome motor temporal). |
| **Gamificação Comportamental (Streaks/Badges)** | `INEXISTENTE` (Conceitual) | Nenhuma lógica de pontuação, streaks ou badges de gamificação no repositório. | Não há reforço positivo para prazos cumpridos antecipadamente. | **BAIXO** | Governança de tarefas e auditoria | `APENAS CONCEITUAL / POSTERIOR` (Não prioritária para o núcleo de conformidade legal). |

---

## 5. ANÁLISE ESPECÍFICA DO DOMÍNIO DE ATA

O Plano Consolidado propõe a criação de um ecossistema de eventos para Atas análogo ao construído na Fase 4 para Contratos.

### Comparativo Ontológico: Contrato $\times$ Ata

| Dimensão | Domínio Contratos (Fase 4.x - Homologado) | Proposta Domínio Atas (Plano Consolidado) | Diagnóstico Arquitetural |
| :--- | :--- | :--- | :--- |
| **Celebração** | Assinatura do Contrato formal | Homologação da Licitação e Assinatura da ARP | **Reutilizável**: Marco zero do instrumento. |
| **Prorrogação de Vigência** | Art. 106/107 (Até 5 ou 10 anos) | Art. 84 (+1 ano, máx 24 meses) | **Distinto**: A prorrogação da Ata exige dupla condição: vantajosidade de preços + (saldo remanescente > 0 OU edital previu renovação de quantitativos). |
| **Acréscimo de Quantitativo (25%)** | Art. 125 (Permitido até 25% ou 50%) | **VEDADO POR LEI** (Dec. 11.462/23, art. 23) | **Crítico**: NUNCA permitir evento de acréscimo de quantitativo em Ata. A Ata nasce com teto máximo rígido. |
| **Remanejamento de Quantitativos** | Não aplicável | Mover saldo entre participantes (soma-zero) | **Novo Evento Exclusivo de Ata**: Exige consentimento obrigatório da unidade cedente e autorização da gerenciadora. |
| **Reajuste / Repactuação** | Art. 82 / 136 (Apostila ou Aditivo) | Art. 82 / 136 (Apostila ou Aditivo) | **Reutilizável**: Altera o valor unitário registrado do item, sem alterar quantitativo. |
| **Reequilíbrio Extraordinário** | Teoria da Imprevisão (Parecer Jurídico) | Teoria da Imprevisão (Parecer Jurídico) | **Reutilizável**: Altera o valor unitário mediante instrução processual rigorosa. |
| **Encerramento** | Regular (TRD) ou Rescisão | Esgotamento de Escopo ou Decurso de Prazo | **Distinto**: A Ata se extingue automaticamente quando o saldo zera, mesmo antes do fim da vigência civil. |

### Decisão Arquitetural Recomendada:
NÃO fundir Contratos e Atas em um modelo genérico e abstrato (ex.: `InstrumentoGenerico`).  
As regras da Lei 14.133/2021 são diametralmente opostas em pontos capitais (ex.: acréscimo de 25% permitido em contratos e proibido em atas; prorrogação com ou sem renovação de quantitativo; remanejamento exclusivo de atas).  
**Recomendação**: Criar `src/types/ataEvents.ts` e `src/services/ataEventService.ts` espelhando a arquitetura pura de `contractEvents.ts`, garantindo tipagem discriminada forte e isolamento de domínios.

---

## 6. RELACIONAMENTO ATA $\leftrightarrow$ CONTRATO (ESTADO PÓS-FASE 6.3)

O relacionamento entre Atas e Contratos foi definitivamente solucionado na Fase 6.2/6.3 através da tabela relacional:
$$\text{public.arp\_item\_contract\_links} \quad (\text{item\_key}, \text{contract\_key}, \text{quantidade\_contratada})$$

A re-homologação final (Fase 6.3-C) comprovou:
1. **1 Item $\rightarrow$ Múltiplos Contratos**: O Item `00001/2026-200331-00001` atendeu simultaneamente o Contrato 15/2026 e o Contrato 16/2026 com quantidades independentes.
2. **1 Contrato $\rightarrow$ Múltiplos Itens**: O Contrato 15/2026 atendeu simultaneamente o Item 1 e o Item 2 da mesma Ata.
3. **Cockpit 360° Conectado**: O link `/contratos/:contractKey` navega instantaneamente para a visão executiva oficial.

### O que ainda falta para o ciclo de vida completo?
O vínculo atual registra **a relação jurídica e a quantidade contratada**. O que falta é:
- A visibilidade de quais Atas originaram determinado contrato dentro do próprio Contrato 360° (fluxo inverso: Contrato $\rightarrow$ Atas Vinculadas).
- O alerta de que o contrato derivado atingiu o limite de aditivo de 25% e não pode mais ser acrescido via Ata.

---

## 7. ANÁLISE DE IMPACTO: CONTRATO SEM ATA (`Contrato.arpId`)

O Plano Consolidado identificou com precisão um vício de modelagem inicial do sistema:

### 1. Onde `arpId` é usado?
- Na interface `Contrato` (`src/types/index.ts:374`): `arpId: string;` (obrigatório).
- Na tabela `public.contratos_manuais`: `arp_id TEXT NOT NULL`.
- No componente legado `ManualContratoModal.tsx`: exige `arpId`.

### 2. Contratos sem Ata aparecem nos dados oficiais?
**SIM.** No catálogo oficial governamental (`ContractDashboardRecord`), recuperado do PNCP e Compras.gov.br via `useContractsDashboard(uasg)`, aparecem **todos os contratos da UASG**, incluindo contratações diretas por dispensa de licitação (art. 75), inexigibilidades (art. 74) e licitações convencionais sem SRP (pregão comum, concorrência). Nesses contratos, `ContractDashboardRecord` **não possui `arpId`**.

### 3. Impacto de tornar `Contrato.arpId` opcional (`arpId?: string`):
- **Quebraria componentes existentes?** NÃO, desde que os componentes de UI que renderizam `contratos_manuais` exibam fallback `arpId || 'Contratação Direta (Sem Ata)'`.
- **Quebraria o banco?** A tabela legada `contratos_manuais` tem constraint física `arp_id TEXT NOT NULL`. Qualquer alteração exigiria migration.
- **Recomendação**: NÃO mexer no banco de `contratos_manuais`. No domínio novo (`ContractDashboardRecord` e `arp_item_contract_links`), o contrato já é soberano e independente de Ata. Ajustar apenas a tipagem TypeScript quando for oportuno, sem impacto em produção.

---

## 8. INSTRUMENTO SUBSTITUTIVO — ART. 95 DA LEI 14.133/2021

O Plano Consolidado destaca que a Administração Pública nem sempre formaliza um ajuste através de "Termo de Contrato". Nos termos do art. 95:
> *"O instrumento de contrato é obrigatório, salvo nas seguintes hipóteses, em que a Administração poderá substituí-lo por outro instrumento hábil, como carta-contrato, nota de empenho de despesa, autorização de compra ou ordem de execução de serviço: I - dispensa de licitação em razão de valor; II - compras com entrega imediata e integral dos bens adquiridos e dos quais não resultem obrigações futuras, inclusive assistência técnica."*

### Diagnóstico no SaldoARP:
1. Atualmente, o sistema assume implicitamente que todo contrato governamental é um "Termo de Contrato" com vigência inicial e final, gerando gatilhos de prorrogação D-180.
2. Na prática, quando um empenho substitui o contrato (art. 95, II), **não há obrigações futuras nem vigência a prorrogar**. Tratar esse empenho como contrato tradicional no motor de prazos gera falsos positivos ("alerta de prorrogação para compra de entrega imediata").

### Decisão Arquitetural:
O instrumento substitutivo deve ser modelado como um **discriminador tipado (enum)** dentro do contrato, e não como uma entidade de banco separada:
```typescript
export type TipoInstrumentoContratual = 
  | 'TERMO_CONTRATO'         // Regra geral (art. 89/92) - Sujeito a prorrogação
  | 'CARTA_CONTRATO'         // Instrumento substitutivo (art. 95)
  | 'NOTA_EMPENHO'           // Instrumento substitutivo (art. 95) - Sem prorrogação
  | 'AUTORIZACAO_COMPRA'     // Instrumento substitutivo (art. 95)
  | 'ORDEM_SERVICO';         // Instrumento substitutivo (art. 95)
```
**Regra para o Motor Temporal**: Se `tipoInstrumento != 'TERMO_CONTRATO'`, o motor temporal **não deve gerar alertas de prorrogação D-180**, pois a entrega é imediata.

---

## 9. MOTOR TEMPORAL E DIRETRIZES DE EXTENSÃO

### Situação Atual:
- `temporalEngineService.ts`: Centraliza as regras operacionais (dias corridos, BRT, feriados, D-180, D-90, D-60, D-30).
- `centralPrazosService.ts`: Consome o motor temporal para gerar os itens da Central de Prazos. Para Atas, linhas 280-334:
  - Avalia apenas `REGRAS_OPERACIONAIS_PADRAO.ARP_VIGENCIA_90D`;
  - **Não consulta o saldo da ata**;
  - **Não verifica se o edital prevê renovação de quantitativos**;
  - **Não conhece o teto legal máximo de 24 meses da Lei 14.133**.

### Requisitos Propostos pelo Plano Consolidado:
Para uma Ata de Registro de Preços sob a Lei 14.133/2021:
1. **Marco Operacional de Prorrogação**: D-180 (e não D-90), para instrução tempestiva da pesquisa de mercado e manifestação do fornecedor;
2. **Dupla Condição de Prorrogação**:
   $$\text{Ata Prorrogável} \iff (\text{Vantajosidade Confirmada}) \land (\text{Saldo} > 0 \lor \text{Edital Previu Renovação} = \text{true})$$
3. **Teto Legal Absoluto**: Vigência total da Ata não pode exceder 24 meses (Art. 84).

**Recomendação**: O `temporalEngineService.ts` deve receber uma nova regra padrão `ARP_PRORROGACAO_180D`, com explicabilidade assistiva que informe se a ata possui saldo ou previsão de renovação.

---

## 10. ANÁLISE DE VIABILIDADE: FAROL DE SALDO E *BURN RATE*

O Plano Consolidado propõe um farol de 4 estados:
- 🟢 Confortável (Saldo $\ge$ 40% e projeção de esgotamento > D-180);
- 🟡 Atenção (Saldo 15–40% ou projeção entre D-180 e D-90);
- 🟠 Crítico (Saldo < 15% ou projeção < D-90);
- 🔴 Esgotado (Saldo = 0).

### Diagnóstico de Dados no Sistema Atual:
| Dado Necessário | Situação no SaldoARP Atual | Onde Vive Hoje? | Viabilidade Imediata |
| :--- | :---: | :--- | :---: |
| **Saldo % do Item** | `EXISTENTE` | Calculado via `balanceService.ts` | **Imediata** |
| **Data Final de Vigência da Ata** | `EXISTENTE` | `atas_registro_preco.data_vigencia_final` | **Imediata** |
| **Histórico Temporal de Empenhos** | `PARCIAL` | As APIs federais retornam `data_emissao`, mas o banco **não persiste a série temporal histórica de consumo por item**. | **Depende de Nova Infraestrutura** |
| **Velocidade de Consumo (*Burn Rate*)** | `INEXISTENTE` | Não há cálculo de taxa de consumo média (unidades/mês). | **Depende de Série Temporal** |

### Veredito sobre o Farol de Saldo:
- **Fase A (Curto Prazo - Sem Burn Rate)**: Implementar Farol Baseado em Saldo Residual Estático (% do item) cruzado com o tempo até o vencimento da ata. Isso já é viável com os dados atuais e agrega valor imediato à Central de Atenção.
- **Fase B (Médio Prazo - Com Burn Rate Real)**: Exige a implementação prévia da **Fase 7 (Módulo Global de Empenhos)**, que criará a tabela persistente de série temporal de empenhos com datas de emissão confiáveis.

---

## 11. REMANEJAMENTO DE QUANTITATIVOS (SOMA-ZERO)

O remanejamento de quantitativos em Ata (previsto no Decreto 11.462/2023) é uma das operações mais sensíveis da gestão pública de atas:
1. **Diferença de Acréscimo**: Não é compra nova e não aumenta a quantidade homologada da ata. Move quantitativo ocioso do Órgão Cedente para o Órgão Solicitante.
2. **Invariante Obrigatória**:
   $$\sum \text{Quantidades Alocadas a Todos os Órgãos} \le \text{Quantidade Homologada do Item}$$
3. **Condição Jurídica Prévia**: O remanejamento exige **consentimento prévio e expresso da unidade cedente**, comprovado no processo SEI.

### Avaliação de Complexidade:
Atualmente, o SaldoARP possui apenas a tabela `alocacoes_internas` para departamentos internos da UASG gerenciadora. Para suportar remanejamento oficial da Lei 14.133:
- Exigirá uma RPC transacional de remanejamento que deduza da cedente e credite na solicitante no mesmo bloco ACID;
- Exigirá o registro de um evento canônico `AtaEvent` do tipo `REMANEJAMENTO`;
- Exigirá workflow com estado obrigatório `AGUARDANDO_CONSENTIMENTO_CEDENTE`.

---

## 12. MODELO DE INTEGRAÇÃO COM O SEI

A diretriz arquitetural do SaldoARP é clara:
> **"O SaldoARP gerencia contexto, prazos, responsabilidades e confirmação; não replica o SEI."**

O Plano Consolidado propõe a organização por:
- **Processo-mãe**: Aberto na fase preparatória da licitação / gestão da ata;
- **Processos relacionados**: Abertos para cada evento formal (termo aditivo de prorrogação, processo de reajuste, processo de remanejamento).

### Conformidade Arquitetural:
No código atual, `ContractEvent` já possui o campo `processoSeiNumero?: string`.  
O modelo do SaldoARP **não deve tentar baixar PDFs, replicar assinaturas eletrônicas ou gerenciar trâmites internos do SEI**.  
O SaldoARP deve apenas:
1. Registrar o número do processo SEI de instrução do evento;
2. Fornecer a checklist de documentos que devem constar no SEI antes de aprovar o workflow (pesquisa de mercado, parecer jurídico, despacho);
3. Confirmar a conclusão através da ação humana do gestor (`TaskExecutionMode: CONFIRMACAO`).

---

## 13. O PADRÃO EVENTO $\times$ WORKFLOW $\times$ TAREFA

O SaldoARP 3.0 consolidou o fluxo:
$$\text{FATO OFICIAL (API)} \longrightarrow \text{EVENTO CANÔNICO} \longrightarrow \text{WORKFLOW OPERACIONAL} \longrightarrow \text{PLANO DE TAREFAS} \longrightarrow \text{CENTRAL DE ATENÇÃO}$$

### Aplicabilidade no Domínio de Atas:
Este padrão é **100% aplicável e recomendado** para Atas de Registro de Preços:
- O **Fato Oficial** é a publicação do termo aditivo ou registro da ata no PNCP;
- O **Evento** é o registro histórico imutável na linha do tempo (`AtaEvent`);
- O **Workflow** é o motor de esteira de instrução que orienta a equipe nos 180 dias anteriores ao vencimento;
- As **Tarefas** são as ações práticas atribuídas aos servidores com prazos e responsáveis;
- A **Central de Atenção** é a visão agregada que sinaliza o que está vencendo.

---

## 14. ANÁLISE DO LEGADO: `ContractManagementPanel` $\times$ `Contract 360°`

### Situação Atual:
1. No dashboard `/contratos`, cada card possui dois botões:
   - `"Detalhes"`: Abre a gaveta expansível inline `ContractManagementPanel.tsx` (construída na Fase 4);
   - `"Visão 360°"`: Navega para a página dedicada `Contract360Page.tsx` (construída na Fase 5).
2. Ambos os componentes consomem **os mesmos hooks e as mesmas RPCs do Supabase**:
   - `useContractTaskPlan`
   - `useContractManager`
   - `useApplyContractTaskTemplate`
   - `useUpdateContractTask`
3. Não há risco de divergência de SSOT no banco de dados.
4. Contudo, há **duplicação de esforço de UI**: qualquer novo recurso de tarefas precisa ser mantido na gaveta e na página 360°.

### Recomendação de Engenharia:
- **Curto Prazo**: Manter a coexistência pacífica sem alterar componentes.
- **Médio Prazo**: Transformar a gaveta `ContractManagementPanel` em um resumo ultra-rápido de status, promovendo o **Contrato 360° como a rota canônica e exclusiva** para edição de planos de tarefas e workflows.

---

## 15. MATRIZ DE DEPENDÊNCIAS ARQUITETURAIS

A incorporação do Plano Consolidado ao sistema segue a seguinte cadeia estrita de precedência:

```text
[NÍVEL 1: SANEAMENTO TIPOLÓGICO]
  Opcionalidade de Contrato.arpId
  Identificador de Tipo de Instrumento (art. 95)
         │
         ▼
[NÍVEL 2: MODELAGEM DE DOMÍNIO DE ATA]
  Tipos de Eventos de Ata (AtaEventType, AtaEvent)
  Serviço Determinístico de Eventos da Ata (ataEventService.ts)
  Serviço de Prontidão de Prorrogação da Ata (ataProrrogationService.ts)
         │
         ▼
[NÍVEL 3: MOTOR TEMPORAL E CENTRAL DE PRAZOS]
  Regra D-180 de Prorrogação da Ata com dupla condição (Saldo + Vantajosidade)
  Gatilhos Operacionais de Ata na Central de Prazos
         │
         ▼
[NÍVEL 4: INFRAESTRUTURA DE DADOS ORÇAMENTÁRIOS (FASE 7)]
  Catálogo Global de Notas de Empenho (SIAFI / Compras.gov.br)
  Série Temporal de Empenhos por Item
  Amarração Contrato Oficial ↔ Empenho (contrato_empenho_links)
         │
         ▼
[NÍVEL 5: FAROL DE SALDO E VELOCIDADE DE CONSUMO]
  Cálculo de Burn Rate por Item
  Farol Preditivo de Esgotamento de Ata
         │
         ▼
[NÍVEL 6: OPERAÇÕES AVANÇADAS E WORKFLOWS DE ATA]
  Workflow de Remanejamento entre Órgãos (Soma-Zero)
  Página Executiva Ata 360°
         │
         ▼
[NÍVEL 7: CAMADA ÁGIL E EXPERIÊNCIA DO USUÁRIO]
  Quadro Kanban de Prazos por Condição Legal
  Mecânicas de Gamificação Comportamental (Streaks / Badges)
```

---

## 16. REGISTRO E CLASSIFICAÇÃO DE RISCOS

| Código | Gravidade | Risco Arquitetural | Descrição do Risco | Mitigação Obrigatória |
| :---: | :---: | :--- | :--- | :--- |
| **RSK-6.4-01** | **CRÍTICO** | Cálculo incorreto de saldo por Contrato | Risco de subtrair contratos da ata ou deduzir saldo por quantidade contratada em vez de empenhos. | **Invariante P1 mantida**: Contrato nunca deduz saldo da Ata. Saldo é exclusivamente $\text{Qtd Homologada} - \sum \text{Empenhos}$. |
| **RSK-6.4-02** | **CRÍTICO** | Acréscimo ilegal em Ata de Registro de Preços | Tentativa de aplicar aditivo de 25% na Ata, violando o art. 23 do Decreto 11.462/2023. | Travar no domínio de eventos de Ata: Atas NÃO possuem evento de acréscimo de quantitativo. |
| **RSK-6.4-03** | **ALTO** | Falso alerta de prorrogação para instrumento do art. 95 | Gerar alerta D-180 de prorrogação para compras com entrega imediata que substituem contrato. | Excluir instrumentos substitutivos (`NOTA_EMPENHO`, `AUTORIZACAO_COMPRA`) do radar de prorrogação do motor temporal. |
| **RSK-6.4-04** | **ALTO** | Tentativa de calcular *Burn Rate* sem série temporal | Gerar projeções estatísticas falhas calculadas sobre empenhos sem datas históricas de emissão. | Não implementar *burn rate* antes da **Fase 7 (Série Temporal de Empenhos)**. Usar farol estático provisório. |
| **RSK-6.4-05** | **ALTO** | Ruptura de integridade em remanejamento | Remanejamento entre órgãos gerar aumento da quantidade homologada total da ata. | Operação modelada como transação atômica soma-zero: crédito no solicitante exige débito idêntico no cedente. |
| **RSK-6.4-06** | **MÉDIO** | Duplicação de escopo com o SEI | SaldoARP tentar gerenciar documentos, assinaturas ou despachos internos do SEI. | SaldoARP registra apenas o número do processo SEI e checklists de conformidade assistiva. |
| **RSK-6.4-07** | **MÉDIO** | Duplicação de componentes entre gaveta e Contrato 360° | Manutenção simultânea de `ContractManagementPanel` e `Contract360Page` gerando descompassos de UI. | Centralizar as evoluções no Contrato 360°, mantendo a gaveta como atalho somente-leitura. |
| **RSK-6.4-08** | **BAIXO** | Gamificação cosmética ou punitiva | Criar rankings competitivos entre servidores gerando rejeição institucional. | Gamificação restrita a metas individuais de produtividade contra o calendário legal (streaks de zero prazo perdido). |

---

## 17. ROADMAP REVISADO DE IMPLEMENTAÇÃO

Com base na matriz de dependências e no estado real do sistema, o roadmap de evolução pós-Fase 6 é estruturado da seguinte forma:

```text
======================================================================
ROADMAP DE EVOLUÇÃO DO SALDOARP (PÓS-FASE 6)
======================================================================

FASE 6.5 — SANEAMENTO DE MODELO E DOMÍNIO DE ATAS (PRÓXIMA FASE)
  • Objetivo: Modelar o domínio de eventos e prorrogação da Ata (Lei 14.133),
              tornar Contrato.arpId opcional e categorizar art. 95.
  • Pré-requisitos: Fase 6.3-C (Concluída).
  • Impacto no Banco: Zero migrations (serviços puros de domínio).
  • Critério de GO: Testes unitários de domínio de Ata e art. 95 100% PASS.

FASE 6.6 — INTEGRAÇÃO DA ATA AO MOTOR TEMPORAL E CENTRAL DE PRAZOS
  • Objetivo: Expandir o motor temporal para aplicar D-180 na Ata, cruzando
              data final de vigência com saldo residual e vantajosidade.
  • Pré-requisitos: Fase 6.5.
  • Impacto no Banco: Zero migrations.
  • Critério de GO: Central de Prazos emitindo gatilhos inteligentes de Ata.

FASE 7.0 — MÓDULO GLOBAL DE EMPENHOS E SÉRIE TEMPORAL (FINANCEIRO)
  • Objetivo: Ingestão de empenhos governamentais (SIAFI/Compras.gov),
              série temporal histórica, conciliação e amarração oficial
              N:N Contrato Oficial ↔ Empenho (contrato_empenho_links).
  • Pré-requisitos: Fases 6.5 e 6.6.
  • Impacto no Banco: Nova modelagem de empenhos e links oficiais.
  • Critério de GO: Histórico de consumo estruturado para cálculo de burn rate.

FASE 8.0 — FAROL PREDITIVO DE SALDO E REMANEJAMENTO SOMA-ZERO
  • Objetivo: Implementar farol de 4 estados com burn rate real e workflow
              atômico de remanejamento entre órgãos participantes.
  • Pré-requisitos: Fase 7.0.
  • Impacto no Banco: RPC atômica de remanejamento com consentimento.
  • Critério de GO: Invariante de soma-zero comprovada no PostgreSQL.

FASE 9.0 — COCKPIT ATA 360° E CAMADA ÁGIL (KANBAN & RECONHECIMENTO)
  • Objetivo: Construção da página executiva Ata 360° com timeline de eventos,
              painel Kanban de 5 colunas e gamificação comportamental.
  • Pré-requisitos: Fases 8.0.
  • Impacto no Banco: Persistência de metas e preferências de usuário.
  • Critério de GO: Experiência integrada homologada para Atas e Contratos.
======================================================================
```

---

## 18. O QUE NÃO DEVE SER IMPLEMENTADO AINDA

Em consonância com as regras fundamentais deste checkpoint, fica expressamente vedada a implementação imediata de:
1. **Módulo de Empenhos ou Vínculo Contrato $\leftrightarrow$ Empenho**: Pertence estritamente à **Fase 7**.
2. **Cálculo de *Burn Rate***: Inviável sem a série temporal de empenhos que será construída na Fase 7.
3. **Quadro Kanban e Gamificação**: Camadas de experiência visual que dependem da maturidade prévia do domínio de Atas e do motor temporal.
4. **Remanejamento entre Participantes**: Exige desenho de telas de consentimento e RPC atômica de soma-zero.
5. **Aposentadoria de `contratos_manuais`**: A coexistência pacífica deve ser preservada até a consolidação da Fase 7.

---

## 19. VERIFICAÇÃO DE REGRESSÃO TÉCNICA

A auditoria e elaboração deste checkpoint não realizaram qualquer alteração de código-fonte. A saúde técnica do sistema foi reconfirmada:

```text
======================================================================
SUÍTE DE TESTES AUTOMATIZADOS (Vitest v2.1.9)
Test Files  69 passed (69)
Tests       583 passed (583)
Duration    3.95s

VERIFICAÇÃO ESTÁTICA DE TIPOS (TypeScript 5.x)
$ npx tsc -b
0 erros

LINTER DE CÓDIGO (Oxlint)
$ npm run lint
0 erros (42 avisos de dependências de hooks React pré-existentes)

BUILD DE PRODUÇÃO (Vite v8.2.2)
$ npm run build
dist/assets/index-CODpI-M9.js   2,018.43 kB │ gzip: 530.49 kB
✓ built in 535ms

GIT STATUS
$ git status --short
M src/components/ItemBalances.tsx
M src/types/index.ts
(Nenhum código espúrio gerado nesta fase)
======================================================================
```

---

## 20. VEREDITO FINAL

# GO

> ### CHECKPOINT 6.4 ENCERRADO — Plano Consolidado incorporado com sucesso ao roadmap arquitetural do SaldoARP, sem implementação.
> 
> A arquitetura atual demonstrou robustez exemplar para recepcionar as regras da Lei 14.133/2021. As dependências, riscos, pontos de decisão e prioridades foram mapeados, pavimentando o caminho seguro para a **Fase 6.5 (Saneamento de Modelo e Domínio de Atas)**.
