# FASE 7.2-L — PLANEJAMENTO DA INTEGRAÇÃO DE EMPENHOS NO ITEM DA ATA

**Data:** 24 de Setembro de 2026  
**Status da Fase:** **PLANEJAMENTO CONCLUÍDO (GO)**  
**Versão do Sistema:** SaldoARP 3.0  
**Caráter:** Exclusivamente Arquitetural e de Planejamento de UX/Frontend (Zero Código Funcional)

---

## 1. OBJETIVO DO PLANEJAMENTO

Com a conclusão e saneamento da integração de empenhos no Contrato 360° (Fases 7.2-K, 7.2-K-A e 7.2-K-B), o objetivo da **Fase 7.2-L** é planejar a integração da sincronização on-demand de empenhos na interface do **Item da Ata de Registro de Preços** ([`ItemBalances.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/ItemBalances.tsx) / [`ItemBalancesHeader.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/item-balances/ItemBalancesHeader.tsx)).

Diferentemente do Contrato (cujo foco é o *lastro financeiro*), a finalidade no Item da Ata é:
> **Identificar, reconciliar e sincronizar empenhos que representam consumo físico/quantitativo daquele item, atualizando o saldo real da Ata de Registro de Preços.**

---

## 2. ESTADO ATUAL E FLUXO DO ITEMBALANCES

Atualmente, o componente [`ItemBalances.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/ItemBalances.tsx) gerencia o detalhamento de um item de ARP recebendo:
- `arp: ArpRecord` (número da Ata, UASG gerenciadora, órgão);
- `item: ArpItemRecord` (número do item, descrição, quantidade homologada, valor unitário).

### 2.1. Chave Canônica do Item (`itemKey`)
Formato canônico gerado via [`normalizeItemKey`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/utils/itemKeyUtils.ts):
$$\text{itemKey} = \text{numeroAta} + \text{"-"} + \text{uasg} + \text{"-"} + \text{numeroItem} \quad (\text{ex: } \text{"90001/2026-200331-1"})$$

### 2.2. Fluxo Atual de Dados
```text
Item da Ata (arp, item)
      ↓
ItemBalances.tsx
      ├── useItemUnidades(numeroAta, uasg, numeroItem)
      ├── useItemEmpenhos(numeroAta, uasg, numeroItem)
      ├── useItemAdesoes(numeroAta, uasg, numeroItem)
      ├── useItemAllocations(itemKey)
      └── useItemContractLinks(itemKey)
```

---

## 3. ARQUITETURA DE SALDO: SEPARAÇÃO QUANTITATIVO vs FINANCEIRO

O planejamento preserva rigorosamente a separação conceitual entre consumo físico e lastro orçamentário:

### 3.1. Saldo Físico / Quantitativo do Item (Ata)
$$\text{SaldoQuantitativoItem} = \text{QuantidadeHomologadaAta} - \sum \text{QuantidadeConsumidaEmpenhos}$$

- **Tabela Canônica (SSOT de Consumo):** `public.arp_item_empenhos`
- **View Canônica (M18):** `public.v_arp_item_saldo_detalhado`
- **Unidade de Medida:** Unidades físicas (inteiros ou decimais de fornecimento).

### 3.2. Lastro Financeiro / Orçamentário (Contrato)
$$\text{ValorEmpenhadoContrato} = \sum \text{ValorEmpenhado}$$

- **Tabela Canônica (SSOT de Vínculo Contratual):** `public.contrato_empenhos`
- **View Canônica (M18):** `public.v_contrato_empenhos_lastro`
- **Unidade de Medida:** Moeda corrente (BRL / R$).

> [!IMPORTANT]
> A sincronização do Item da Ata afeta o **saldo quantitativo** em `public.arp_item_empenhos`. Ela **não** exige existência de contrato e **não** confunde valor financeiro com unidades consumidas.

---

## 4. ORQUESTRADOR ON-DEMAND DE ITEM (`orchestrateItemEmpenhoSync`)

O motor de orquestração implementado na Fase 7.2-I já possui a função dedicada:

```typescript
export async function orchestrateItemEmpenhoSync(
  target: ItemTarget
): Promise<OrchestrationResult>
```

### 4.1. Parâmetros de Entrada (`ItemTarget`)
```typescript
export interface ItemTarget {
  tipo: 'ITEM';
  itemKey: string; // Ex: "90001/2026-200331-1"
  unitPrice?: number;
  contracts?: Array<{
    contratoId?: number | string;
    contractKey: string;
    cnpj?: string;
    ano?: number | string;
    sequencialContrato?: number | string;
    unitPrice?: number;
    historicoPrecos?: Array<{ dataTermo: string; valorUnitario: number }>;
  }>;
}
```

### 4.2. Fluxo Interno do Orquestrador
1. **Parser da Chave:** Extrai `numeroAta`, `uasg` e `numeroItem` via `parseItemKey`;
2. **Consulta Compras.gov.br (Fonte Primária):** `fetchAndNormalizeComprasGovEmpenhos` recupera os empenhos que consumiram o item diretamente na base oficial de compras;
3. **Consulta Opcional de Contratos Vinculados:** Se `contracts` forem fornecidos, consulta Contratos.gov.br e PNCP para enriquecimento e validação cruzada;
4. **Reconciliação Canônica:** `reconcileNormalizedEmpenhos` resolve conflitos de credor, datas e valores;
5. **Persistência Atômica M17:** `syncReconciledBatch` aciona a RPC soberana com advisory locks, persistindo em `public.empenhos` e associando em `public.arp_item_empenhos`;
6. **Retorno Padronizado:** Devolve `OrchestrationResult` estruturado.

---

## 5. PONTO DE INTEGRAÇÃO NA UI

### 5.1. Localização Proposta
No componente [`ItemBalancesHeader.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/item-balances/ItemBalancesHeader.tsx):
- Posicionado na barra de ações do cabeçalho do item (ao lado dos botões de link PNCP e "Voltar aos itens");
- Botão padronizado com a identidade visual do SaldoARP:
  * Ícone padrão: `RefreshCw` (lucide-react);
  * Ícone em carregamento: `Loader2` (com animação de rotação);
  * Rótulo padrão: `"Sincronizar Empenhos"`;
  * Rótulo em execução: `"Sincronizando..."`;
  * Tooltip para usuários autorizados: *"Sincronizar empenhos deste item nas fontes oficiais (Compras.gov.br)"*;
  * Tooltip para usuários sem permissão: *"Você não possui permissão para sincronizar empenhos deste item."*.

