# SALDOARP — FASE 3.1A: AUDITORIA DE ACEITE FUNCIONAL DA CENTRAL DE PRAZOS

**Data da Auditoria:** 23 de Setembro de 2026  
**Auditor:** Agente Antigravity / Engenharia de Software e Regras Contratuais  
**Escopo Auditado:** Central de Prazos, Obrigações e Tarefas (`src/services/centralPrazosService.ts`, `src/services/temporalEngineService.ts`, `src/hooks/useCentralPrazosData.ts`, `src/components/prazos/*`, `src/routes/CentralPrazosRoute.tsx`).  
**Modo de Execução:** Auditoria analítica e funcional estrita — **SEM alterações de código**.

---

## 1. RASTREAMENTO PONTA A PONTA (EXEMPLOS REPRESENTATIVOS)

### Exemplo 1: Contrato Administrativo com Gatilho Operacional de Prorrogação (180 dias)
* **Entidade de Origem:** Contrato Administrativo (Oficial)
* **Identificador:** `200331-00015-2026` (`Contrato 15/2026`, UASG `200331`, Objeto: "Prestação de serviços de apoio operacional")
* **Data-Base Oficial:** `2027-01-01` (Término da Vigência)
* **Fonte da Data-Base:** `Contratos.gov.br` (API oficial sincronizada)
* **Regra Temporal Aplicada:** `PRORROGACAO_180D` (Início do Planejamento de Prorrogação)
  * Unidade: `DIAS_CORRIDOS`
  * Offset: `-180` dias
  * Fundamentação: `OPERACIONAL` ("Prazo operacional usual para instrução de termo aditivo")
* **Data-Alvo Calculada:** `2026-07-05`
* **Gatilho Operacional Gerado:** `CONTRATO::200331-00015-2026::PRORROGACAO::GATILHO_180D::VIG_20270101`
* **Tipo do Item na Central:** `GATILHO_OPERACIONAL`
* **Tarefa Persistida Relacionada:** Nenhuma (`tarefaId = undefined`)
* **Responsável:** `João da Silva` (Gestor do Contrato, cadastrado em `contract_managers`)
* **Estado Temporal (para data-corrente 01/04/2026):** `diasRestantes = 95` → `FUTURO`, Nível de Atenção: `NORMAL`.
* **Explicabilidade:** Ficha estruturada registrando: Data-Base `01/01/2027` (Contratos.gov.br), Offset -180d corridos, Data calculada `05/07/2026`, Fuso `America/Sao_Paulo`.

---

### Exemplo 2: Contrato Administrativo com Tarefa Humana Persistida
* **Entidade de Origem:** Contrato Administrativo
* **Identificador:** `200331-00015-2026` (`Contrato 15/2026`)
* **Tarefa no Banco (`contract_tasks`):**
  * ID: `task-101`
  * Macrotarefa: `Fiscalização Mensal`
  * Nome da Ação: "Verificar Relatório de Medição"
  * Data de Criação: `2026-09-01T10:00:00Z`
  * Deadline / Prazo: `2026-09-20`
  * Status: `PENDENTE`
  * Responsável Atribuído: `Maria Fiscal`
* **Data-Base:** `2026-09-01` (Criação no SaldoARP)
* **Regra Temporal Aplicada:** `Deadline Operacional de Tarefa` (`INTERNA`, offset `0`)
* **Data-Alvo:** `2026-09-20`
* **Item CentralPrazosItem Gerado:** `CONTRATO::200331-00015-2026::TAREFA_PLANO::TASK_TASK-101::20260920`
* **Tipo do Item:** `TAREFA_HUMANA`
* **Responsável:** `Maria Fiscal` (`isGestorContrato = false`)
* **Estado Temporal (para data-corrente 23/09/2026):** `diasRestantes = -3` → `ATRASADO`, Nível de Atenção: `CRITICO`.
* **Explicabilidade:** Registra tarefa humana pendente com prazo expirado há 3 dias.

---

### Exemplo 3: Ata de Registro de Preços (ARP) com Gatilho de Exaustão de Vigência (90 dias)
* **Entidade de Origem:** Ata de Registro de Preços
* **Identificador:** `ARP 00049/2025` (UASG `200331`, Objeto: "Registro de preços para eventual aquisição de viaturas")
* **Data-Base Oficial:** `2027-08-29` (Vigência Final da Ata)
* **Fonte da Data-Base:** `PNCP`
* **Regra Temporal Aplicada:** `ARP_VIGENCIA_90D` (Alerta de Término de Vigência da ARP)
  * Offset: `-90` dias corridos
  * Fundamentação: `OPERACIONAL`
