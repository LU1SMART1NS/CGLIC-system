# RELATÓRIO DE SANEAMENTO — FASE 6.2-C
## SANEAMENTO DOS ACHADOS DA AUDITORIA DA FASE 6.2 (VÍNCULO ARP ↔ CONTRATO OFICIAL)

**Data de Conclusão**: 24 de Setembro de 2026  
**Status**: **GO (APROVADO)**  
**Auditoria Prévia**: `FASE_6_2_AUDITORIA_FECHAMENTO.md` (HOLD)  
**Suíte de Testes**: 69 arquivos de teste / 583 testes PASSING (100%) | TypeScript PASS | Lint PASS | Build PASS  

---

## 1. ACHADOS ORIGINAIS

A auditoria de fechamento da Fase 6.2 havia colocado a entrega em estado de **HOLD** em razão de dois desvios identificados:

1. **`ACH-6.2-01` (CRÍTICO)**: **Incompatibilidade de Foreign Key entre `contrato_empenho_links.contrato_id` e `contratos_manuais(id)`**. A RPC `link_contract_to_item_atomic` tentava inserir o ID de `arp_item_contract_links` na tabela de lastro de empenhos, provocando aborto transacional por violação de integridade referencial no PostgreSQL real.
2. **`ACH-6.2-02` (ALTO)**: **Persistência paralela indevida em `localStorage`**. Presença de fallback offline ativo com geração de identificadores artificiais (`mockId`) e leitura/escrita em storage do browser, violando o princípio de SSOT (*Single Source of Truth*).
3. **`ACH-6.2-03` (MÉDIO)**: **Descompasso entre o escopo da Fase 6.2 e a tentativa de associar empenhos de lastro**, antecipando indevidamente a modelagem da Fase 7.

---

## 2. ACH-6.2-01 — FK MISMATCH (ANÁLISE E RESOLUÇÃO)

### Diagnóstico Forense
A tabela `public.contrato_empenho_links` foi criada na Migration `20260917000001_canonical_schema.sql` (linha 160) com a seguinte constraint física:
```sql
contrato_id VARCHAR(150) NOT NULL REFERENCES public.contratos_manuais(id) ON DELETE CASCADE
```
A tentativa de vincular empenhos na RPC `link_contract_to_item_atomic` utilizava:
```sql
INSERT INTO public.contrato_empenho_links (contrato_id, ...) VALUES (v_link_id::TEXT, ...);
```
Onde `v_link_id` provinha da tabela `public.arp_item_contract_links`. No PostgreSQL real, qualquer seleção de empenho no modal resultava em erro `23503 — Foreign Key Violation`.

### Resolução Implementada
Conforme as diretrizes da Fase 6.2-C:
- Removeu-se qualquer tentativa de inserção ou remoção na tabela `public.contrato_empenho_links` a partir do fluxo de contratos oficiais.
- A tabela `contrato_empenho_links` **não foi alterada** nem descaracterizada, preservando a compatibilidade total com os contratos manuais pré-existentes.
- A resolução arquitetural definitiva para a relação tripla `Empenho ↔ Contrato Oficial ↔ Item da ARP` fica formalmente alocada para a **Fase 7**.

---

## 3. ACH-6.2-02 — LOCALSTORAGE (PURIFICAÇÃO DA SSOT)

### Diagnóstico Forense
O arquivo `arpContractLinkService.ts` continha lógica de contingência offline não solicitada, gerando `mockId = link_${Date.now()}` e salvando vínculos em `localStorage.setItem('saldoarp-arp-item-contract-links-...')`. Se a rede oscilasse, o usuário via registros locais inexistentes no PostgreSQL.

### Resolução Implementada
- **Remoção Absoluta de Fallback Offline**: Eliminou-se toda e qualquer leitura, gravação ou geração de `mockId` via `localStorage`.
- **SSOT 100% PostgreSQL**: O fluxo é estritamente:
  $$\text{UI} \longrightarrow \text{React Query} \longrightarrow \text{Service} \longrightarrow \text{RPC / PostgreSQL} \longrightarrow \text{arp\_item\_contract\_links}$$
- **Tratamento de Indisponibilidade**: Em caso de falha de conexão ou erro no Supabase, o erro é propagado imediatamente para a camada de mutação do React Query. A UI apresenta mensagem de erro explícita e **nenhum vínculo falso ou temporário é criado localmente**.
- **Limpeza de Legado**: Implementou-se rotina de saneamento defensivo para remover qualquer chave residual antiga `saldoarp-arp-item-contract-links-*` do navegador do usuário.

---

## 4. ACH-6.2-03 — EMPENHOS E DELIMITAÇÃO DE DOMÍNIO

