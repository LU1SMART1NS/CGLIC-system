# FASE 6.1 — PLANO TÉCNICO DE INTEGRAÇÃO ARP ↔ CONTRATOS OFICIAIS
## SALDOARP — SISTEMA DE GESTÃO DE ATAS E CONTRATOS ADMINISTRATIVOS

**Data do Plano:** 23 de Setembro de 2026  
**Status do Documento:** Concluído — **GO para Implementação na Fase 6.2**  
**Alterações de Código Realizadas nesta Fase:** 0 (Plano estritamente analítico e de engenharia)  
**Baseline Técnica:** 66 arquivos / 564 testes PASS (100% verde) | `tsc -b`: 0 erros | Vite: PASS  

---

## 1. OBJETIVO DO PLANO

Transformar o modelo fragmentado e redundante atual:
```text
[ATUAL]
Ata de Registro de Preços ──► Item da Ata ──► Contrato Manual (Digitação Livre de 10 campos redundantes)
```

em uma arquitetura pura de **Vínculo Contextual ao Contrato Oficial Soberano**:
```text
[FUTURO]
Ata de Registro de Preços ──► Item da Ata ──► Vínculo Contextual (Item ↔ Contrato Oficial)
                                                     │
                                                     ├── contract_key (ex: 200331-1-2026)
                                                     ├── quantidade_contratada (deste item)
                                                     ├── contrato_empenhos (lastro financeiro RN-07)
                                                     ▼
                                            Contrato 360° (/contratos/:contractKey)
```

mantendo intocada a invariante contábil:
$$\text{Saldo da Ata} = \text{Quantidade Registrada} - \sum \text{Empenhos Válidos}$$

---

## 2. ARQUITETURA ATUAL E SUAS FRAGILIDADES

1. **Redundância Severa:** O modal `ManualContratoModal.tsx` exige que o operador digite número, ano, UASG, objeto, fornecedor, CNPJ, valor total e links oficiais. Todos esses dados já existem sincronizados no catálogo do `ContractsDashboard` (`contractService.ts`).
2. **Desconexão com o Contrato 360°:** O contrato criado na ata recebe um ID artificial (`ctr_...` em `contratos_manuais`) que não possui link para a página executiva do `Contract360Page.tsx`.
3. **Fragilidade de Chaves:** Variações de formatação digitadas pelo usuário (`01/2026`, `1/2026`, `00001/2026`) geram inconsistências com as bases governamentais.

---

## 3. ARQUITETURA FUTURA: O PRINCÍPIO DO VÍNCULO SOBERANO

O contrato oficial governamental é sincronizado **uma única vez** no catálogo do SaldoARP.  
A Ata de Registro de Preços apenas estabelece um **Vínculo Contextual** com esse contrato:

```text
Catálogo Oficial (Contratos.gov.br / PNCP)
      │
      ├── Número, Ano, UASG
      ├── Fornecedor e CNPJ
      ├── Valor Global e Inicial
      ├── Vigência e Prazos
      ├── Workflows e Tarefas
      └── Linha do Tempo e Eventos
              │
              ▼
        contract_key (Identidade Soberana: {uasg}-{numero}-{ano})
              ▲
              │
       [VÍNCULO RELACIONAL]
              │
Item da Ata (item_key) ──► Quantidade Contratada ──► Notas de Empenho (Lastro)
```

---

## 4. MODELO DE DADOS DE PERSISTÊNCIA

Criar uma tabela relacional dedicada e pura no Supabase/PostgreSQL para representar o relacionamento:

### Tabela: `public.arp_item_contract_links`

```sql
CREATE TABLE IF NOT EXISTS public.arp_item_contract_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key VARCHAR(100) NOT NULL,
  contract_key VARCHAR(100) NOT NULL,
  quantidade_contratada NUMERIC(18, 4) NOT NULL CHECK (quantidade_contratada >= 0),
  observacoes TEXT,
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_arp_item_contract UNIQUE (item_key, contract_key)
);

CREATE INDEX IF NOT EXISTS idx_arp_item_contract_item_key 
  ON public.arp_item_contract_links(item_key);

CREATE INDEX IF NOT EXISTS idx_arp_item_contract_contract_key 
  ON public.arp_item_contract_links(contract_key);
```

### Relação com Empenhos (`contrato_empenhos`):
A tabela associativa existente `contrato_empenhos` continuará sendo utilizada:
* A coluna `contrato_id` passará a referenciar o `id` (UUID em formato texto) do vínculo `arp_item_contract_links`.
* A amarração entre o Contrato e as Notas de Empenho do Item é preservada integralmente.