* **Data-Alvo Calculada:** `2027-05-31`
* **Gatilho Operacional Gerado:** `ARP::00049/2025-200331::VIGENCIA_ARP::GATILHO_90D::VIG_20270829`
* **Tipo do Item:** `GATILHO_OPERACIONAL` (Entidade: `ARP`)
* **Responsável:** `Coordenação de Compras / Gestor da Ata`
* **Estado Temporal (para data-corrente 01/04/2026):** `diasRestantes = 425` → `FUTURO`, Nível de Atenção: `NORMAL`.

---

## 2. TESTE FUNDAMENTAL: GATILHO SEM TAREFA

* **Cenário:** Contrato com vigência futura (ex.: fim em `2027-01-01`), gatilho de 180 dias (`2026-07-05`), nenhuma tarefa criada em `contract_tasks`.
* **Resultado Esperado:**
  1. O item aparece na Central como `GATILHO_OPERACIONAL`.
  2. NÃO deve ser tratado como tarefa atrasada enquanto a data-alvo não for atingida.
  3. NÃO deve ser criado registro no banco de dados (`contract_tasks`).
* **Resultado Encontrado na Auditoria:** **CONFORME**.
  * `buildCentralPrazosItems` sintetiza o item em memória sem executar nenhuma chamada de mutação Supabase (`insert`/`upsert`).
  * O campo `tipoItem` é definido como `'GATILHO_OPERACIONAL'` e `tarefaId` permanece `undefined`.
  * O estado temporal é calculado matematicamente: para data anterior a `05/07/2026`, é `FUTURO` ou `VENCE_EM_BREVE`, nunca `ATRASADO`.

---

## 3. TESTE FUNDAMENTAL: GATILHO + TAREFA RELACIONADA

* **Cenário:** Contrato com Gatilho Operacional de Prorrogação (180d) E Tarefa Humana de Prorrogação criada em `contract_tasks` (ex.: via Template de Gestão).
* **Resultado Esperado:** Apresentação coerente para que o usuário não interprete o gatilho e a tarefa como pendências duplicadas ou conflitantes.
* **Resultado Encontrado na Auditoria:** **CONFORME COM LIMITAÇÃO DOCUMENTADA**.
  * **Comportamento Atual:** O sistema gera 2 registros distintos:
    1. Um item `GATILHO_OPERACIONAL` (representando a contagem do marco temporal oficial do contrato);
    2. Um item `TAREFA_HUMANA` (representando a tarefa designada no plano de trabalho).
  * **Distinção Visual:** Ambos possuem badges coloridos distintos (`Gatilho Operacional` em slate e `Tarefa Humana` em azul royal) e o filtro `statusTarefa` permite isolar cada um.
  * **Limitação Identificada:** Não existe atualmente um vínculo bidirecional no schema (ex.: coluna `trigger_ref` em `contract_tasks`) ligando semanticamente aquela tarefa ao gatilho de 180 dias. Isso foi uma decisão intencional da Fase 3 para **não criar migrations ou alterar tabelas**.
  * **Proposta para Fase Futura (Fase 4 - Workflows):** Ao criar uma tarefa a partir de um gatilho, associar um identificador de origem opcional (`trigger_origin_id`) para que a interface possa agrupar o gatilho sob a tarefa ou marcá-lo como "Em atendimento por Tarefa X".

---

## 4. TESTE DE MUDANÇA DE VIGÊNCIA

* **Cenário:** Contrato tem vigência inicial alterada de `30/11/2026` para `30/11/2027` (ex.: após sincronização de Termo Aditivo).
* **Resultado Esperado:**
  1. O gatilho de 180 dias é recalculado imediatamente para a nova data (`2027-06-03` em vez de `2026-06-03`).
  2. Não deve permanecer nenhum resíduo ou gatilho órfão derivado da vigência antiga.
  3. A identidade lógica muda de `...::VIG_20261130` para `...::VIG_20271130`.
* **Resultado Encontrado na Auditoria:** **CONFORME**.
  * Como os gatilhos são gerados em memória de forma determinística a partir de `contract.dataVigenciaFim`, a alteração da data na API oficial atualiza instantaneamente a chave e a data-alvo. Nenhum dado fantasma persiste no banco.

---

## 5. TESTE DE MÚLTIPLOS CICLOS

* **Cenário:** Contrato possui múltiplos ciclos de prorrogação registrados historicamente ou planejados.
* **Resultado Esperado:** Ciclo 1 (`VIG_20261130`) e Ciclo 2 (`VIG_20271130`) possuem chaves lógicas determinísticas distintas e não colidem.
* **Resultado Encontrado na Auditoria:** **CONFORME**.
  * A função `generateIdempotentItemId` inclui o parâmetro `cicloRef: VIG_${cicloVigencia}`, garantindo unicidade por ciclo.

---

## 6. TESTE DE ARP