### Diagnóstico Forense
A interface do `LinkContractModal.tsx` exibia uma seção de seleção de Notas de Empenho de lastro ("Opcional"), sugerindo ao operador uma persistência que violava o modelo relacional da Fase 6.2.

### Resolução Implementada
- A seção de seleção de empenhos foi **completamente removida** do componente `LinkContractModal.tsx`.
- O modal foi simplificado e purificado para o fluxo essencial:
  1. Seleção do Contrato Oficial vigente da UASG (via autocomplete com cache React Query);
  2. Apresentação dos dados oficiais somente leitura (fornecedor, CNPJ, vigência, valor global, link PNCP);
  3. Entrada da `quantidade_contratada` (com alerta de teto da ata);
  4. Observações contextuais opcionais;
  5. Confirmação do vínculo atômico.
- Nenhuma menção a seleção de empenho permanece na interface de vinculação oficial.

---

## 5. CORREÇÕES EXECUTADAS (MATRIZ DE ARTEFATOS)

| Arquivo | Natureza da Modificação |
| :--- | :--- |
| `supabase/migrations/20260924000015_arp_item_contract_links.sql` | Removido `p_empenho_ids`, removido DML em `contrato_empenho_links` em `link_contract_to_item_atomic` e `unlink_contract_from_item_atomic`. |
| `src/types/arpContractLinks.ts` | Removido campo `empenhoIds` de `ArpItemContractLink`, `LinkContractToItemParams` e `EnrichedArpItemContract`. |
| `src/adapters/arpContractLinkRpcAdapter.ts` | Removido `empenhos_count` do retorno e `p_empenho_ids` dos argumentos da RPC. |
| `src/services/arpContractLinkService.ts` | Eliminado `localStorage`, removido `mockId`, eliminada consulta a `contrato_empenho_links`. SSOT exclusiva no PostgreSQL. |
| `src/components/modals/LinkContractModal.tsx` | Removido estado e UI de seleção de empenhos. Fluxo simplificado e seguro. |
| `src/components/ItemBalances.tsx` | Removida passagem de `availableEmpenhos` para o `LinkContractModal`. |
| `src/services/__tests__/arpContractLinkService.test.ts` | Reescrita com cobertura completa dos casos TC-01 a TC-10 comprovando pureza arquitetural. |
| `src/adapters/__tests__/arpContractLinkRpcAdapter.test.ts` | Atualizado sem parâmetros de empenhos na RPC. |
| `src/hooks/__tests__/useItemContractLinks.test.ts` | Atualizado sem referências a `empenhoIds`. |

---

## 6. PERSISTÊNCIA

A persistência do vínculo oficial agora é atômica, única e centralizada:
- **Tabela**: `public.arp_item_contract_links`
- **Colunas**: `id`, `item_key`, `contract_key`, `quantidade_contratada`, `observacoes`, `criado_por`, `created_at`, `updated_at`.
- **Constraint**: `UNIQUE (item_key, contract_key)` impedindo duplicidade.
- **Auditoria**: Anexada ao trigger `public.trg_audit_log_capture()`.

---

## 7. RPC ATÔMICA

A RPC `link_contract_to_item_atomic` executa estritamente:
1. Validação de papéis RBAC (`gestor` ou `admin`);
2. Validação regex do `item_key` (`^[0-9]{5}/[0-9]{4}-[0-9]{6}-[0-9]{5}$`);
3. Validação de `contract_key` não nula;
4. Validação de quantidade estritamente positiva (`> 0`);
5. Upsert idempotente na tabela `arp_item_contract_links`;
6. Retorno canônico em JSON com timestamp do servidor.

---

## 8. INTERFACE DO USUÁRIO (UI / UX)

A experiência do usuário no cockpit de saldos de itens da ARP (`ItemBalances.tsx`):
- Apresenta botão primário `"+ Vincular Contrato Oficial"`.
- Mantém botão secundário `"+ Adicionar Manual"` para transição assistida.
- Renderiza contratos oficiais com badge `🟢 Oficial` e botão direto `<Link to="/contratos/:contractKey">Visão 360°</Link>`.
- Permite desvinculação através do botão de lixeira com confirmação explícita.
- Não oferece promessas de seleção de empenho na vinculação oficial.

---

## 9. INVARIANTE CONTÁBIL DE SALDO

A auditoria confirma que a fórmula de saldo contábil da ARP permanece absolutamente intocada:

$$\text{Saldo da Ata} = \text{Qtd Homologada} - \sum \text{Empenhos Emitidos}$$

- Criar vínculo oficial **não altera o saldo**.
- Alterar `quantidade_contratada` **não altera o saldo**.
- Excluir vínculo oficial **não altera o saldo**.
- Criar vínculo **não cria empenho**.
- Remover vínculo **não remove empenho**.

---