---

## 5. MODELO MÍNIMO DO VÍNCULO (CAMPOS ESSENCIAIS)

Nenhum campo redundante de contrato será gravado na tabela de vínculo:

| Campo | Tipo | Obrigatoriedade | Justificativa |
|---|---|:---:|---|
| `id` | UUID | Sim | Identificador único estável do vínculo. |
| `item_key` | VARCHAR(100) | Sim | Chave canônica do item da ata (`00037/2026-200331-00001`). |
| `contract_key` | VARCHAR(100) | Sim | Chave canônica do contrato oficial (`200331-1-2026`). |
| `quantidade_contratada` | NUMERIC(18,4) | Sim | Quantidade deste item alocada a este contrato. |
| `observacoes` | TEXT | Não | Despachos ou notas instrutórias internas da ata. |
| `created_at` / `updated_at` | TIMESTAMPTZ | Sim | Auditoria e ordenação temporal. |

*Campos proibidos na nova tabela:* `fornecedor`, `cnpj_fornecedor`, `numero_contrato`, `ano_contrato`, `valor_total_contrato`, `link_pncp`, `numero_controle_pncp`. Todos esses campos derivam diretamente do objeto `ContractDashboardRecord` correspondente a `contract_key`.

---

## 6. DEFINIÇÃO DA QUANTIDADE CONTRATADA

* **Aonde pertence?** Exclusivamente ao vínculo `Item da Ata ↔ Contrato`.
* **Cenário Multi-Item:** Se o Contrato nº 10/2026 atender aos Itens 1, 2 e 3 da Ata:
  * Haverá 3 registros em `arp_item_contract_links`:
    * `(item 1, contrato 10, qtd: 100)`
    * `(item 2, contrato 10, qtd: 50)`
    * `(item 3, contrato 10, qtd: 20)`
* **Cenário Multi-Contrato:** Se o Item 1 for contratado em múltiplos momentos:
  * `(item 1, contrato 10, qtd: 100)`
  * `(item 1, contrato 15, qtd: 40)`
* **Validação de Teto (Frontend & RPC):** A soma das quantidades contratadas do item não pode exceder a quantidade homologada da ata sem aviso explícito.

---

## 7. EMPENHOS E REGRA RN-07

* **Lastro Obrigatório (RN-07):** Para que um contrato seja vinculado ao item da ata, o operador deve selecionar pelo menos uma Nota de Empenho daquele item.
* **Tabela de Junção:**
  $$\text{arp\_item\_contract\_links} \stackrel{1:N}{\longleftrightarrow} \text{contrato\_empenhos} \stackrel{N:1}{\longleftrightarrow} \text{empenhos}$$
* **Risco de Duplicidade:** Zero. O `balanceService.ts` já possui salvaguarda canônica:
  *Empenhos vinculados a contratos NÃO são computados em duplicidade no consumo de saldo da ata.*

---

## 8. INVARIANTE INVIOLÁVEL DE SALDO

* O contrato oficial é um **instrumento jurídico de formalização**, não uma dedução orçamentária primária.
* A dedução do saldo da ata é operada exclusivamente por:
  $$\text{Saldo} = \text{Qtd Homologada} - \sum \text{Empenhos Emitidos}$$
* **Garantia Arquitetural:** O ato de vincular ou desvincular um contrato oficial **não altera em nenhum decimal o saldo disponível da ata**.

---

## 9. ESTRATÉGIA DE TRANSIÇÃO PARA `contratos_manuais`

Adotar a **Estratégia B (Migração Assistida com Coexistência Segura)**:

```text
Passo 1: Criar arp_item_contract_links (Nova autoridade de vínculos).
Passo 2: Script de Migração/Reconciliação:
         • Registros de contratos_manuais cujo número e ano batem com contratos oficiais
           são promovidos automaticamente a arp_item_contract_links.
         • Registros sem correspondência oficial permanecem em contratos_manuais com badge
           "Legado / Sem correspondência oficial" até saneamento manual.
Passo 3: ItemBalances.tsx consulta prioritariamente arp_item_contract_links, exibindo
         contratos legados não migrados em seção secundária.
Passo 4: (Futuro) Após saneamento da base, desativar contratos_manuais.
```

---

## 10. REGRAS DE MATCHING DOS REGISTROS ANTIGOS

Para evitar qualquer associação incorreta ou especulativa:
1. **Regra de Correspondência Soberana:**
   $$\text{Matching Válido} \iff \text{uasg}_{\text{manual}} = \text{uasg}_{\text{oficial}} \land \text{numeroLimpo}_{\text{manual}} = \text{numeroLimpo}_{\text{oficial}} \land \text{ano}_{\text{manual}} = \text{ano}_{\text{oficial}}$$