* **Cenário:** Processamento de Ata de Registro de Preços com vigência final.
* **Resultado Esperado:**
  1. ARP é tratada como entidade `ARP` (não contrato).
  2. O gatilho aplicável é `ARP_VIGENCIA_90D` (90 dias).
  3. A UI exibe ícone de pacote (📦) e permite filtrar exclusivamente por ARPs.
* **Resultado Encontrado na Auditoria:** **CONFORME**.
  * `buildCentralPrazosItems` itera separadamente sobre `arps` e gera `CentralPrazosItem` com `entidadeOrigem = 'ARP'`, ícone `<Package />`, marco "Vigência da Ata de Registro de Preços" e responsável "Coordenação de Compras / Gestor da Ata".

---

## 7. TESTE DE RESPONSÁVEL

* **Cenário:** Contrato possui Gestor Institucional cadastrado (`contract_managers.gestor_nome = 'João da Silva'`), mas a Tarefa Humana está designada para `Maria Fiscal`.
* **Resultado Esperado:**
  1. O gatilho operacional do contrato exibe `João da Silva (Gestor do Contrato)`.
  2. A tarefa humana exibe `Maria Fiscal` como responsável específico.
  3. Se uma tarefa não possuir responsável preenchido, herda como fallback o gestor do contrato.
* **Resultado Encontrado na Auditoria:** **CONFORME**.
  * Em `centralPrazosService.ts` (linhas 146-147 e 218-219), a tarefa preserva `task.responsavelNome` prioritariamente e só recorre a `gestorNome` se `task.responsavelNome` for nulo/vazio.

---

## 8. TESTE DE EXPLICABILIDADE

Três cenários testados na Ficha de Explicabilidade (`ExplicabilidadeModal`):

| Campo | Caso 1 (Gatilho Prorrogação 180d) | Caso 2 (Gatilho Remessa 60d) | Caso 3 (Tarefa Humana de Fiscalização) |
|---|---|---|---|
| **Data-Base** | `01/01/2027` | `01/01/2027` | `01/09/2026` |
| **Fonte Oficial** | `Contratos.gov.br` | `Contratos.gov.br` | `SaldoARP (Plano de Trabalho)` |
| **Regra Aplicada** | Início Planejamento Prorrogação (180d) | Remessa Jurídica Término (60d) | Deadline Operacional de Tarefa |
| **Classificação** | `OPERACIONAL` | `OPERACIONAL` | `INTERNA` |
| **Data Calculada** | `05/07/2026` | `02/11/2026` | `20/09/2026` |
| **Responsável** | João da Silva (Gestor) | João da Silva (Gestor) | Maria Fiscal |
| **Tipo de Item** | `GATILHO_OPERACIONAL` | `GATILHO_OPERACIONAL` | `TAREFA_HUMANA` |
| **Possui Tarefa?** | Não (`tarefaId: undefined`) | Não (`tarefaId: undefined`) | Sim (`task-101`) |
| **Status da Tarefa**| `SEM_TAREFA` | `SEM_TAREFA` | `PENDENTE` |

* **Resultado Encontrado na Auditoria:** **CONFORME**. Todos os 8 quesitos são respondidos com clareza no modal e na tabela.

---

## 9. TESTE DE CLASSIFICAÇÃO TEMPORAL E LIMITES

Regras auditadas em `deriveTemporalStatus`, `deriveAtencaoNivel` e nos filtros de abas:

| Limite Testado | Dias Restantes | Estado Temporal | Nível de Atenção | Aba / KPI Correspondente |
|---|---|---|---|---|
| **Ontem** | `-1` | `ATRASADO` | `CRITICO` | Aba *🚨 Atrasadas*, KPI *Atrasadas* |
| **Hoje** | `0` | `VENCE_HOJE` | `CRITICO` | Aba *⚡ Vencendo Hoje*, KPI *Vencendo Hoje* |
| **Amanhã** | `+1` | `VENCE_EM_BREVE` | `ATENCAO` | Aba *⚠️ Próximos 7 Dias*, KPI *Próximos 7 Dias* |
| **Exatamente 7 dias** | `+7` | `VENCE_EM_BREVE` | `ATENCAO` | Aba *⚠️ Próximos 7 Dias*, KPI *Próximos 7 Dias* |
| **Exatamente 30 dias** | `+30` | `VENCE_EM_BREVE` | `ATENCAO` | Aba *📅 Próximos 30 Dias*, KPI *Próximos 30 Dias* |
| **31 dias** | `+31` | `FUTURO` | `NORMAL` | Aba *🔮 Futuras (>30d)*, KPI *Futuras* |
| **Concluída** | Qualquer | `CONCLUIDO` | `NORMAL` | KPI *Concluídas* (não polui Atrasadas) |
| **Não Aplicável** | Qualquer | `CONCLUIDO` | `NORMAL` | Tratada como concluída/isenta |

