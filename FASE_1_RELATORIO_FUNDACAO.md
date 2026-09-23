# RELATÓRIO OFICIAL — FASE 1: FUNDAÇÃO DO MODELO GERENCIAL DE ARPS E CONTRATOS

**Sistema**: SaldoARP  
**Data da Execução**: 23/09/2026  
**Status da Fase 1**: CONCLUÍDA COM SUCESSO  

---

## 1. Estado Encontrado

Antes do início da Fase 1, o SaldoARP operava com foco predominante em consulta, cache relacional e reconciliação contábil de itens de Atas de Registro de Preços (ARP), com suporte a contratos manuais e painel executivo de contratos federais.

A análise da rotina operacional (referenciada pela planilha de gestão `Contratos.xlsx`) revelou que a gestão real de contratos envolve múltiplos processos interdependentes: acompanhamento de vigências, controle de reajustes, prorrogações, gestão de tarefas e alocação de gestores, além de liquidações financeiras. 

A auditoria inicial constatou que:
* Dados oficiais das APIs governamentais eram consumidos corretamente, porém sem metadados padronizados de autoridade/linhagem que diferenciassem de forma visual e estrutural o dado oficial do dado operacional interno.
* Havia o risco latente de um processo de sincronização externo indiscriminado sobrescrever dados atribuídos internamente (como gestores e tarefas).
* Havia diferentes formas de lidar com identidade de contratos antes da consolidação de `resolveContractKey`.

---

## 2. Arquitetura Existente

A arquitetura do SaldoARP assenta-se sobre três camadas:

1. **Frontend (SPA React 18/19 + TypeScript + Vite)**:
   * Consumo de APIs governamentais via proxies reversos Serverless (`vercel.json`) para mitigação de CORS (`/api-arp/*`, `/api-pncp/*`, `/api-contratos-gov/*`).
   * Gerenciamento de estado e cache com `@tanstack/react-query` e Context API.
   * Motor matemático contábil isolado em `balanceService.ts` ($\mathbf{SaldoARP} = \mathbf{Qtd} - \sum \mathbf{Empenhos}$).

2. **Backend e Persistência Híbrida (Supabase PostgreSQL + LocalStorage Fallback)**:
   * Tabelas estruturadas com RLS e RBAC: `atas_registro_preco`, `itens_ata`, `alocacoes_internas`, `arp_allocations`, `empenho_links`, `manual_empenhos`, `manual_contratos`, `contrato_empenho`, `contract_managers`, `contract_task_templates`, `contract_task_plans`, `contract_tasks` e `processos_sei`.
   * RPCs PostgreSQL transacionais idempotentes para concorrência e integridade referencial.

3. **Identidade Canônica**:
   * ARP: `(numero_ata, codigo_uasg)`.
   * Item: `item_key = {numeroAta}-{codigoUasg}-{numeroItem}`.
   * Contrato: `contract_key = {uasg}-{numeroNormalizado}-{ano}` via `resolveContractKey`.
   * Processo SEI: `numero_processo_sei` com trava UNIQUE.

---

## 3. Integrações Existentes

| Fonte Governamental | Classificação | Status Real | Dados Efetivamente Obtidos |
| :--- | :--- | :--- | :--- |
| **Compras.gov.br (Dados Abertos)** | `INTEGRADA` | Ativa (`/modulo-arp` e `/modulo-contratos`) | Cabeçalhos de ARPs, itens homologados, quantitativos, limites de adesão carona, saldo por unidade e contratos/itens vinculados. |
| **Contratos.gov.br (API Comprasnet)** | `INTEGRADA` | Ativa (`/api/contrato/ug/{uasg}`) | Lista oficial de contratos da UG, objeto, fornecedor, CNPJ, vigências (início/fim), valor global/inicial e empenhos SIAFI associados. |
| **PNCP** | `PARCIALMENTE INTEGRADA` | Ativa (`/api-pncp/api/pncp/v1/...`) | Vigência oficial atualizada de Atas (prorrogações e cancelamentos), atas suplementares e links diretos de publicação. |
| **SEI** | `NÃO DISPONÍVEL (SEM API PÚBLICA)` | Gerido internamente via Supabase | O número do processo licitatório de compra vem na API oficial. O processo SEI de execução/fiscalização é gerido internamente via tabela `processos_sei`. |
| **SIAFI** | `PARCIALMENTE INTEGRADA (VIA CONTRATOS.GOV.BR)` | Ativa indiretamente | Números de empenho, valores empenhados, liquidados, pagos e restos a pagar obtidos do endpoint de empenhos da API Contratos.gov.br. |

