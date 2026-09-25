# FASE 7.2-H — PLANEJAMENTO DA ORQUESTRAÇÃO ON-DEMAND DE SINCRONIZAÇÃO DE EMPENHOS

**Data:** 24 de Setembro de 2026  
**Status da Fase:** **PLANEJAMENTO CONCLUÍDO (GO)**  
**Versão do Sistema:** SaldoARP 3.0  
**Caráter:** Exclusivamente Arquitetural e de Planejamento (Zero Implementação Funcional)

---

## 1. RESUMO EXECUTIVO E OBJETIVO

Com a homologação definitiva da camada de Persistência Soberana M16, das RPCs Transacionais M17, das Views Analíticas M18 e do Motor Determinístico de Reconciliação (Fases 7.2-A a 7.2-G-A), o objetivo da **Fase 7.2-H** é planejar a **Camada de Orquestração On-Demand**.

A camada de orquestração on-demand é o ponto de entrada controlado que permite a usuários e módulos da aplicação disparar a sincronização precisa e direcionada para um **alvo específico** de negócio:
- Um Item específico de Ata de Registro de Preços;
- Uma Ata de Registro de Preços completa (com todos os seus itens);
- Um Contrato Administrativo específico;
- Uma Nota de Empenho soberana pontual.

### Fluxo Unificado
$$\text{ALVO ESPECÍFICO} \longrightarrow \text{ORQUESTRADOR ON-DEMAND} \longrightarrow \text{SELEÇÃO DE FONTES} \longrightarrow \text{ADAPTERS} \longrightarrow \text{NORMALIZAÇÃO} \longrightarrow \text{RECONCILIAÇÃO} \longrightarrow \text{M17 RPCs} \longrightarrow \text{M16 SSOT} \longrightarrow \text{M18 READ MODELS}$$

---

## 2. INVARIANTES ARQUITETURAIS E REGRAS DE CONTROLE

1. **A Orquestração NÃO é um novo motor de negócio:** Ela apenas coordena componentes já implementados e homologados (`comprasGovEmpenhoAdapter`, `contratosGovEmpenhoAdapter`, `pncpEmpenhoAdapter`, `empenhoNormalizationService`, `empenhoReconciliationService`, `empenhoSyncService`).
2. **Inviolabilidade da Persistência:** A orquestração **nunca** executa DML direto nas tabelas M16 (`public.empenhos`, `arp_item_empenhos`, `contrato_empenhos`). Toda mutação é delegada exclusivamente às RPCs M17.
3. **Isolamento Ontológico Ata $\neq$ Contrato:** 
   - Vínculos em `arp_item_empenhos` debitam **estritamente quantidade física**;
   - Vínculos em `contrato_empenhos` debitam **estritamente valor financeiro de lastro**;
   - Eventos de acréscimo/supressão (Art. 125 da Lei 14.133/2021) pertencem exclusivamente ao domínio Contratual.
4. **Prevenção Rigorosa de Double Counting:** A orquestração não realiza operações cartesianas. O cálculo de saldos eBurn Rate permanece sob responsabilidade das Views M18.
5. **Resiliência Passiva:** Falhas de rede, HTTP 429 ou indisponibilidade temporária de uma API governamental externa **nunca** degradam ou apagam fatos oficiais já persistidos no SSOT.

---

## 3. ALVOS DE SINCRONIZAÇÃO ON-DEMAND

A orquestração deve suportar 4 tipos canônicos de alvos, resolvendo determinísticamente seus identificadores:

```
                               ┌── ALVO: ITEM DE ATA (item_key)
                               ├── ALVO: ATA COMPLETA (numeroAta, uasg)
ORQUESTRADOR ON-DEMAND ────────┼── ALVO: CONTRATO (contract_key / contratoId)
                               └── ALVO: EMPENHO ESPECÍFICO (canonical_key)
```

---

### 3.1 Alvo 1: Por Item de Ata de Registro de Preços

**Identificador Canônico:** `item_key` (`00037/2026-200331-00001`) ou tupla `{ numeroAta, uasg, numeroItem }`.

**Estratégia de Resolução e Fontes:**
1. **Compras.gov.br (`4_consultarEmpenhosSaldoItem`):**
   - Consulta a Ata e UASG gerenciadora;
   - Filtra os empenhos correspondentes ao `numeroItem`;
   - Extrai quantidades físicas consumidas (`quantidadeIncluida` / `quantidadeEmpenhada`).
