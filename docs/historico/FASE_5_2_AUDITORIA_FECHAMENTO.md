# SALDOARP — RELATÓRIO DE AUDITORIA DE FECHAMENTO DA FASE 5.2

## Central de Atenção e Tarefas do Contrato 360°

---

## 1. Resumo Executivo

A auditoria de fechamento da **Fase 5.2 (Central de Atenção e Tarefas do Contrato 360°)** avaliou a aderência da interface e da camada operacional aos princípios arquiteturais consolidados no SaldoARP (Fases 4.1 a 4.4C e Fase 5.1).

A auditoria comprovou que a implementação:
1. **Respeitou a cadeia canônica**:
   $$\text{FATO OFICIAL} \longrightarrow \text{EVENTO} \longrightarrow \text{WORKFLOW} \longrightarrow \text{TASK} \longrightarrow \text{CENTRAL DE ATENÇÃO} \longrightarrow \text{USUÁRIO}$$
2. **Não criou segunda task engine**: Todas as tarefas consumidas e alteradas residem na infraestrutura canônica (`contract_tasks` / `ContractTaskPlan`) via RPCs atômicas no PostgreSQL (`update_contract_task_atomic`, `apply_contract_task_template_atomic`).
3. **Não criou segunda regra temporal**: A priorização e ordenação utilizam estritamente os métodos primitivos do `temporalEngineService` (`parseDateBRT`, `differenceInDays`) com fuso horário `America/Sao_Paulo`.
4. **Preservou a soberania das fontes oficiais**: Links externos para o PNCP e sistemas governamentais funcionam exclusivamente como atalhos contextuais de navegação, sem disparar mutações automáticas ou inferir publicações.
5. **Atingiu 100% de conformidade técnica**: 60 arquivos de teste (529 testes passando), TypeScript sem erros, Build de produção aprovado, Linter sem erros e zero migrations/RPCs novas.

**Resultado da Auditoria: GO**.

---

## 2. Arquitetura Real da Fase 5.2

```text
                                 FONTES OFICIAIS (PNCP / Contratos.gov.br)
                                                    │
                                                    ▼
                                            DADOS DO CONTRATO
                                                    │
                   ┌────────────────────────────────┴────────────────────────────────┐
                   ▼                                                                 ▼
         CENTRAL DE PRAZOS (Global)                                          CONTRATO 360° (/contratos/:key)
     (Gatilhos vigência + Tarefas agregadas)                                         │
                   │                                                                 ▼
                   │                                                    useContractTaskPlan(key)
                   │                                                                 │
                   │                                                                 ▼
                   │                                              ┌──────────────────┴──────────────────┐
                   │                                              ▼                                     ▼
                   │                                    CENTRAL DE ATENÇÃO                     TAREFAS E PROVIDÊNCIAS
                   │                            (Classificação & Ordenação de Urgência)       (Plano de Gestão por Macrotarefa)
                   │                                              │                                     │
                   └──────────────────────────────────────────────┴─────────────────────────────────────┘
                                                                  │
                                                                  ▼
                                                      RPC ATÔMICA POSTGRESQL
                                                  (update_contract_task_atomic)
                                                                  │
                                                                  ▼
                                                       TABELA contract_tasks
```

A UI atua exclusivamente como **camada de projeção e interação**, delegando o estado e as mutações transacionais ao backend canônico.

---

## 3. Auditoria Temporal

### 3.1 Classificação em `ContractAttentionCenter.tsx`
A função `classifyTaskAttention(task)` avalia o prazo limite (`task.prazo`) da seguinte forma:
- $D < 0$: `VENCIDA` (dias atrasada);
- $D = 0$: `HOJE` (vence hoje);
- $1 \le D \le 7$: `URGENTE` (vence em $D$ dias);
- $8 \le D \le 30$: `PROXIMA` (prazo: $D$ dias);
- Sem prazo ou $D > 30$: `SEM_PRAZO` / Neutro.

### 3.2 Respostas aos Questionamentos da Auditoria
1. **Apresentação visual vs Regra de negócio**: É uma regra de **apresentação visual e ordenação** de UX. Não persiste novos estados no banco nem altera colunas de domínio.
2. **Equivalência em `temporalEngineService`**: O `temporalEngineService` possui `deriveTemporalStatus` (`ATRASADO`, `VENCE_HOJE`, `VENCE_EM_BREVE`, `FUTURO`, `CONCLUIDO`) e `deriveAtencaoNivel` (`CRITICO`, `ATENCAO`, `NORMAL`). A subdivisão visual de $1..7$ dias (`URGENTE`) e $8..30$ dias (`PROXIMA`) refina a usabilidade sem violar o limiar de 30 dias de `VENCE_EM_BREVE`.
3. **Risco de divergência**: **NULO**. Ambas as rotinas utilizam as primitivas compartilhadas `parseDateBRT` e `differenceInDays`, garantindo o mesmo cálculo de dias $D$.
4. **Cálculo de timezone**: O cálculo utiliza rigorosamente `parseDateBRT`, que normaliza para meia-noite local no fuso horário oficial `America/Sao_Paulo`, eliminando distorções de UTC.
5. **Classificação do Ponto**: **ACEITÁVEL** (Apresentação visual pura acoplada a primitivas canônicas).