---

## 4. Matriz Source of Truth

| Entidade | Campo | Fonte Canônica | Identificador da Fonte | Sincroniza? | Editável pelo Usuário? | Prioridade da Fonte |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Contrato** | `numero` | Contratos.gov / Compras.gov | `numero` | Sim | ❌ Não | 1 (Contratos.gov) |
| **Contrato** | `ano` | Contratos.gov / Compras.gov | `numero` / `data_assinatura` | Sim | ❌ Não | 1 (Contratos.gov) |
| **Contrato** | `uasg` | Contratos.gov / Compras.gov | `unidade_gestora` | Sim | ❌ Não | 1 (Contratos.gov) |
| **Contrato** | `fornecedorNome` | Contratos.gov / Compras.gov | `fornecedor.nome` | Sim | ❌ Não | 1 (Contratos.gov) |
| **Contrato** | `fornecedorCnpj` | Contratos.gov / Compras.gov | `fornecedor.cnpj_cpf_idgener` | Sim | ❌ Não | 1 (Contratos.gov) |
| **Contrato** | `objeto` | Contratos.gov / Compras.gov | `objeto` | Sim | ❌ Não | 1 (Contratos.gov) |
| **Contrato** | `valorGlobal` | Contratos.gov / Compras.gov | `valor_global` | Sim | ❌ Não | 1 (Contratos.gov) |
| **Contrato** | `dataVigenciaInicio` | Contratos.gov / Compras.gov | `vigencia_inicio` | Sim | ❌ Não | 1 (Contratos.gov) |
| **Contrato** | `dataVigenciaFim` | Contratos.gov / Compras.gov | `vigencia_fim` | Sim | ❌ Não | 1 (Contratos.gov) |
| **Contrato** | `numeroControlePncp`| PNCP / Compras.gov | `numeroControlePncpContrato`| Sim | ❌ Não | 1 (PNCP) |
| **Contrato** | `gestor_nome` | SaldoARP (`contract_managers`) | `contract_key` | ❌ Não | ✅ Sim | Interno |
| **Contrato** | `plano_tarefas` | SaldoARP (`contract_task_plans`) | `contract_key` | ❌ Não | ✅ Sim | Interno |
| **ARP** | `numeroAta` | Compras.gov / PNCP | `numeroAtaRegistroPreco` | Sim | ❌ Não | 1 (Compras.gov) |
| **ARP** | `vigenciaFinal` | PNCP / Compras.gov | `dataVigenciaFim` (PNCP) | Sim | ❌ Não | 1 (PNCP) |
| **Item** | `quantidadeHomologada`| Compras.gov | `quantidadeHomologadaItem` | Sim | ❌ Não | 1 (Compras.gov) |
| **Processo** | `processoCompra` | Compras.gov / Contratos.gov | `processo` | Sim | ❌ Não | 1 (Compras.gov) |
| **Processo** | `numeroProcessoSei`| SaldoARP (`processos_sei`) | `numero_processo_sei` | ❌ Não | ✅ Sim | Interno |

---

## 5. Alterações Realizadas na Fase 1

Cumprindo estritamente a autorização de execução e as diretrizes de simplicidade:

1. **Definição Explícita de Tipos e Separação de Campos (`src/types/index.ts`)**:
   * Adição de metadados simples de linhagem no nível do registro em `ContractDashboardRecord`: `sourceSystem`, `sourceRecordId`, `sourceUpdatedAt`, `lastSyncedAt`, `origem`.
   * Formalização das constantes imutáveis `OFFICIAL_CONTRACT_FIELDS` e `INTERNAL_CONTRACT_FIELDS`.