2. **Contratos Vinculados ao Item:**
   - Obtém a lista de contratos administrativos associados ao Item/Ata;
   - Para cada contrato com `contratoId`, consulta Contratos.gov.br (`/api/contrato/{id}/empenhos`) e minutas (`/consultar/{id}`);
   - Para cada contrato com dados PNCP (`cnpj`, `ano`, `sequencialContrato`), consulta empenhos no PNCP.
3. **Execução:**
   - Normaliza todas as leituras $\rightarrow$ Reconcilia por `canonical_key` $\rightarrow$ Persiste via M17 (`save_empenho_soberano_atomic`, `link_empenho_to_item_atomic`, `link_empenho_to_contract_atomic`).
4. **Retorno:**
   - `EmpenhoSyncSummary` contendo totais salvos, saldo físico recalculado (via M18) e conflitos registrados.

---

### 3.2 Alvo 2: Por Ata de Registro de Preços Completa

**Identificador Canônico:** Tupla `{ numeroAta, uasg }` (ex: `"00037/2026"`, `"200331"`).

**Estratégia de Resolução e Fontes:**
1. Obtém a lista de itens homologados da Ata a partir de `public.itens_ata` (ou via API `fetchArpItems`);
2. Executa a sincronização de cada item de forma **sequencial ou em micro-lotes controlados** ($\le 3$ itens paralelos) para evitar saturação de quota (HTTP 429);
3. Consolida os resultados em um relatório unificado da Ata.

---

### 3.3 Alvo 3: Por Contrato Administrativo

**Identificador Canônico:** `contract_key` (`200331-00012-2026`) ou `contratoId` / `numeroControlePncp`.

**Estratégia de Resolução e Fontes:**
1. **Contratos.gov.br (`/api/contrato/{id}/empenhos`):**
   - Obtém todos os empenhos financeiros vinculados ao contrato;
   - Para cada empenho, obtém detalhes de itens da minuta.
2. **PNCP (`/api/pncp/v1/orgaos/{cnpj}/contratos/{ano}/{seq}/empenhos`):**
   - Obtém empenhos de publicidade cadastrados no PNCP.
3. **Compras.gov.br (Complementar se houver Ata de Origem):**
   - Se o contrato for decorrente de Ata de Registro de Preços conhecida, cruza com os itens da Ata.
4. **Execução:**
   - Reconciliação com foco em `valor_empenhado`, `liquidado`, `pago`, `rpinscrito` e vínculo em `contrato_empenhos`.
5. **Retorno:**
   - `EmpenhoSyncSummary` com o lastro financeiro atualizado na View `v_contrato_empenhos_lastro`.

---

### 3.4 Alvo 4: Por Nota de Empenho Específica

**Identificador Canônico:** `canonical_key` (`200331-2026-2026NE142`) ou `{ uasg, ano, numero }`.

**Estratégia de Resolução e Fontes:**
1. Localiza os contextos conhecidos onde a NE pode residir (contratos ativos e atas da UASG);
2. Consulta as fontes correspondentes;
3. Se não localizada em fontes contextuais, busca direta nos endpoints governamentais disponíveis;
4. Executa `save_empenho_soberano_atomic`;
5. Se nenhum vínculo determinístico for encontrado (Cenário D), persiste a NE soberana sem inventar links.

---

## 4. PIPELINE DETALHADO DE ORQUESTRAÇÃO

O orquestrador on-demand seguirá as seguintes etapas determinísticas:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. RESOLUÇÃO DE IDENTIDADE DO ALVO                          │
│    Sanitização de chaves via itemKeyUtils / contractKeyUtils│
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 2. SELEÇÃO E DESPACHO DE CONSULTAS EXTERNAS (ADAPTERS)      │
│    comprasGovAdapter / contratosGovAdapter / pncpAdapter    │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 3. NORMALIZAÇÃO EM MEMÓRIA (empenhoNormalizationService)    │
│    Produção de NormalizedEmpenho[] transitórios             │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 4. RECONCILIAÇÃO DETERMINÍSTICA (empenhoReconciliationServ) │
│    Merge por Precedência + Detecção de Divergências         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 5. PERSISTÊNCIA ATÔMICA SOBERANA M17 (empenhoSyncService)   │
│    RPCs com advisory locks + auditoria de histórico         │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 6. INVALIDAÇÃO DE CACHE DE LEITURA (React Query)            │
│    Invalidar queries M18 (v_arp_item_saldo, v_contrato...)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 7. RESPOSTA ESTRUTURADA DE SUCESSO / AUDITORIA              │
│    EmpenhoSyncSummary com métricas e divergências           │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. CONTROLE DE CONCORRÊNCIA E LIMITAÇÃO DE TAXA (RATE LIMITING)