---

## 4. Auditoria de Conclusão de Tarefas

| Critério | Avaliação | Constatação |
| :--- | :--- | :--- |
| **Hook Utilizado** | `useUpdateContractTask(contractKey)` | Conecta ao adapter `updateContractTaskRpc`. |
| **RPC Canônica** | `update_contract_task_atomic` | Execução transacional com `SECURITY DEFINER` e RBAC (`gestor`/`admin`). |
| **Atomicidade** | Total | Executa em bloco transacional único no PostgreSQL. |
| **Remoção da Central** | Imediata | Filtra `status !== 'CONCLUIDA' && status !== 'NAO_APLICAVEL'`. Ao concluir, sai da lista ativa. |
| **Invalidação de Cache** | Correta | `onSuccess` invalida a query key `['contract-task-plan', contractKey]`. |
| **Preservação de Histórico** | Sim | Preenche automaticamente `concluido_em = NOW()` e `concluido_por`. |
| **Impacto em Workflows/Contrato** | **Isolado** | Concluir uma tarefa altera **apenas** o registro em `contract_tasks`. Não encerra o contrato e não altera fatos governamentais. |

---

## 5. Auditoria de Aplicação de Templates (`useApplyContractTaskTemplate`)

1. **Origem e Existência**: A funcionalidade e a RPC `apply_contract_task_template_atomic` já existiam na infraestrutura do SaldoARP (Fase 3 / Gestão Contratual).
2. **Comportamento na Fase 5.2**: O componente `ContractTasksSection` apenas expõe o seletor de modelos quando o contrato ainda não possui plano (`if (!plan)`).
3. **Idempotência e Não-duplicação**: A RPC no banco valida:
   ```sql
   IF EXISTS (SELECT 1 FROM public.contract_task_plans WHERE contract_key = v_contract_key) THEN
     RAISE EXCEPTION 'CONTRACT_PLAN_ALREADY_EXISTS: O contrato "%" já possui um plano de gestão aplicado.', v_contract_key;
   END IF;
   ```
4. **Independência Operacional**: Uma vez aplicado, o plano de tarefas do contrato é copiado por valor e opera de forma 100% desacoplada do template original.
5. **Conclusão**: Alinhado à arquitetura canônica, sem risco de geração de tarefas artificiais ou sobrescrita acidental.

---

## 6. Auditoria de Edição Inline

- **Campos Editáveis**: `responsavel_nome`, `prazo` (data limite), `observacao`, `status`.
- **Fonte de Verdade**: Colunas da tabela `public.contract_tasks`.
- **Validação**: Validação de payload no adapter TypeScript e validação de enum de status na RPC PL/pgSQL.
- **Distinção Crítica de Prazo**: A edição de `prazo` altera o **prazo operacional interno daquela tarefa específica**, e **NÃO** altera a vigência oficial do contrato nem os marcos temporais derivados pelo `temporalEngineService` a partir de dados oficiais.

---

## 7. Auditoria de TaskExecutionMode (Fase 4.3C)

- **Modos Suportados**: `INTERNA`, `EXTERNA`, `AUTOMATICA`, `CONFIRMACAO`.
- **Comportamento na UI**:
  - Exibição de badge com estilo semântico diferenciado (cores e rótulos).
  - Disponibilização do link para o sistema de destino (`task.sistemaDestino` / `task.externalLinkUrl`).
  - Disponibilização de atalho PNCP para tarefas do tipo `CONFIRMACAO`.
- **Regra de Não-Interferência**: A UI não toma decisões de negócio, não executa mutações automáticas e não bloqueia ações com base no modo.

---

## 8. Auditoria de Confirmação Oficial

- **Atalho PNCP**: Para tarefas em modo `CONFIRMACAO`, a UI renderiza o botão *"Verificar no PNCP"* apontando para `contract.linkPncp` com abertura em nova aba (`target="_blank"`).
- **Invariante Respeitada**:
  $$\text{Abrir PNCP} \neq \text{Confirmar PNCP}$$
- O clique no link externo é puramente informativo e de navegação. A conclusão da tarefa continua exigindo a ação deliberada do gestor ou a confirmação oficial via integração.

---

## 9. Central de Atenção × Central de Prazos

