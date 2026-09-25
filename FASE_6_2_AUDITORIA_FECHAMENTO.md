# RELATÓRIO DE AUDITORIA DE FECHAMENTO — FASE 6.2
## VÍNCULO ARP ↔ CONTRATO OFICIAL

**Data da Auditoria**: 24 de Setembro de 2026  
**Auditor**: Antigravity Verification Agent  
**Veredito Final**: **HOLD** (Ajustes Mandatórios de Integridade Relacional e SSOT)  
**Status da Suíte**: 69 arquivos de teste / 581 testes PASSING (100%) | TypeScript PASS | Lint PASS | Build PASS  

---

## 1. OBJETIVO DA AUDITORIA

Auditar rigorosamente o fechamento da **Fase 6.2 — Implementação do Vínculo ARP ↔ Contrato Oficial**, confrontando a implementação entregue com a arquitetura canônica aprovada na Fase 6.1 e nas fases anteriores do SaldoARP.

Especial ênfase foi dedicada à verificação de dois pontos críticos solicitados:
1. A existência e o comportamento do **fallback offline em `localStorage`**;
2. A vinculação de **empenhos de lastro** no modal `LinkContractModal` e nas tabelas relacionais do banco.

---

## 2. ESTADO DA IMPLEMENTAÇÃO

A entrega da Fase 6.2 compreendeu:
- Migration: `supabase/migrations/20260924000015_arp_item_contract_links.sql`
- Nova tabela: `public.arp_item_contract_links` (com índices e constraint UNIQUE)
- Novas RPCs: `public.link_contract_to_item_atomic` e `public.unlink_contract_from_item_atomic`
- Tipos TypeScript: `src/types/arpContractLinks.ts`
- Adapter RPC: `src/adapters/arpContractLinkRpcAdapter.ts`
- Serviço de Domínio: `src/services/arpContractLinkService.ts`
- Hooks React Query: `useItemContractLinks.ts`, `useLinkContractToItem.ts`, `useUnlinkContractFromItem.ts`
- Componentes UI: `LinkContractModal.tsx` e integração em `ItemBalances.tsx`
- Suíte de Testes: 17 novos testes adicionados em 3 arquivos.

Todos os componentes compilam perfeitamente e passam na suíte de testes. Entretanto, a inspeção minuciosa de código e integridade relacional revelou achados que demandam intervenção prévia antes da homologação final.

---

## 3. SINGLE SOURCE OF TRUTH (SSOT)

A arquitetura formal estabelece a cadeia unívoca:

```text
PostgreSQL (public.arp_item_contract_links)
       ↓
React Query (['item-contract-links', canonicalItemKey])
       ↓
UI (ItemBalances / LinkContractModal)
```

### Análise Forense da SSOT:
Na inspeção de `src/services/arpContractLinkService.ts`, identificou-se que a aplicação opera em modelo **híbrido** (`PostgreSQL + localStorage`):
- No `fetchArpItemContractLinks`, se o Supabase responder com sucesso, ele grava uma cópia dos vínculos no `localStorage` com a chave `saldoarp-arp-item-contract-links-${itemKey}` (linhas 63-67).
- Se a consulta ao Supabase falhar (por instabilidade temporária ou erro de rede), o service lê e retorna os dados do `localStorage` (linhas 76-88).
- No `saveArpItemContractLink`, se `isSupabaseConfigured && supabase` for falso, ele gera um identificador fictício `mockId = link_${Date.now()}` e salva o vínculo exclusivamente no `localStorage` (linhas 122-142).
- No `deleteArpItemContractLink`, a exclusão é replicada no `localStorage` (linhas 157-165).

> **Resposta Explícita**: Atualmente, a SSOT foi poluída com uma camada de persistência alternativa em `localStorage`. A resposta da implementação é `PostgreSQL + localStorage`, o que configura **Violação Arquitetural**.

---

## 4. AUDITORIA DO `localStorage`

Respondendo às 5 indagações da auditoria:

| Pergunta | Diagnóstico | Evidência no Código |
| :--- | :---: | :--- |
| **A. É apenas um cache visual temporário?** | **NÃO** | Ele é persistido via `localStorage.setItem` e não em memória volátil de sessão (`sessionStorage`). |
| **B. Funciona como persistência alternativa?** | **SIM** | No `saveArpItemContractLink` (linhas 122–141), na ausência de Supabase, ele cria um vínculo com ID mock e salva no browser do usuário. |
| **C. Pode divergir do PostgreSQL?** | **SIM** | Se uma mutação ocorrer no banco por outro usuário, ou se o usuário local salvar algo quando o Supabase estiver indisponível, os estados tornam-se divergentes. |
| **D. Pode criar vínculos que não existem no banco?** | **SIM** | Vínculos criados no fallback offline só existem no navegador do usuário emissor e nunca são sincronizados de volta ao PostgreSQL. |
| **E. Pode sobreviver a uma sessão e parecer que o vínculo existe quando o banco não possui o registro?** | **SIM** | O dado no `localStorage` não expira e, em caso de erro transitório de rede, o usuário continuará vendo o vínculo fantasma. |

