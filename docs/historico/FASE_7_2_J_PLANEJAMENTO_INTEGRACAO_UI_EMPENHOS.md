# FASE 7.2-J — PLANEJAMENTO DA INTEGRAÇÃO DA SINCRONIZAÇÃO DE EMPENHOS NA INTERFACE (UI)

**Data:** 24 de Setembro de 2026  
**Status da Fase:** **PLANEJAMENTO CONCLUÍDO (GO)**  
**Versão do Sistema:** SaldoARP 3.0  
**Caráter:** Exclusivamente Arquitetural e de Planejamento de UX/Frontend (Zero Código Funcional)

---

## 1. RESUMO EXECUTIVO E OBJETIVO

Com a conclusão da camada de Orquestração On-Demand (Fase 7.2-I / 7.2-I-A), o motor de reconciliação e persistência soberana M17/M16 está 100% operacional no backend.

O objetivo da **Fase 7.2-J** é planejar a integração dessa funcionalidade na camada de interface React da aplicação, fornecendo aos usuários uma experiência fluida, contextual e simples:

$$\text{AÇÃO CONTEXTUAL NO FRONTEND} \longrightarrow \text{HOOK REACT QUERY} \longrightarrow \text{ORQUESTRADOR ON-DEMAND} \longrightarrow \text{M17/M16/M18} \longrightarrow \text{INVALIDAÇÃO DE CACHE} \longrightarrow \text{FEEDBACK OPERACIONAL}$$

---

## 2. PRINCÍPIOS DE EXPERIÊNCIA DO USUÁRIO (UX)

1. **Simplicidade Contextual:** O usuário final nunca é exposto a termos técnicos de infraestrutura (RPCs, M16, M17, M18, adapters, canonical_keys, advisory locks).
2. **Ação Unificada:** Uma ação simples e intuitiva — `"Sincronizar Empenhos"` — aciona toda a cadeia de sincronização e reconciliação em background.
3. **Permanência na Tela:** O usuário permanece na página onde disparou a ação (ex: Visão 360° do Contrato), sem redirecionamento para telas técnicas de log.
4. **Linguagem Operacional:** Resultados são comunicados em linguagem clara e amigável da administração pública.
5. **Divergência $\neq$ Erro:** Discrepâncias entre bases governamentais não travam a sincronização nem aparecem como falha de sistema; são exibidas como avisos informativos.

---

## 3. PONTO INICIAL DE INTEGRAÇÃO: VISÃO 360° DO CONTRATO

### 3.1 Justificativa Técnica
A **Visão 360° do Contrato** (`Contract360Page.tsx`) foi selecionada como o primeiro ponto de integração por ser a central de gestão orçamentária e operacional de maior densidade do sistema, com escopo delimitado (um contrato por vez), reduzindo o risco de saturação de quota (HTTP 429).