### 5.2. Banner de Feedback Operacional
Logo abaixo do cabeçalho de metadados do item, renderização condicional de um banner informativo descartável com botão `X`.

---

## 6. PLANEJAMENTO DO HOOK REACT QUERY: `useSyncItemEmpenhos`

### 6.1. Assinatura do Hook
```typescript
// Estrutura planejada para src/hooks/useSyncItemEmpenhos.ts
export interface SyncItemEmpenhosParams {
  unitPrice?: number;
  contracts?: ItemTarget['contracts'];
}

export function useSyncItemEmpenhos(itemKey: string) {
  const queryClient = useQueryClient();

  return useMutation<OrchestrationResult, Error, SyncItemEmpenhosParams | void>({
    mutationFn: async (params) => {
      const target: ItemTarget = {
        tipo: 'ITEM',
        itemKey,
        unitPrice: params?.unitPrice,
        contracts: params?.contracts
      };
      return orchestrateItemEmpenhoSync(target);
    },
    onSuccess: (result) => {
      // Invalidação cirúrgica de caches de Item e Saldo M18
      const parsed = parseItemKey(itemKey);
      
      queryClient.invalidateQueries({
        queryKey: ['item-empenhos', parsed.numeroAta, parsed.uasg, parsed.itemNum]
      });
      queryClient.invalidateQueries({
        queryKey: ['item-unidades', parsed.numeroAta, parsed.uasg, parsed.itemNum]
      });
      queryClient.invalidateQueries({
        queryKey: ['v_arp_item_saldo_detalhado', itemKey]
      });
      queryClient.invalidateQueries({
        queryKey: ['v_arp_item_saldo_detalhado']
      });
      queryClient.invalidateQueries({
        queryKey: ['v_arp_item_empenhos_resumo', itemKey]
      });
      queryClient.invalidateQueries({
        queryKey: ['v_empenhos_resumo']
      });
      queryClient.invalidateQueries({
        queryKey: ['item-allocations', itemKey]
      });
    }
  });
}
```

### 6.2. Invariantes do Hook
- **Zero Lógica de Negócio:** O hook apenas empacota os parâmetros e invoca `orchestrateItemEmpenhoSync`;
- **Controle de Estado:** Gerencia nativamente `isPending`, `isError`, `data`, `error`, `reset`.

---

## 7. FEEDBACK OPERACIONAL MULTIESTADOS NO CONTEXTO DO ITEM

| Status Retornado | Projeção Visual | Mensagem Adaptada para o Item |
| :--- | :---: | :--- |
| **`SUCESSO`** | Verde (`#f0fdf4`) | *"Sincronização concluída. {N} empenho(s) processado(s) e saldo do item atualizado com sucesso."* |
| **`SEM_DADOS`** | Azul (`#f0f9ff`) | *"Nenhum empenho de consumo localizado nas bases oficiais para este item da Ata."* |
| **`SUCESSO_PARCIAL`** | Amarelo (`#fffbeb`) | *"Sincronização concluída parcialmente. Alguma base governamental estava temporariamente indisponível."* |
| **`COM_DIVERGENCIAS`** | Amarelo (`#fffbeb`) | *"Dados sincronizados com {N} divergência(s) entre fontes. Detalhes registrados no histórico."* |
| **`ERRO`** | Vermelho (`#fef2f2`) | *"Não foi possível consultar as bases governamentais no momento. Tente novamente mais tarde."* |