2. **Camada de Sincronização Não-Destrutiva (`src/services/contractService.ts`)**:
   * População padronizada dos metadados de proveniência nas consultas a Contratos.gov.br e Compras.gov.br.
   * Criação da função exportada `mergeOfficialAndInternalContractData`, que garante que dados oficiais atualizem o registro preservando intactos gestores, tarefas e observações internas.
3. **Refinamento Visual Discreto (`src/components/cards/ContractCard.tsx`)**:
   * Inclusão do indicador discreto `🔗 Fonte Oficial` com data de sincronização no tooltip, sem poluição visual.
4. **Suíte de Testes Automatizados de Integridade (`src/services/__tests__/dataLineageAndSyncIntegrity.test.ts`)**:
   * Cobertura de idempotência, zero duplicidade, preservação de dados internos, atualização oficial, campos derivados e separação estrita de autoridade.

---

## 6. Testes Executados

Foram executados todos os 46 arquivos de teste do projeto via Vitest:
* `src/services/__tests__/dataLineageAndSyncIntegrity.test.ts` (7 testes específicos da Fase 1)
* `src/utils/__tests__/contractKeyUtils.test.ts` (20 testes de resolução canônica)
* `src/services/__tests__/balanceService.test.ts` (47 testes de reconciliação contábil)
* `src/adapters/__tests__/contractManagementRpcAdapter.test.ts` (17 testes de RPCs de gestão)
* Demais 42 arquivos de testes de hooks, adapters, filtros e serviços.

Comando executado:
```bash
npx vitest run
```

---

## 7. Resultado dos Testes e Build

* **Testes Vitest**: **46 test files passed (46/46)** | **337 tests passed (337/337)** | **0 falhas**.
* **Build de Produção**: `npm run build` executado com sucesso (`tsc -b && vite build` com saída gerada em `dist/`).
* **Regressões**: Nenhuma regressão detectada.

---

## 8. Riscos e Limitações Identificados

1. **APIs Externas Sem Autenticação Governamental Externa**: O SaldoARP consome dados públicos abertos. O SEI e o SIAFI direto não possuem APIs abertas sem credenciais de barramento institucional; a dependência do Contratos.gov.br para dados do SIAFI é adequada e suficiente para o modelo atual.
2. **Variações de Preenchimento nos Órgãos**: Em contratos muito antigos ou excepcionais, o número do processo pode estar preenchido como número de licitação. O sistema trata isso com fallbacks defensivos.

---

## 9. Pontos que Ficaram Deliberadamente Fora do Escopo

Conforme determinação explícita para a Fase 1:
* ❌ Central de Prazos (Escopo da Fase 2/3);
* ❌ Workflows de Renovação e Prorrogação (Fase 4);
* ❌ Motor de Reajustes e Termos Aditivos complexos (Fase 5);
* ❌ Sistema de Notificações e Automações (Fase 9);
* ❌ Módulo Financeiro SIAFI H2H direto (Fase 7);
* ❌ Provedores genéricos de proveniência por campo (`DataProvenance<T>`) — evitado para conter complexidade.

---

## 10. Roadmap Recomendado para a Fase 2

Para a **Fase 2 (Motor de Prazos)**, a sequência lógica recomendada é:

1. **Formalização das Regras de Cálculo de Prazos**:
   * Horizon calculation: Contratos vigentes, contratos a vencer em 30/60/90 dias, contratos com prazo de renovação expirando.
   * Regras para prazos de reajuste (aniversário de 12 meses da proposta ou último termo aditivo).
2. **Serviço Centralizado de Prazos (`deadlineService.ts`)**:
   * Cálculos unificados baseados em $\text{Data-Base} + \text{Regra} + \text{Data-Atual}$ (sem persistência desnecessária de campos calculados).
3. **Painel / Visão Executiva de Prazos Críticos**:
   * Visualização clara das urgências operacionais para a equipe gestora.

---

> **Observação Final**: A Fase 1 encontra-se finalizada, com a fundação arquitetural estabelecida e auditada. O sistema aguarda instrução formal para o planejamento e início da Fase 2.