**Classificação do Risco de Divergência**: **ALTO**.

---

## 5. OFFLINE MODE

- **Existe requisito formal de operação offline no SaldoARP?** **NÃO**.
- O SaldoARP é um sistema corporativo multiusuário governamental, dependente de RLS, autenticação e consistência transacional centralizada no PostgreSQL/Supabase.
- **Por que foi introduzido?** Trata-se de uma contaminação de padrão legada dos primeiros protótipos em memória do SaldoARP (como nos mocks de `empenhos_manuais`), onde desenvolvedores adicionavam fallback local para simular funcionamento sem container Supabase ativo.
- **Previsão na Fase 6.1:** Em **nenhum ponto** do documento `FASE_6_1_PLANO_INTEGRACAO_ARP_CONTRATOS.md` foi aprovada ou prevista a persistência em `localStorage` para contratos oficiais. A instrução era conexão direta ao banco via RPC atômica.

---

## 6. EMPENHOS E INTEGRIDADE RELACIONAL (PONTO CRÍTICO)

Auditoria em `LinkContractModal.tsx`, `arpContractLinkService.ts` e na Migration 15:

### 6.1 Comportamento Funcional
- **A. A seleção de empenho apenas escolhe um registro já existente?** SIM, o modal lista os empenhos passados pela prop `availableEmpenhos` (empenhos reais do item da ata).
- **B. Ela cria uma relação nova?** SIM, associa o vínculo do contrato aos empenhos selecionados.
- **C. Ela grava dados em `contrato_empenhos`?** Grava em `public.contrato_empenho_links`.
- **D. Ela altera o domínio existente de empenhos?** NÃO altera as tabelas `empenhos` ou `empenhos_manuais`.
- **E. Ela cria algum comportamento novo de saldo?** NÃO.
- **F. Ela introduz uma nova fonte de verdade para empenhos?** NÃO.

### 6.2 O ACHADO CRÍTICO DE BANCO DE DADOS (FOREIGN KEY MISMATCH)
Ao auditar o schema da tabela `public.contrato_empenho_links` (criada na Migration `20260917000001_canonical_schema.sql`, linha 160):

```sql
CREATE TABLE IF NOT EXISTS public.contrato_empenho_links (
  id VARCHAR(150) PRIMARY KEY,
  item_key VARCHAR(100) NOT NULL,
  contrato_id VARCHAR(150) NOT NULL REFERENCES public.contratos_manuais(id) ON DELETE CASCADE,
  empenho_id VARCHAR(100) NOT NULL,
  ...
);
```

Observe que `contrato_empenho_links.contrato_id` possui uma **Foreign Key estrita para `public.contratos_manuais(id)`**.

Agora, observe a RPC criada na Migration 15 (`20260924000015_arp_item_contract_links.sql`, linhas 133–147):

```sql
INSERT INTO public.contrato_empenho_links (
  id,
  item_key,
  contrato_id,
  empenho_id,
  data_vinculo,
  origem
) VALUES (
  'link_' || gen_random_uuid()::TEXT,
  v_item_key,
  v_link_id::TEXT,   -- <<-- v_link_id é o UUID de public.arp_item_contract_links!
  TRIM(v_emp_id),
  NOW(),
  'MANUAL'
);
```

> **IMPACTO SEVERO**: No PostgreSQL real, quando um operador vincular um contrato oficial e selecionar uma Nota de Empenho de lastro, a execução da RPC abortará com **ERRO 23503 — Foreign Key Violation**, porque `v_link_id` existe na tabela `arp_item_contract_links`, mas NÃO existe na tabela `contratos_manuais`!
>
> Os testes unitários não pegaram esse erro porque nos testes o Supabase foi mockado em memória.

---

## 7. ESCOPO DA FASE 6.2 E REGRA RN-07

### 7.1 Antecipação da Fase 7
A Fase 6.2 tinha por objetivo exclusivo o vínculo **ARP → Item → Contrato Oficial**.  
A amarração direta com `contrato_empenho_links` herdada da modelagem de contratos manuais gerou acoplamento prematuro com a tabela de lastro antes do desenho definitivo do Módulo Global de Empenhos (Fase 7).