---

## 8. ESTRATÉGIA DE INVALIDAÇÃO DE CACHE

Para evitar refetches excessivos e garantir consistência imediata na tela do Item:

| Query Key | Objetivo da Invalidação |
| :--- | :--- |
| `['item-empenhos', numeroAta, uasg, numeroItem]` | Atualiza a lista de empenhos exibida na aba "Empenhos" |
| `['item-unidades', numeroAta, uasg, numeroItem]` | Atualiza os consumos distribuídos na aba "Unidades" |
| `['v_arp_item_saldo_detalhado', itemKey]` | Atualiza a view M18 de saldo físico do item |
| `['v_arp_item_empenhos_resumo', itemKey]` | Atualiza o sumário analítico de empenhos do item M18 |
| `['v_empenhos_resumo']` | Atualiza listagens globais analíticas de empenhos M18 |
| `['item-allocations', itemKey]` | Atualiza as alocações internas vinculadas ao item |

---

## 9. POLÍTICA DE SEGURANÇA E RBAC

A autorização segue exatamente o modelo homologado na Fase 7.2-K:
- **Perfis Autorizados:** `gestor`, `coordenador`, `admin`;
- **Perfis Restritos (Read-Only):** `consulta`, `auditor`;
- **Comportamento para Usuários Restritos:** Botão renderizado em modo `disabled` com tooltip explicativo;
- **Proteção Concorrente:** Botão desabilitado durante `isPending === true`.

---

## 10. CENÁRIOS OPERACIONAIS E ORDEM TEMPORAL DOS ATOS

### 10.1. Cenário A: Item com Empenho Direto (Sem Contrato)
- **Hipótese:** Compra direta por Nota de Empenho ou entrega imediata (art. 95 da Lei 14.133/2021);
- **Comportamento:** A sincronização consulta Compras.gov.br, encontra o empenho e cria o vínculo quantitativo em `public.arp_item_empenhos`. Nenhum contrato é exigido.

### 10.2. Cenário B: Item com Empenho e Posterior Vínculo a Contrato
- **Hipótese:** O empenho é emitido previamente e, em momento posterior, formaliza-se o Termo de Contrato;
- **Comportamento:** O empenho mantém sua chave canônica soberana (`canonical_key`). Quando vinculado ao contrato, cria-se a linha correspondente em `public.contrato_empenhos` sem duplicar o empenho nem o débito quantitativo do item.

---

## 11. MATRIZ DE TESTES DA FUTURA FASE 7.2-M

Na fase de implementação (7.2-M), a suíte deverá conter:

1. **Testes Unitários de Hook (`useSyncItemEmpenhos.test.ts`):**
   - Disparo da mutação com `ItemTarget` e `itemKey`;
   - Invalidação cirúrgica de `item-empenhos`, `item-unidades` e `v_arp_item_saldo_detalhado`;
   - Tratamento de `isPending` e propagação de erros.
2. **Testes de Componente (`ItemBalancesHeader.test.tsx` / `ItemBalances.test.tsx`):**
   - Renderização do botão `"Sincronizar Empenhos"`;
   - Desabilitação por RBAC (`consulta`);
   - Desabilitação e spinner durante carregamento;
   - Renderização dos 5 banners operacionais;
   - Descarte do banner via botão `X`.

---

## 12. INVARIANTES ARQUITETURAIS GARANTIDOS

1. **M16 / M17 / M18 Inalterados:** Zero novas migrations, zero novas tabelas, zero novas RPCs;
2. **Zero Segundo SSOT:** A UI não armazena dados em `localStorage` como fonte de verdade;
3. **Isolamento Ontológico:** A relação quantitativa Item $\leftrightarrow$ Empenho não interfere na relação financeira Contrato $\leftrightarrow$ Empenho.

---

## 13. PLANO DE EXECUÇÃO PARA A FASE 7.2-M

```text
┌─────────────────────────────────────────────────────────────┐
│ FASE 7.2-M — IMPLEMENTAÇÃO CONTROLADA NO ITEM DA ATA        │
│ 1. Criar src/hooks/useSyncItemEmpenhos.ts                   │
│ 2. Atualizar src/components/item-balances/ItemBalancesHeader│
│ 3. Criar testes unitários e de componente                   │
│ 4. Validar com Vitest (691+ testes), tsc, oxlint, build    │
└─────────────────────────────────────────────────────────────┘
```