### 3.2 Localização Proposta na Interface
No componente [`Contract360Header.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/Contract360Header.tsx):
- Posicionado na barra superior de ações contextuais (ao lado do link externo do PNCP);
- Botão secundário estilizado:
  * Ícone: `RefreshCw` (lucide-react);
  * Rótulo: `"Sincronizar Empenhos"`;
  * Estado de carregamento: ícone animado (`Loader2`), botão desabilitado com texto `"Sincronizando..."`.

---

## 4. PLANEJAMENTO DO HOOK REACT QUERY: `useSyncContractEmpenhos`

### 4.1 Arquitetura do Hook
O hook será criado na fase de implementação como uma mutação React Query:

```typescript
// Estrutura conceitual planejada para src/hooks/useSyncContractEmpenhos.ts
export function useSyncContractEmpenhos(contractKey: string) {
  const queryClient = useQueryClient();

  return useMutation<OrchestrationResult, Error, { contratoId?: number | string; pncpParams?: any }>({
    mutationFn: async (params) => {
      return orchestrateContractEmpenhoSync({
        tipo: 'CONTRATO',
        contractKey,
        contratoId: params?.contratoId,
        pncpParams: params?.pncpParams
      });
    },
    onSuccess: (result) => {
      // Invalidação cirúrgica de caches M18
      queryClient.invalidateQueries({ queryKey: ['contract', contractKey] });
      queryClient.invalidateQueries({ queryKey: ['v_contrato_empenhos_lastro', contractKey] });
      queryClient.invalidateQueries({ queryKey: ['v_empenhos_resumo'] });
      queryClient.invalidateQueries({ queryKey: ['contract_events', contractKey] });
    }
  });
}
```

### 4.2 Invariantes do Hook
- O hook **não contém lógica de reconciliação ou cálculo**;
- Delega integralmente para `orchestrateContractEmpenhoSync`;
- Gerencia estados `isPending`, `isError`, `isSuccess`.

---

## 5. ESTRATÉGIA DE INVALIDAÇÃO DE CACHE (REACT QUERY)

Para evitar refetches desnecessários de toda a aplicação (*over-fetching*), a sincronização invalidará **apenas** as chaves relacionadas ao alvo:

| Chave de Cache (Query Key) | Impacto no Frontend |
| :--- | :--- |
| `['contract', contractKey]` | Atualiza status e metadados do contrato |
| `['v_contrato_empenhos_lastro', contractKey]` | Atualiza o painel de lastro orçamentário e empenhos vinculados (M18) |
| `['v_empenhos_resumo']` | Atualiza listagens analíticas de empenhos |
| `['v_arp_item_saldo_detalhado']` | Se o contrato estiver associado a uma Ata, atualiza o saldo físico do item |
| `['contract_events', contractKey]` | Atualiza a linha do tempo de eventos do contrato |

---

## 6. TRADUÇÃO DE RESULTADOS EM FEEDBACK OPERACIONAL

| Status Retornado | Mensagem Exibida ao Usuário (Toast / Banner) | Tipo Visual |
| :--- | :--- | :---: |
| **`SUCESSO`** | *"Sincronização concluída. {N} empenho(s) atualizado(s) com sucesso."* | Sucesso (Verde) |
| **`SEM_DADOS`** | *"Nenhum empenho encontrado nas bases oficiais para este contrato."* | Info (Azul) |
| **`SUCESSO_PARCIAL`** | *"Sincronização concluída parcialmente. Algumas bases externas estavam temporariamente indisponíveis."* | Alerta (Amarelo) |
| **`COM_DIVERGENCIAS`** | *"Dados sincronizados com divergências entre fontes oficiais. Detalhes disponíveis no painel."* | Alerta (Amarelo) |
| **`ERRO`** | *"Não foi possível consultar as bases governamentais no momento. Tente novamente mais tarde."* | Erro (Vermelho) |

---

## 7. INTEGRAÇÃO DE DIVERGÊNCIAS NA CENTRAL DE ATENÇÃO

Quando a orquestração retornar status `COM_DIVERGENCIAS`:
- A sincronização **não é abortada**; os dados oficiais são salvos no M16;
- Um card informativo pode ser projetado na [`ContractAttentionCenter.tsx`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/components/contracts/ContractAttentionCenter.tsx):
  * Título: *"Divergência Contábil de Empenho"*
  * Detalhe: *"Divergência de valores/datas entre Contratos.gov e PNCP. Prevaleceu a fonte SIAFI/Contratos.gov."*

---

## 8. CONTROLE DE CONCORRÊNCIA E PREVENÇÃO DE DUPLO CLIQUE NA UI

1. **Estado `disabled` no Botão:** Durante `isPending = true`, o botão permanece desabilitado com cursor `not-allowed`.
2. **Deduplicação de Mutação:** O React Query descarta cliques repetidos enquanto a promessa inicial estiver em trânsito.
3. **Idempotência Garantida:** Caso duas requisições concorrentes atinjam o backend, os *advisory locks* da M17 garantem que não haverá duplicatas no banco.

---

## 9. POLÍTICA DE SEGURANÇA E CONTROLE DE ACESSO (RBAC)

- **Permissão Exigida:** Papéis `gestor` ou `admin` (conforme verificado via `useRoles()` / `hasRole`).
- **Comportamento para Perfil de Leitura / Auditor:**
  * O botão `"Sincronizar Empenhos"` é renderizado desabilitado;
  * Tooltip explicativo: *"Sincronização restrita a gestores e administradores do SaldoARP."*
- **Segurança de Rede:** Nenhuma API externa ou RPC de banco é chamada diretamente pelo browser do cliente sem passar pela camada controlada.

---

## 10. ROTEIRO DE IMPLANTAÇÃO POR ETAPAS

```
┌─────────────────────────────────────────────────────────────┐
│ ETAPA 1: VISÃO 360° DO CONTRATO (Foco Atual - Fase 7.2-K)   │
│ - Botão em Contract360Header + useSyncContractEmpenhos      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ ETAPA 2: ITEM DE ATA DE REGISTRO DE PREÇOS                  │
│ - Botão em ItemBalances.tsx + useSyncItemEmpenhos           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ ETAPA 3: ATA DE REGISTRO DE PREÇOS COMPLETA                 │
│ - Botão na Visão da Ata + useSyncAtaEmpenhos (micro-lotes)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. MATRIZ DE TESTES FUTUROS DA INTEGRAÇÃO UI

### Testes Unitários de Hooks
1. `useSyncContractEmpenhos`: disparo da mutação e chamada a `orchestrateContractEmpenhoSync`;
2. Invalidação correta das query keys de M18 (`v_contrato_empenhos_lastro`, `contract`);
3. Tratamento de loading (`isPending = true`) e erro.

### Testes de Componentes
1. Renderização do botão `"Sincronizar Empenhos"` no cabeçalho do Contrato 360°;
2. Desabilitação do botão para usuário sem permissão (`auditor`);
3. Exibição de spinner durante a sincronização;
4. Disparo de toast informativo conforme o `OrchestrationStatus` retornado;
5. Prevenção de duplo clique.

---

## 12. CRITÉRIOS DE ACEITE DO PLANEJAMENTO

- [x] Ponto inicial na UI claramente definido (Contrato 360°);
- [x] Hook React Query especificado sem lógica de negócio duplicada;
- [x] Query keys e estratégia de invalidação cirúrgica definidas;
- [x] Mapeamento de status e mensagens operacionais amigáveis;
- [x] Tratamento de divergências contábeis sem transformar em erro técnico;
- [x] Prevenção de duplo clique e controle de loading;
- [x] Política RBAC de acesso restrito a gestores e administradores;
- [x] Roteiro escalonado: Contrato $\rightarrow$ Item $\rightarrow$ Ata;
- [x] Zero código funcional alterado nesta fase.

---

## 13. CONCLUSÃO E VEREDITO

O planejamento da integração da sincronização de empenhos na interface está completo, viável e pronto para homologação.

```text
============================================================
FASE 7.2-J — RESULTADO
======================

PLANEJAMENTO: GO
IMPLEMENTAÇÃO REALIZADA: NÃO (0 código alterado)
M16: INALTERADO
M17: INALTERADO
M18: INALTERADO

MIGRATIONS: 0
NOVAS RPCs: 0
NOVAS VIEWS: 0
FRONTEND FUNCIONAL ALTERADO: 0
============================================================
```