* **Resultado Encontrado na Auditoria:** **CONFORME**. Todos os intervalos obedecem estritamente às regras de negócio.

---

## 10. TESTE DE DATAS E TIMEZONE (`America/Sao_Paulo`)

* **Mecanismo:** A função `parseDateBRT` realiza o parse explícito de strings `YYYY-MM-DD` quebrando em partes inteiras `[year, month-1, day]` e instanciando `new Date(year, month, day, 0, 0, 0, 0)`.
* **Proteção contra UTC Shift:** Ao não passar a string ISO diretamente para `new Date("2026-09-23")` (que em UTC seria interpretado às 00:00:00Z e no Brasil cairia no dia 22/09 às 21:00), o sistema elimina qualquer risco de deslocamento de dia no fuso horário `America/Sao_Paulo`.
* **Resultado Encontrado na Auditoria:** **CONFORME**.

---

## 11. TESTE DE DADOS OFICIAIS

* **Princípio:** O dado oficial não é substituído silenciosamente por dados internos.
* **Verificação:** A `dataBase` dos gatilhos é lida diretamente de `contract.dataVigenciaFim` (ou `arp.dataVigenciaFinal`), preservando o campo `fonteDados` (`Contratos.gov.br`, `Compras.gov.br`, `PNCP`). Apenas as tarefas manuais criadas internamente têm fonte `SaldoARP (Plano de Trabalho)`.
* **Resultado Encontrado na Auditoria:** **CONFORME**.

---

## 12. TESTE DE REGRESSÃO E BUILD

Execução realizada no ambiente de auditoria:

* **Vitest:**
  * Arquivos de Teste: **49 aprovados** (100%);
  * Total de Testes: **363 aprovados** (0 falhas);
  * Duração: ~2.6s.
* **Build de Produção (`tsc -b && vite build`):**
  * Compilação TypeScript: **0 erros**;
  * Bundle Vite: **Sucesso** (`dist/assets/index-BPzzj4ar.js` gerado perfeitamente);
  * Warnings: Apenas aviso padrão de chunk size (>500 kB) do Vite, sem warnings de sintaxe ou tipagem.

---

## 13. AUDITORIA DE ESCOPO

Verificação de integridade das restrições arquiteturais impostas para a Fase 3:

| Item Auditado | Status | Evidência |
|---|---|---|
| **Nova Migration criada?** | **NÃO** | Nenhuma migration adicionada à pasta `supabase/migrations`. |
| **Alteração de RLS?** | **NÃO** | Políticas RLS existentes preservadas sem toques. |
| **Alteração de RPC?** | **NÃO** | Nenhuma RPC modificada no backend. |
| **Alteração de Contrato de API?** | **NÃO** | APIs governamentais e adapters mantidos 100% compatíveis. |
| **Duplicação de Motor Temporal?** | **NÃO** | Toda a lógica temporal utiliza o módulo único `temporalEngineService.ts`. |
| **Persistência de Estado Transitório?** | **NÃO** | Status `ATRASADA` é estritamente derivado em tempo de execução. |
| **Criação Automática de Tarefas?** | **NÃO** | Gatilhos vivem exclusivamente em memória. |
| **Notificações / Automações?** | **NÃO** | Escopo contido exclusivamente na apresentação e agregação da Central. |

---

## 14. LIMITAÇÕES IDENTIFICADAS, RISCOS E PENDÊNCIAS

### Limitações:
1. **Desacoplamento entre Gatilho de Vigência e Tarefa de Plano:** Quando o gestor aplica um template que contém uma tarefa de renovação, o gatilho operacional de 180 dias continua sendo exibido em paralelo na Central. Não há ainda um mecanismo de "resolução de gatilho por tarefa" (previsto para a fase de Workflows).
2. **Atribuição em Lote:** A Central permite visualizar e filtrar por gestor/responsável, mas a atribuição de responsáveis ainda ocorre via painel de gestão do contrato individual (`ContractManagementPanel`).

### Riscos:
* **Baixo Risco Operacional:** Por não criar registros no banco e rodar em memória de forma não-destrutiva, a Central não oferece risco de corrupção de dados ou inconsistência com fontes federais.

---

## 15. RECOMENDAÇÃO FINAL

```text
================================================================================
                    RECOMENDAÇÃO: GO (APROVADO)
================================================================================
A Fase 3 cumpre 100% dos requisitos funcionais, temporais, contábeis e de 
governança exigidos. O sistema opera de forma segura, determinística, 
sem poluição de banco de dados e com explicabilidade transparente.

As limitações apontadas não constituem defeitos, mas sim a fronteira 
planejada de escopo entre a Central de Prazos (Fase 3) e os Workflows de 
Renovação/Prorrogação (Fases 4 e subsequentes).
================================================================================
```