2. **Proibição Absoluta de Heurísticas Frágeis:**
   * NUNCA fazer matching baseado em similaridade textual do objeto;
   * NUNCA fazer matching baseado apenas no nome fantasia do fornecedor;
   * NUNCA associar contratos de anos divergentes.
3. Se não houver correspondência exata: marcar o registro como `SEM_CORRESPONDENCIA_OFICIAL` e manter visível para decisão humana.

---

## 11. NOVA EXPERIÊNCIA DO USUÁRIO (UX DE VINCULAÇÃO)

Substituir o formulário manual por um fluxo ergonômico em **3 passos rápidos**:

```text
1. Clique em "+ Vincular Contrato Oficial" no item da ata
         │
         ▼
2. Modal "Vincular Contrato Oficial ao Item"
   ┌─────────────────────────────────────────────────────────────────┐
   │ Selecione o Contrato Oficial da UASG 200331:                    │
   │ [ Buscar por número, fornecedor ou ano...                 🔍 ] │
   │                                                                 │
   │ [CARD DO CONTRATO SELECIONADO]:                                 │
   │ Contrato 10/2026 • SAFETY WALL LTDA • CNPJ 12.345.678/0001-90  │
   │ Vigência: 01/01/2026 até 31/12/2026 • Valor Global: R$ 5,4M    │
   │ Fonte Oficial: Contratos.gov.br / PNCP                          │
   │                                                                 │
   │ Quantidade Contratada deste Item: [ 40 ] (Máx disponível: 100) │
   │                                                                 │
   │ Notas de Empenho de Lastro (Obrigatório RN-07):                │
   │ [x] 2026NE000459 (Qtd: 40 - R$ 5.476.000,00)                   │
   │                                                                 │
   │ [Cancelar]                              [Vincular Contrato]    │
   └─────────────────────────────────────────────────────────────────┘
```

**Benefício Imediato:** O usuário digita apenas a **quantidade contratada** e clica no checkbox do **empenho**. Zero redigitação de fornecedor, CNPJ, vigência, valores ou links!

---

## 12. APRESENTAÇÃO DO CARD DE CONTRATO NA TELA DO ITEM

Na tabela/cards de contratos em `ItemBalances.tsx`:
* Exibe o número formatado oficial (`Contrato 10/2026`);
* Exibe o Fornecedor e CNPJ oficiais;
* Badge verde de autoridade: `🟢 Fato Oficial (PNCP)`;
* Quantidade contratada do item (`40 unidades`);
* Botão destacado de ação:
  ```tsx
  <Link to={`/contratos/${encodeURIComponent(link.contractKey)}`} className="btn btn-secondary">
    <ExternalLink size={13} /> Visão 360° do Contrato
  </Link>
  ```

---

## 13. ESTRATÉGIA DE REACT QUERY E CACHE ("ZERO REDE")

* **Reúso Soberano:**
  O hook de seleção de contratos reutilizará a query já existente no cache:
  ```ts
  const { data: officialContracts = [] } = useContractsDashboard(uasg);
  ```
* **Performance:** Ao abrir o modal de vinculação, a lista de contratos disponíveis é filtrada instantaneamente em memória, sem disparar nenhuma requisição HTTP adicional.
* **Invalidação Cirúrgica:**
  Ao salvar um novo vínculo, apenas a chave do item é invalidada:
  ```ts
  queryClient.invalidateQueries({ queryKey: ['item-contract-links', canonicalItemKey] });
  ```

---

## 14. NAVEGAÇÃO INTEGRADA COM O CONTRATO 360°

* O clique no botão "Visão 360°" navega diretamente para:
  `/contratos/${encodeURIComponent(contractKey)}`
* O `Contract360Page` carrega o contrato instantaneamente a partir do cache.
* Na Fase 6.3/6.4, o Bloco 6 do Contrato 360° passará a exibir o caminho inverso: *"Itens de Ata Vinculados a este Contrato"*.

---

## 15. ARQUITETURA DE SERVIÇOS (REUTILIZAR, CRIAR, ALTERAR)