### 7.2 Onde a RN-07 está implementada hoje:
- **Tabela**: `public.contratos_manuais` e `public.contrato_empenho_links`.
- **RPC**: `public.save_manual_contrato_atomic` (Migrations 05 e 06).
- **Service**: `rpcService.ts` e `rpcAdapters.ts`.
- **Constraint / Validação**:
  ```sql
  IF p_empenho_ids IS NULL OR array_length(p_empenho_ids, 1) = 0 THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_LINK: Regra RN-07 violada. Todo contrato exige vinculação a pelo menos um empenho.'
      USING ERRCODE = '23514';
  END IF;
  ```
- **Testes**: `src/services/__tests__/rpcService.test.ts` e `useSaveManualContract.test.ts`.

### 7.3 Discrepância na Fase 6.2:
Na Fase 6.1 (Planejamento), estava registrado que a RN-07 deveria ser obrigatória também para contratos oficiais.  
Contudo, na Migration 15 (`link_contract_to_item_atomic`), `p_empenho_ids` foi tornado `DEFAULT NULL` (opcional).  
Do ponto de vista negocial de compras públicas federais, tornar opcional é **correto**, pois um Contrato Oficial já pode ter sido assinado e publicado no PNCP antes mesmo de a unidade emitir notas de empenho específicas daquele item. Porém, houve um descompasso documental com o planejado na Fase 6.1.

---

## 8. INVARIANTE CONTÁBIL DE SALDO

Auditoria da fórmula contábil:

$$\text{Saldo da Ata} = \text{Qtd Homologada} - \sum \text{Empenhos Emitidos}$$

Verificação:
1. **Criar vínculo de contrato**: NÃO altera saldo (testado em `arpContractLinkService.test.ts`).
2. **Alterar quantidade contratada**: NÃO altera saldo. A quantidade contratada é um metadado contextual do compromisso formal.
3. **Remover vínculo de contrato**: NÃO altera saldo.
4. **Associar empenho existente**: NÃO gera consumo orçamentário adicional, pois o empenho já existe no somatório da ata.

A integridade matemática do `balanceService.ts` está **100% preservada**.

---

## 9. COEXISTÊNCIA COM `contratos_manuais`

A estratégia de transição suave e coexistência foi plenamente respeitada:
- `contratos_manuais` continua disponível na UI através do botão `+ Adicionar Manual`.
- Permanece editável e excluível via `ManualContratoModal` e `useDeleteManualContract`.
- É visualmente distinguido na tabela pelo badge `🟡 Manual`, enquanto vínculos oficiais recebem o badge `🟢 Oficial`.
- Nenhum registro foi truncado ou apagado do banco de dados legado.

---

## 10. CATÁLOGO OFICIAL E ENRIQUECIMENTO EM MEMÓRIA

- Identidade canônica: `contract_key` (`{uasg}-{numeroLimpo}-{ano}`) é rigorosamente mantida.
- Zero redundância: A tabela `arp_item_contract_links` grava apenas `item_key`, `contract_key`, `quantidade_contratada` e `observacoes`.
- A função pura `enrichContractLinks` faz o merge em memória com o catálogo `ContractDashboardRecord` do SaldoARP:
  - Não grava dados no banco.
  - Não cria contratos artificiais.
  - Não dispara nenhuma requisição HTTP adicional.
  - Performance: **0 chamadas de rede adicionais** ao reutilizar o cache React Query `['contracts-dashboard', uasg]`.

---

## 11. SEGURANÇA E AUDITORIA

- **RLS**: Ativo na tabela `public.arp_item_contract_links`.
- **Privilégios**: `REVOKE INSERT, UPDATE, DELETE` aplicado com sucesso para `authenticated` e `anon`.
- **RBAC**: As RPCs `link_contract_to_item_atomic` e `unlink_contract_from_item_atomic` verificam estritamente `public.has_role('gestor') OR public.has_role('admin')` (código 42501).
- **Validação de Entrada**: Chave do item validada por regex canônica (`^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$`).
- **Trilha de Auditoria**: Trigger `trg_audit_arp_item_contract_links` chamando `public.trg_audit_log_capture()` anexado com sucesso para INSERT, UPDATE e DELETE.

---

## 12. STATUS DAS VERIFICAÇÕES DE CÓDIGO E TESTES

Resultados obtidos na execução local:

1. **Vitest**:
   - `69 passed (69 files)`
   - `581 passed (581 tests)`
   - Duração: 4.09s
2. **TypeScript (`npx tsc -b`)**:
   - `0 erros` (compilação limpa).
3. **Linter (`npm run lint`)**:
   - `0 erros` (42 warnings pré-existentes de hooks).
4. **Vite Build (`npm run build`)**:
   - Compilação concluída com sucesso gerando bundle de produção em `dist/`.

---

## 13. GIT FORENSICS

- **Arquivos modificados**:
  - `src/components/ItemBalances.tsx` (+167, -22)
  - `src/types/index.ts` (+1)