| Aspecto | Central de Prazos (Global) | Central de Atenção (Contrato 360°) |
| :--- | :--- | :--- |
| **Escopo** | Todos os contratos e ARPs da UASG | Contrato específico (`contractKey`) |
| **Fonte de Tarefas** | `contract_tasks` via `centralPrazosService` | `contract_tasks` via `useContractTaskPlan` |
| **Foco** | Agenda cronológica macro e gatilhos | Priorização de pendências ativas do contrato |
| **Ordenação** | Data-alvo cronológica | Severidade temporal ($D < 0 \to D = 0 \to 1..7 \to 8..30 \to \text{sem prazo}$) |
| **Consistência** | Mesmas funções de data do `temporalEngineService` | Mesmas funções de data do `temporalEngineService` |

---

## 10. Auditoria de Fonte de Verdade e Dados Fictícios

- **Dados Fictícios / Mocks**: **ZERO**. Nenhum mock, stub ou texto sintético foi adicionado ao código de produção.
- **Identificadores**: Utilizam chaves canônicas resolvidas via `getContractManagementKey(uasg, numero, ano)` ou `contract.id`.
- **Estado Positivo**: Exibe *"Tudo em dia com este contrato"* somente quando não há tarefas com `status !== 'CONCLUIDA' && status !== 'NAO_APLICAVEL'`.

---

## 11. Auditoria de Cache e React Query

- **Query Key Principal**: `['contract-task-plan', contractKey]`.
- **Invalidação**: Todas as mutações (`useUpdateContractTask`, `useApplyContractTaskTemplate`) disparam `queryClient.invalidateQueries` no callback `onSuccess`.
- **Ausência de Descompasso**: Não há estados locais duplicando tarefas do backend; a interface atualiza reativamente após cada mutação.

---

## 12. Auditoria de Concorrência

- As atualizações de tarefas ocorrem via RPC atômica (`update_contract_task_atomic`) com locking em nível de linha (`WHERE id = v_task_id`).
- Timestamps de auditoria (`atualizado_em`, `concluido_em`) são atualizados diretamente pelo PostgreSQL (`NOW()`), garantindo rastreabilidade precisa.

---

## 13. Verificação de Testes, Build, Lint e Git

### 13.1 Testes Automatizados
```bash
npm test -- --run
```
- **Resultado**: 60 arquivos de teste, **529/529 testes PASS** (100% verde).
- **Tempo de execução**: 5.47s.

### 13.2 Typecheck & Build
```bash
npm run build
```
- **Resultado**: `tsc -b` executado com 0 erros. Bundle de produção gerado com sucesso via Vite.

### 13.3 Linter
```bash
npm run lint
```
- **Resultado**: `oxlint` executado com **0 erros** em 219 arquivos.

### 13.4 Git Status & Diff
- **Novas Migrations**: 0.
- **Novas RPCs**: 0.
- **Alterações no Banco**: Nenhuma.

---

## 14. Tabela de Achados da Auditoria

| ID | Classificação | Componente | Descrição | Status |
| :--- | :--- | :--- | :--- | :--- |
| **ACH-5.2-01** | **INFO** | `ContractAttentionCenter` | Subdivisão de UI dos prazos de 1 a 7 dias (`URGENTE`) e 8 a 30 dias (`PROXIMA`) para priorização visual no card. | Aceitável e Seguro |
| **ACH-5.2-02** | **INFO** | `ContractTasksSection` | Formulário expansível de edição inline utiliza estado local transitório (`useState`) antes da submissão à RPC atômica. | Aceitável e Seguro |
| **ACH-5.2-03** | **INFO** | `Contract360Page` | Chamada incondicional de `useContractTaskPlan` no topo do componente, em conformidade com as regras de hooks do React. | Conforme |

*Nenhum achado CRÍTICO, ALTO ou MÉDIO foi encontrado.*

---

## 15. Decisão de Homologação

```text
==============================================================================
                              PARECER FINAL: GO
==============================================================================
- Segunda task engine:                    NÃO DETECTADA (0)
- Segunda regra temporal de negócio:       NÃO DETECTADA (0)
- Fabricação de fato oficial / Mocks:     NÃO DETECTADA (0)
- Duplicação de fonte de verdade:         NÃO DETECTADA (0)
- Soberania das fontes oficiais:          PRESERVADA
- Isolamento de tarefas vs contratos:     PRESERVADO
- Testes Automatizados:                   529/529 PASS (100%)
- Build de Produção:                      PASS
- Linter:                                 PASS (0 erros)
==============================================================================
A Fase 5.2 está formalmente AUDITADA, APROVADA e HOMOLOGADA.
O SaldoARP está pronto para a Fase 5.3 (Timeline de Eventos do Contrato 360°).
==============================================================================
```