| Arquivo / Serviço | Ação Planejada | Responsabilidade |
|---|:---:|---|
| `src/services/contractService.ts` | **REUTILIZAR** | Fornece a lista de contratos oficiais e KPIs. |
| `src/services/balanceService.ts` | **REUTILIZAR** | Mantém intacta a invariante contábil de saldo. |
| `src/utils/contractKeyUtils.ts` | **REUTILIZAR** | Resolução da chave canônica `{uasg}-{numero}-{ano}`. |
| `src/services/arpContractLinkService.ts` | **CRIAR** | Novo serviço puro para CRUD e consultas da tabela de vínculos. |
| `src/adapters/arpContractLinkRpcAdapter.ts` | **CRIAR** | Adaptador de comunicação com a nova RPC segura. |
| `src/hooks/useItemContractLinks.ts` | **CRIAR** | Hook React Query para ler os vínculos oficiais do item. |
| `src/hooks/useLinkContractToItem.ts` | **CRIAR** | Mutation React Query para vincular contrato e empenhos. |
| `src/hooks/useUnlinkContractFromItem.ts` | **CRIAR** | Mutation React Query para desvincular contrato do item. |
| `src/components/modals/LinkContractModal.tsx` | **CRIAR** | Novo modal com autocomplete e seleção rápida. |
| `src/components/ItemBalances.tsx` | **ALTERAR** | Incorporar o novo componente de vínculos e o botão para o 360°. |
| `src/services/allocationService.ts` | **ALTERAR** | Manter compatibilidade legada com fallback seguro. |
| `src/components/modals/ManualContratoModal.tsx`| **DEPRECAR** | Manter apenas como opção secundária de contingência offline. |

---

## 16. PLANO DE MIGRATION DO BANCO DE DADOS

A implementação exigirá apenas **1 migration SQL atômica**:

### `20260924000015_arp_item_contract_links.sql`
1. Criação da tabela `public.arp_item_contract_links`.
2. Adição de índices em `item_key` e `contract_key`.
3. Definição de políticas RLS (leitura pública autenticada, escrita restrita a gestores/admin).
4. Criação da RPC `public.link_contract_to_item_atomic`.
5. Criação da RPC `public.unlink_contract_from_item_atomic`.
6. Script seguro de migração dos registros correspondidos de `contratos_manuais`.

---

## 17. ESPECIFICAÇÃO DA RPC TRANSACIONAL

### `public.link_contract_to_item_atomic`
* **Assinatura:**
  ```sql
  link_contract_to_item_atomic(
    p_item_key TEXT,
    p_contract_key TEXT,
    p_quantidade NUMERIC,
    p_empenho_ids TEXT[],
    p_observacoes TEXT DEFAULT NULL
  ) RETURNS JSONB
  ```
* **Garantias Atômicas:**
  1. Validação de RBAC (`gestor` ou `admin`);
  2. Validação da regra RN-07 (`array_length(p_empenho_ids, 1) >= 1`);
  3. Upsert do registro em `arp_item_contract_links`;
  4. Gravação atômica dos vínculos associativos em `contrato_empenhos`;
  5. Registro em tabela de auditoria;
  6. Rollback automático em caso de qualquer falha.

---

## 18. SEGURANÇA E RLS

* **Controle de Acesso:**
  ```sql
  ALTER TABLE public.arp_item_contract_links ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Permitir leitura de vínculos a usuários autenticados"
    ON public.arp_item_contract_links FOR SELECT
    USING (auth.role() = 'authenticated');
  ```
* Escrita direta (`INSERT`, `UPDATE`, `DELETE`) revogada na tabela. Toda gravação deve ocorrer exclusivamente via RPC transacional com verificação de papéis.

---

## 19. PLANO DE TESTES AUTOMATIZADOS

A implementação será acompanhada por testes rigorosos em 4 níveis:

### A. Testes Unitários de Serviços
* `arpContractLinkService.test.ts`:
  * Derivação e validação de chaves `item_key` e `contract_key`;
  * Validação de payload e integridade de quantidade;
  * Isolamento contábil (confirmar que `calculateSaldo` não é afetado).

### B. Testes de Adapters e RPC
* `arpContractLinkRpcAdapter.test.ts`:
  * Mock de sucesso e tratamento de erros (`UNAUTHORIZED`, `RN-07 violada`);
  * Verificação de parâmetros transmitidos para a RPC.

### C. Testes de Hooks React Query
* `useItemContractLinks.test.ts`:
  * Consulta com chave canônica;
  * Invalidação de cache pós-mutação.

### D. Testes de Componentes e UX
* `LinkContractModal.test.tsx`:
  * Renderização dos contratos disponíveis da UASG em cache;
  * Autocomplete e seleção com 1 clique;
  * Preenchimento automático dos dados oficiais;
  * Bloqueio do botão de salvar se nenhum empenho for marcado (RN-07).

---

## 20. CRITÉRIOS DE ACEITAÇÃO FORMAIS