## 10. CONTRATOS MANUAIS

O ecossistema legado de `contratos_manuais`:
- Permanece 100% preservado no schema e na UI (badge `🟡 Manual`).
- Suas RPCs dedicadas (`save_manual_contrato_atomic`, `delete_manual_contrato_atomic`) continuam operando normalmente com a regra RN-07.
- O desacoplamento realizado na Fase 6.2-C garantiu que o fluxo oficial não colida com a FK física de `contratos_manuais`.

---

## 11. AUDITORIA

O trigger de auditoria `trg_audit_arp_item_contract_links` registra:
- `INSERT`: Criação de novo vínculo;
- `UPDATE`: Ajuste de quantidade contratada ou observações;
- `DELETE`: Desvinculação do contrato oficial.

---

## 12. RESULTADOS DOS TESTES AUTOMATIZADOS (TC-01 A TC-10)

Todos os casos de teste estipulados foram implementados e validados com êxito:

- **TC-01**: Vínculo oficial é persistido exclusivamente no PostgreSQL via RPC (PASS).
- **TC-02**: Falha de PostgreSQL propaga erro e não grava em `localStorage` (PASS).
- **TC-03**: Rejeita fallback offline e nunca gera identificador artificial `mockId` (PASS).
- **TC-04**: Não aciona nem referencia a tabela `contrato_empenho_links` (PASS).
- **TC-05**: Vínculo oficial não altera o saldo da ata (PASS).
- **TC-06**: Quantidade contratada não altera o saldo da ata (PASS).
- **TC-07**: Mantém isolamento sem afetar o fluxo de contratos manuais (PASS).
- **TC-08**: `contract_key` canônica conecta diretamente à rota do Contrato 360° (PASS).
- **TC-09**: Dados oficiais derivam exclusivamente do catálogo em memória sem duplicação (PASS).
- **TC-10 (Regressão)**: Suporta coexistência de contratos oficiais e manuais sem duplicação da mesma chave (PASS).

Execução completa da suíte Vitest:
```bash
$ npm test -- --run
Test Files  69 passed (69)
Tests       583 passed (583)
Duration    6.66s
```

---

## 13. TYPESCRIPT

```bash
$ npx tsc -b
# Concluído com 0 erros.
```

---

## 14. LINTER

```bash
$ npm run lint
# Concluído com 0 erros (42 warnings pré-existentes de regras de hooks).
```

---

## 15. BUILD DE PRODUÇÃO

```bash
$ npm run build
vite v8.2.2 building client environment for production...
✓ 2055 modules transformed.
dist/index.html                  0.98 kB │ gzip:   0.54 kB
dist/assets/index-BCG5ofOC.css  16.65 kB │ gzip:   3.69 kB
dist/assets/index-CODpI-M9.js 2,018.43 kB │ gzip: 530.49 kB
✓ built in 617ms
```

---

## 16. IMPACTO NA FASE 7 (EMPENHOS E PAGAMENTOS)

A **Fase 7** herdará um ambiente limpo e desacoplado:
1. O vínculo **ARP → Item → Contrato Oficial** está consolidado e funcional.
2. A amarração com **Empenhos (SIAFI / PNCP)** será desenhada de forma unificada na Fase 7, resolvendo a relação `Empenho ↔ Contrato Oficial ↔ Item da Ata` com modelo de dados próprio, sem depender de amarrações provisórias na tabela de contratos manuais.

---

## 17. RISCOS REMANESCENTES

- **Risco de Quebra Relacional (ACH-6.2-01)**: **ELIMINADO**. Nenhuma operação escreve em `contrato_empenho_links`.
- **Risco de Divergência por LocalStorage (ACH-6.2-02)**: **ELIMINADO**. O storage local não participa da persistência.
- **Risco de Regressão em Contratos Manuais**: **ZERO**. A coexistência foi mantida intacta.

---

## 18. VEREDITO FINAL

# **GO (APROVADO)**

### Critérios Atendidos:
- [x] `localStorage` não é mais fonte de persistência (SSOT exclusiva no PostgreSQL).
- [x] Nenhuma operação de empenho é executada indevidamente na Fase 6.2.
- [x] Tabela `contrato_empenho_links` não é acionada pelo fluxo oficial (FK intacta).
- [x] Invariante contábil de saldo está 100% preservada.
- [x] Catálogo oficial continua soberano sem duplicação de dados.
- [x] 69 arquivos de teste / 583 testes PASSING.
- [x] TypeScript PASS (0 erros).
- [x] Lint PASS (0 erros).
- [x] Build de produção PASS.

A Fase 6.2 está formalmente saneada e aprovada, autorizando o avanço para a **Fase 6.3 — Homologação da Integração ARP ↔ Contratos Oficiais**.