- **Novos arquivos**:
  - `supabase/migrations/20260924000015_arp_item_contract_links.sql`
  - `src/types/arpContractLinks.ts`
  - `src/adapters/arpContractLinkRpcAdapter.ts`
  - `src/services/arpContractLinkService.ts`
  - `src/hooks/useItemContractLinks.ts`
  - `src/hooks/useLinkContractToItem.ts`
  - `src/hooks/useUnlinkContractFromItem.ts`
  - `src/components/modals/LinkContractModal.tsx`
  - 3 arquivos de teste correspondentes.

Nenhum arquivo fora do escopo da integração ARP ↔ Contrato Oficial foi tocado.

---

## 14. MATRIZ DE ACHADOS

| ID | Classificação | Componente | Descrição do Problema |
| :--- | :---: | :--- | :--- |
| **ACH-6.2-01** | **CRÍTICO** | Migration 15 (`link_contract_to_item_atomic`) | **Foreign Key Mismatch**: A RPC insere o ID de `arp_item_contract_links` na coluna `contrato_id` da tabela `contrato_empenho_links`. Como essa tabela possui FK restrita para `contratos_manuais(id)`, haverá aborto com erro 23503 no Postgres real se houver empenhos selecionados. |
| **ACH-6.2-02** | **ALTO** | `arpContractLinkService.ts` | **Persistência Paralela Indevida em LocalStorage**: Presença de fallback offline ativo com geração de IDs artificiais (`mockId`), gerando risco de divergência com o PostgreSQL e violando o princípio de SSOT. |
| **ACH-6.2-03** | **MÉDIO** | `LinkContractModal.tsx` & Migration 15 | **Descompasso Documental sobre Lastro RN-07**: O plano 6.1 previa empenho obrigatório, mas a implementação tornou opcional. Embora tecnicamente justificável para contratos oficiais prévios a empenhos, a foreign key atual inviabiliza a persistência relacional do lastro. |

---

## 15. RISCOS IDENTIFICADOS

1. **Risco Operacional Crítico**: Ao vincular um contrato oficial informando empenhos de lastro em ambiente de produção com o banco PostgreSQL ativo, o sistema apresentará erro em tela ("violates foreign key constraint").
2. **Risco de Divergência de Dados**: Em ambientes onde a rede oscilar, o `localStorage` pode responder com dados desatualizados ou reter vínculos criados offline que jamais existirão para outros usuários do SaldoARP.

---

## 16. PLANO DE CORREÇÃO NECESSÁRIA (PARA RESOLUÇÃO IMEDIATA)

Para sanear os achados antes da homologação:

1. **Correção do `localStorage` (ACH-6.2-02)**:
   - Remover toda a lógica de fallback offline, geração de `mockId` e `localStorage.setItem` de `src/services/arpContractLinkService.ts`.
   - A SSOT deve ser exclusivamente o PostgreSQL via RPCs/Supabase Client. Em caso de falha de conexão, propagar erro claro via React Query para que a UI apresente estado de indisponibilidade em vez de dados fantasmas.
2. **Correção do Vínculo de Empenhos de Lastro (ACH-6.2-01)**:
   - *Alternativa Recomendada (Arquiteturalmente Pura)*: Remover a amarração com a tabela legada `contrato_empenho_links` da Fase 6.2. O vínculo de empenhos do contrato oficial deve ser tratado de forma soberana na **Fase 7 (Módulo Global de Empenhos e Conciliação)**, ou, se desejado lastro na Fase 6.2, criar uma tabela desacoplada ou alterar a FK de `contrato_empenho_links` para permitir UUIDs genéricos. Como a Fase 6.2 visa estritamente `ARP -> Item -> Contrato Oficial`, o desacoplamento imediato do empenho na migration 15 elimina o erro 23503 e mantém o escopo cirúrgico.
3. **Alinhamento Documental da RN-07 (ACH-6.2-03)**:
   - Formalizar que a obrigatoriedade da RN-07 aplica-se estritamente aos contratos manuais (`contratos_manuais`), mantendo contratos oficiais do PNCP independentes de empenhos prévios na vinculação da ata.

---

## 17. VEREDITO FINAL

# **HOLD**

### Justificativa do HOLD:
Embora todo o código de frontend, adapters, UI e suíte de testes (581 testes) esteja verde e compilando, existem dois problemas estruturais impeditivos:
1. **ACH-6.2-01 (CRÍTICO)**: A foreign key física da tabela `contrato_empenho_links` quebrará em tempo de execução no banco de dados real se o usuário selecionar empenhos no modal.
2. **ACH-6.2-02 (ALTO)**: Persistência paralela não solicitada em `localStorage`, violando a SSOT do SaldoARP.

Conforme a **REGRA ABSOLUTA** desta auditoria, nenhuma alteração de código ou correção foi executada nesta etapa.  
Aguardando autorização do operador para executar as correções de saneamento.