| ID | Critério de Aceitação | Verificação |
|---|---|:---:|
| **AC-01** | O usuário consegue vincular um Contrato Oficial a um Item de Ata selecionando-o da lista oficial da UASG. | Obrigatório |
| **AC-02** | Nenhum dado oficial do contrato (número, ano, fornecedor, CNPJ, valor, vigência, PNCP) precisa ser digitado manualmente. | Obrigatório |
| **AC-03** | O card do contrato na tela de saldo do item exibe badge `🟢 Oficial` e botão para abrir o **Contrato 360°** (`/contratos/:contractKey`). | Obrigatório |
| **AC-04** | A regra **RN-07** é cumprida: o vínculo exige seleção de pelo menos uma Nota de Empenho de lastro. | Obrigatório |
| **AC-05** | Um mesmo contrato pode ser vinculado a múltiplos itens da mesma ata ou de atas distintas, com quantidades específicas para cada item. | Obrigatório |
| **AC-06** | A vinculação do contrato **não deduz nem altera** o saldo disponível da ata calculado pelo `balanceService`. | Obrigatório |
| **AC-07** | Contratos manuais legados com correspondência oficial são conciliados sem perda de histórico. | Obrigatório |
| **AC-08** | Todos os 564 testes atuais continuam passando, com 100% de aprovação técnica. | Obrigatório |

---

## 21. DEPENDÊNCIAS TÉCNICAS E IMPACTO

```text
FASE 6.1 (Planejamento - Atual) ──► GO Aprovado
      │
      ▼
FASE 6.2 (Implementação da Integração ARP ↔ Contratos Oficiais)
      ├── Migration 15 (arp_item_contract_links + RPCs)
      ├── LinkContractModal (Autocomplete + UX "Digite uma vez")
      ├── useItemContractLinks + Integração no ItemBalances
      └── Botão de acesso ao Contrato 360°
      │
      ▼
FASE 6.3 (Navegação Reversa e Unificação do Bloco 6 do Contrato 360°)
      └── O Contrato 360° passa a exibir a Ata de origem e seus itens vinculados
```

---

## 22. GESTÃO DE RISCOS E MITIGAÇÕES

| Risco Mapeado | Impacto | Mitigação Arquitetural |
|---|:---:|---|
| **Contrato recém-assinado ainda não indexado na API do Contratos.gov.br** | Médio | Manter opção de contingência "Digitação Manual Provisória" com aviso de que aguarda sincronização oficial. |
| **Item de Ata sem empenhos cadastrados no momento da vinculação** | Baixo | Orientar o operador a cadastrar/importar o empenho primeiro para satisfazer a regra legal RN-07. |
| **Sobrecarga de memória no modal de seleção** | Nulo | O catálogo da UASG raramente ultrapassa 200 contratos vigentes; filtro em memória via `useMemo` responde em < 5ms. |

---

## 23. ORDEM E ROTEIRO DE IMPLEMENTAÇÃO (FASE 6.2)

Quando autorizada a execução da Fase 6.2, a implementação seguirá rigorosamente esta ordem:

1. **Etapa 1 — Banco de Dados:**
   * Criar migration `20260924000015_arp_item_contract_links.sql` com a tabela, constraints, RLS e RPCs atômicas.
2. **Etapa 2 — Camada de Adapters e Serviços:**
   * Criar tipos em `src/types/arpContractLinks.ts`;
   * Criar `src/services/arpContractLinkService.ts` e adapter `src/adapters/arpContractLinkRpcAdapter.ts`;
   * Criar testes unitários do serviço e adapter.
3. **Etapa 3 — Camada de Hooks (React Query):**
   * Criar `useItemContractLinks`, `useLinkContractToItem` e `useUnlinkContractFromItem`;
   * Criar testes unitários dos hooks.
4. **Etapa 4 — Camada de Apresentação e UX:**
   * Criar componente `LinkContractModal.tsx` com autocomplete e seleção de empenho;
   * Integrar a nova visualização na aba de contratos em `src/components/ItemBalances.tsx`;
   * Adicionar link direto para o `Contract360Page`.
5. **Etapa 5 — Validação e Fechamento:**
   * Executar suíte completa de testes (`npm test`), `tsc -b`, lint e build.

---

## 24. CONCLUSÃO E VEREDITO FORMAL

O plano técnico resolve com precisão matemática e segurança de banco de dados a integração entre Atas de Registro de Preços e Contratos Oficiais, eliminando o trabalho manual de digitação redundante e unificando o SaldoARP sob o Contrato 360°.

### **VEREDITO DA FASE 6.1: GO PARA A IMPLEMENTAÇÃO (FASE 6.2)**