### 5.1 Prevenção de Saturação de Quota (HTTP 429)
1. **Backoff Proativo:** Intervalo mínimo de 200ms entre requisições externas para evitar bloqueio por quota de IP/UASG.
2. **Deduplicação de Requisições em Andamento (In-Flight Sync Deduplication):**
   - Se uma sincronização para o alvo `00037/2026-200331-00001` já estiver em execução (`status: SYNCING`), requisições adicionais concorrentes para o mesmo alvo aguardam a conclusão da primeira promessa sem disparar novas chamadas às APIs externas.

### 5.2 Concorrência no Banco de Dados
- Assegurada nativamente pelos **Advisory Locks** de M17:
  * `save_empenho_soberano_atomic`: lock em `hashtext('save_empenho:' || canonical_key)`
  * `link_empenho_to_item_atomic`: lock em `hashtext('link_item:' || item_key || ':' || empenho_id)`
  * `link_empenho_to_contract_atomic`: lock em `hashtext('link_ctr:' || contract_key || ':' || empenho_id)`

---

## 6. ESTRUTURA DOS COMPONENTES FUTUROS

Para a futura fase de implementação da orquestração, planeja-se a criação dos seguintes módulos sem duplicar código existente:

```
src/services/
└── empenhoOrchestrationService.ts   (Orquestrador central de alvos on-demand)

src/hooks/
├── useSyncItemEmpenhos.ts           (Mutação React Query para sincronização de item)
├── useSyncContractEmpenhos.ts       (Mutação React Query para sincronização de contrato)
└── useSyncAtaEmpenhos.ts            (Mutação React Query para sincronização de Ata)
```

### Contrato Proposto para `empenhoOrchestrationService.ts`:

```typescript
export interface OrchestratedSyncOptions {
  alvoTipo: 'ITEM_ATA' | 'ATA_COMPLETA' | 'CONTRATO' | 'EMPENHO';
  itemKey?: string;
  numeroAta?: string;
  uasg?: string;
  numeroItem?: string;
  contractKey?: string;
  contratoId?: number | string;
  canonicalKey?: string;
}

export async function orchestrateOnDemandSync(
  options: OrchestratedSyncOptions
): Promise<EmpenhoSyncSummary>;
```

---

## 7. MATRIZ DE TESTES FUTUROS DA ORQUESTRAÇÃO

| Caso de Teste | Alvo Testado | Comportamento Esperado |
| :--- | :--- | :--- |
| **Sync On-Demand de Item de Ata** | Item com 2 empenhos | Compras.gov consultado $\rightarrow$ empenhos persistidos $\rightarrow$ `v_arp_item_saldo_detalhado` atualizado |
| **Sync On-Demand de Contrato** | Contrato com 3 empenhos | Contratos.gov/PNCP consultados $\rightarrow$ lastro persistido $\rightarrow$ `v_contrato_empenhos_lastro` atualizado |
| **Sync On-Demand de Ata Completa** | Ata com 10 itens | Itens processados em sequência controlada sem erro 429 |
| **Deduplicação de Sync Concorrente** | 2 cliques no botão de sync | Apenas 1 conjunto de chamadas externas $\rightarrow$ 1 execução M17 |
| **Resiliência a Queda de API Externa** | Compras.gov offline (500) | Retorna erro estruturado $\rightarrow$ dados pré-existentes no M16 preservados |
| **Invalidação de Cache UI** | Pós-sync bem-sucedido | React Query invalida chaves M18 $\rightarrow$ tela reflete saldos imediatamente |

---

## 8. CRITÉRIOS DE ACEITE DO PLANEJAMENTO

- [x] Respeito estrito às fases M16, M17 e M18;
- [x] Zero lógica de persistência paralela;
- [x] Alvos de negócio claramente definidos (Item, Ata, Contrato, Empenho);
- [x] Estratégia de resolução determinística de identificadores;
- [x] Prevenção de saturação de quota (HTTP 429) e concorrência;
- [x] Isolamento ontológico Ata $\neq$ Contrato preservado;
- [x] Nenhuma alteração funcional ou no banco realizada nesta fase.

---

## 9. CONCLUSÃO E VEREDITO

```text
============================================================
FASE 7.2-H — RESULTADO
======================

PLANEJAMENTO: GO
IMPLEMENTAÇÃO REALIZADA: NÃO (Zero código alterado)
MIGRATIONS ALTERADAS: NÃO (0)
TABELAS ALTERADAS: NÃO (0)
RPCs ALTERADAS: NÃO (0)
VIEWS ALTERADAS: NÃO (0)
FRONTEND ALTERADO: NÃO (0)
============================================================
```
