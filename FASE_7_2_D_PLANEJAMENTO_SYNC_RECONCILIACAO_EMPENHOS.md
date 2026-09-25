# FASE 7.2-D — PLANEJAMENTO DA SINCRONIZAÇÃO E RECONCILIAÇÃO DE EMPENHOS

**Sistema**: SaldoARP — Gestão Avançada de Atas de Registro de Preços e Contratos  
**Data**: 23 de Setembro de 2026  
**Status**: CONCLUÍDO — HOMOLOGADO (GO)  
**Ambiente Alvo**: Supabase PostgreSQL 17.6 (`bouutpmxexvwppcmmhdi`)  
**Natureza da Fase**: Auditoria de Código, Mapeamento de APIs Federais e Desenho Arquitetural (Zero Código Funcional / Zero Alteração de Banco)  
**Invariantes Governança**: P1 (SSOT Canônico Soberano), P3 (Database Integrity), P6 (Auditabilidade e Imutabilidade), P7 (Least Privilege RBAC)

---

## 1. ESTADO ATUAL E CONTEXTO ARQUITETURAL

O SaldoARP concluiu com sucesso as fases de estruturação de persistência soberana:
- **Fase 7.0 / 7.0-A**: Auditoria global de empenhos, desmitificação da RN-07 (regra operacional e não constraint rígida de banco) e separação ontológica entre quantidade física e valor financeiro;
- **Fase 7.1**: Planejamento da modelagem relacional em 3 camadas;
- **Fase 7.2-A**: Implementação e homologação da **Migration 16** (`public.empenhos`, `public.arp_item_empenhos`, `public.contrato_empenhos`, `public.empenho_eventos_historico`);
- **Fase 7.2-B**: Desenho formal das 5 RPCs transacionais atômicas;
- **Fase 7.2-C**: Implementação e homologação da **Migration 17** em produção com 100% de sucesso nos testes transacionais e de concorrência.

### Baseline Atual de Homologação
```text
Test Suites: 71 passed (71)
Tests:       628 passed (628)
TypeScript:  0 erros (tsc --noEmit)
ESLint:      0 erros
Build:       PASS (749ms)
Banco:       M16 e M17 ativas no Supabase remoto; 0 registros residuais
```

As 5 RPCs da M17 constituem a única porta de entrada autorizada para mutações soberanas:
1. `save_empenho_soberano_atomic(JSONB)`
2. `link_empenho_to_item_atomic(VARCHAR, UUID, NUMERIC, ...)`
3. `unlink_empenho_from_item_atomic(UUID)`
4. `link_empenho_to_contract_atomic(VARCHAR, UUID, NUMERIC)`
5. `unlink_empenho_from_contract_atomic(UUID)`

---

## 2. AUDITORIA DAS INTEGRAÇÕES EXISTENTES NO PROJETO

Antes de propor qualquer sincronizador, foi executada auditoria profunda em todo o código-fonte existente no SaldoARP (`src/services/api.ts`, `src/components/ItemBalances.tsx`, `src/services/balanceService.ts`, `src/services/allocationService.ts`):

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               FLUXO DE EMPENHOS ATUAL NO CÓDIGO                             │
├───────────────────────────────┬─────────────────────────────────────────────────────────────┤
│ 1. Compras.gov.br (Dados Ab.) │ api.ts: fetchEmpenhosSaldoItem(/4_consultarEmpenhosSaldoItem)│
│ 2. Contratos.gov.br           │ api.ts: fetchContratosGovEmpenhos(/api/contrato/{id}/empenhos│
│ 3. Contratos.gov.br (Minuta)  │ api.ts: fetchContratoEmpenhoDetalhe(/consultar/{id})        │
│ 4. PNCP (Contratos)           │ api.ts: fetchPncpContractEmpenhos(/contratos/{id}/empenhos) │
│ 5. Normalização no Cliente    │ balanceService.ts: normalizeEmpenhoNumero                   │
│ 6. Dedução Física Heurística  │ balanceService.ts: deduceEmpenhoQuantity, getEmpenhoEffective│
│ 7. Merge em Tempo de Execução │ balanceService.ts: matchAndMergeEmpenhos                    │
│ 8. Persistência Legada        │ allocationService.ts: empenhos_manuais, empenho_links       │
└───────────────────────────────┴─────────────────────────────────────────────────────────────┘
```

### Principais Diagnósticos da Auditoria:
1. **Inexistência de Sincronizador de Banco**: Todas as consultas a APIs governamentais ocorrem no navegador do usuário (*client-side fetch*) no momento em que a tela é aberta;
2. **Volatilidade de Dados**: Se a API pública estiver lenta, indisponível ou retornar erro HTTP 429/500, o cliente fica sem dados ou recorre ao cache volátil do navegador (`localStorage` / IndexedDB);
3. **Cálculo de Quantidade no Frontend**: O desdobramento entre valor financeiro da Nota de Empenho (R$) e quantidade física do item (unidades) ocorre em código TypeScript no cliente React (`ItemBalances.tsx`);
4. **Múltiplos Formatos de Chave**: O código histórico possuía variações de chave (ex: incluindo `itemId` na chave do empenho), superadas pela padronização da M16/M17.

---

## 3. MATRIZ DE FONTES OFICIAIS DO GOVERNO FEDERAL

| Fonte Governamental | Tipo / Protocolo | Dados Disponíveis | Identificador Original | Confiabilidade | Papel no SaldoARP |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Compras.gov.br (Dados Abertos)** | REST / JSON público (`/modulo-arp/4_consultarEmpenhosSaldoItem`) | Item, Unidade, Quantidade registrada, Quantidade empenhada, Saldo do item, Número da NE, Data, Fornecedor, Valor empenhado. | `numeroEmpenho`, `numeroItem`, `numeroAta` | Alta para débitos de Atas | **Fonte Primária para Débito Físico no Item da Ata** |
| **Contratos.gov.br (API Interna/ComprasNet)** | REST / JSON (`/api/contrato/{id}/empenhos` e `/consultar/{id}`) | ID interno, Unidade Gestora, Número da NE, Data emissão, Credor (CNPJ/Nome), Empenhado, Liquidado, Pago, RP Inscrito, Itens da Minuta SIAFI com quantidade física. | `id` numérico, `numero` (`2026NE000123`), `unidade_gestora` | Altíssima (Espelho fiel do SIAFI) | **Fonte Primária para Execução Financeira e Estágios da Despesa** |
| **PNCP (Portal Nacional de Contratações)** | REST / JSON aberto (`/api/pncp/v1/orgaos/{cnpj}/.../empenhos`) | Número do empenho, Data emissão, Valor total, Sequencial no contrato. | `numeroEmpenho`, `sequencialEmpenho` | Média/Alta (Agregador da Lei 14.133) | **Fonte Complementar de Lastro Contratual** |
| **SIAFI Direto (Tesouro Nacional / Serpro)** | WebService HOD / API Serpro Gov | Execução orçamentária primária completa, contas contábeis, cronograma de desembolso. | `UG`, `Gestao`, `NumeroNE` | Soberana Máxima | **GAP Atual**: Não integrado diretamente via certificado; acessado indiretamente via Contratos.gov.br. |

---

## 4. IDENTIDADE CANÔNICA E PRINCÍPIO DE CONVERGÊNCIA

A identidade soberana única definida na M16 e ratificada na M17 é:
$$\mathbf{canonical\_key} = \text{uasg\_emitente} - \text{ano\_exercicio} - \text{numero\_normalizado}$$
Exemplo: `200331-2026-2026NE000142`.

### Regras Estritas de Convergência:
1. **Regra de Unicidade**: Independentemente de a Nota de Empenho ter sido descoberta na API do Compras.gov.br, no Contratos.gov.br, no PNCP ou digitada manualmente pelo operador, ela converge obrigatoriamente para a mesma e única `canonical_key`;
2. **Proibição de Identificadores Paralelos**: É terminantemente proibido criar chaves do tipo `comprasnet-12345`, `pncp-empenho-987` ou incorporar `item_id` / `contrato_id` à chave do empenho raiz;
3. **SSOT Único**: Há apenas um registro para cada Nota de Empenho em `public.empenhos`.

---

## 5. SEGREGAÇÃO ENTRE DESCOBERTA E ASSOCIAÇÃO

Uma das premissas mais críticas da arquitetura é a **não-confusão entre sincronizar um empenho e vinculá-lo**:

```text
                                 SINCRONIZADOR
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │   Descoberta do Empenho       │
                       │   (Upsert em public.empenhos) │
                       └───────────────┬───────────────┘
                                       │
                      Possui evidência determinística?
                                      ╱ ╲
                                    NÃO  SIM
                                    ╱     ╲
                                   ▼       ▼
               ┌──────────────────────┐   ┌───────────────────────────────┐
               │ Mantém apenas em     │   │ Dispara Associação Específica:│
               │ public.empenhos      │   │ - Item (public.arp_item_emp)  │
               │ (Fila de Associação) │   │ - Contrato (public.ctr_emp)   │
               └──────────────────────┘   └───────────────────────────────┘
```

- **Sincronização de Empenho**: Registra a existência jurídica e os valores orçamentários oficiais da Nota de Empenho em `public.empenhos`;
- **Associação ao Item da Ata**: Só ocorre quando há prova inequívoca de fornecimento contra o item (através do endpoint `/4_consultarEmpenhosSaldoItem` ou minuta SIAFI com `numero_item_compra`);
- **Associação ao Contrato**: Só ocorre quando há lastro contratual comprovado pela API de contratos ou número do contrato associado.

---

## 6. RECONCILIAÇÃO: MANUAL $\longrightarrow$ OFICIAL

A reconciliação implementada e testada na M17 governa o ciclo de vida do dado provisório:

```text
[Operador Cadastra Manualmente] ──► fonte_origem = 'MANUAL'
                                    informado_manualmente_inicialmente = TRUE
                                    valor_empenhado = R$ 50.000,00 (estimado)
                                            │
[Sincronizador Detecta no SIAFI] ──► save_empenho_soberano_atomic (Payload Oficial)
                                            │
                                            ▼
                                    fonte_origem = 'SINCRONIZADO'
                                    informado_manualmente_inicialmente = TRUE (PRESERVADO!)
                                    valor_empenhado = R$ 55.000,00 (Fato Oficial)
                                    valor_liquidado = R$ 10.000,00
                                    last_synced_at = NOW()
                                    Evento Histórico: 'AJUSTE_AUDITORIA' (Δ = +5.000,00)
```

### Regras de Proteção Contábil Homologadas:
- **Promoção Automática**: Dados oficiais confirmam e promovem a entrada manual provisória;
- **Preservação de Proveniência**: A flag `informado_manualmente_inicialmente = true` jamais é alterada para `false`;
- **Proteção contra Adulteração**: Se um empenho já estiver chancelado como oficial (`COMPRASNET`, `CONTRATOSNET`, `PNCP` ou `SINCRONIZADO`), qualquer chamada manual posterior é **impedida** de sobrescrever valores financeiros oficiais.

---

## 7. RECONCILIAÇÃO: OFICIAL $\longrightarrow$ OFICIAL (MATRIZ DE PRIORIDADE)

Quando múltiplas fontes governamentais trazem dados sobre o mesmo empenho (`canonical_key`), a resolução de divergências segue uma hierarquia objetiva baseada na autoridade do sistema emissor:

| Campo do Empenho | Fonte Prioritária (Nível 1) | Fonte Secundária (Nível 2) | Regra de Resolução de Conflito | Justificativa Arquitetural |
| :--- | :--- | :--- | :--- | :--- |
| **Identidade (`uasg`, `ano`, `num`)** | Unificada | Unificada | Estrita convergência por regex e normalização SIAFI. | A identidade orçamentária é invariante nacional. |
| **Data de Emissão** | Contratos.gov.br (SIAFI) | Compras.gov.br / PNCP | Data do registro da emissão no SIAFI prevalece sobre indexação do portal. | O Contratos.gov.br extrai a data contábil original do documento. |
| **Credor (Nome e CNPJ)** | Contratos.gov.br (SIAFI) | Compras.gov.br | Dados cadastrais do credor oficial no SIAFI. | O cadastro do SIAFI é validado diretamente na Receita Federal. |
| **Valor Empenhado Global** | Contratos.gov.br (SIAFI) | Compras.gov.br / PNCP | Valor emitido no SIAFI prevalece. Se Compras.gov.br diferir por deduções de cancelamento, adota-se o saldo ativo do SIAFI. | Contratos.gov.br espelha a conta contábil de empenho ativa. |
| **Valores de Execução (`liquidado`, `pago`, `rpinscrito`)** | Contratos.gov.br (SIAFI) | PNCP | Prevalência absoluta de Contratos.gov.br. Compras.gov.br Dados Abertos não rastreia fases de pagamento. | Apenas a API de contratos possui as trilhas de ordens bancárias e liquidação. |
| **Quantidade Física do Item da Ata** | Compras.gov.br (`/4_consultar...`) | Contratos.gov.br (`itens_minuta`) | Compras.gov.br Dados Abertos prevalece para débitos na Ata. Se ausente, usa a minuta do empenho no Contratos.gov.br. | Compras.gov.br é o sistema de gestão física da Ata de Registro de Preços. |

---

## 8. TAXONOMIA E MUTABILIDADE DOS CAMPOS

Os dados de empenhos são classificados em categorias com regras distintas de atualização:

```text
┌──────────────────────────┬─────────────────────────────────────┬──────────────────────────┐
│ Categoria                │ Campos                              │ Comportamento no Sync    │
├──────────────────────────┼─────────────────────────────────────┼──────────────────────────┤
│ 1. Identidade            │ canonical_key, uasg, ano, numero    │ IMUTÁVEL após criação    │
│ 2. Dados Cadastrais      │ credor_nome, credor_cnpj_cpf        │ Atualizável por fonte of.│
│ 3. Dados Orçamentários   │ valor_empenhado                     │ Atualizável (gera evento)│
│ 4. Dados de Execução     │ valor_liquidado, pago, rpinscrito   │ Atualizável por sync     │
│ 5. Proveniência          │ fonte_origem, inf_manualmente_inic  │ Auditável / Promovível   │
│ 6. Histórico Funcional   │ empenho_eventos_historico           │ APPEND-ONLY (Imutável)   │
└──────────────────────────┴─────────────────────────────────────┴──────────────────────────┘
```

---

## 9. HISTÓRICO FUNCIONAL vs AUDITORIA TÉCNICA

Segregação estrita entre:
- **Auditoria Técnica**: Capturada automaticamente pelo trigger `trg_audit_log_capture()` em `public.audit_logs` (registra quem disparou a sincronização, diff JSONB da linha e timestamp);
- **Histórico Funcional Contábil**: Registrado em `public.empenho_eventos_historico`.
  - **Regra Fundamental**: A mera consulta a uma API externa ou uma sincronização idempotente sem alteração de valores **NÃO GERA EVENTO NO HISTÓRICO**.
  - Um registro histórico só é criado quando há uma **mutação material de grandeza**:
    - Novo empenho criado (`EMISSAO_INICIAL`);
    - Alteração de valor oficial ou reconciliação (`REFORCO`, `ANULACAO_PARCIAL`, `AJUSTE_AUDITORIA`);
    - Vinculação ou alteração de quantidade em item (`EMISSAO_INICIAL`, `REFORCO`, `ANULACAO_PARCIAL`);
    - Desvinculação com estorno (`CANCELAMENTO_TOTAL`).

---

## 10. IDEMPOTÊNCIA DA SINCRONIZAÇÃO

A idempotência é garantida em todas as camadas:
1. **Chave Canônica Determínistica**: Múltiplas execuções do sincronizador na mesma hora ou em horários sucessivos (08:00, 09:00, 10:00) calculam a mesma `canonical_key`;
2. **Advisory Lock no PostgreSQL**: Evita race conditions entre sincronizações simultâneas de uma mesma Nota de Empenho;
3. **Cláusula `ON CONFLICT`**: Se os valores trazidos pela API forem idênticos aos já gravados em `public.empenhos`, o registro é mantido inalterado, atualizando apenas `last_synced_at` e `updated_at`, sem gerar novas linhas nem disparar eventos redundantes.

---

## 11. ESTRATÉGIA DE SINCRONIZAÇÃO INCREMENTAL

### Capacidades das APIs Governamentais Auditadas:
- **Compras.gov.br Dados Abertos**: Suporta paginação (`pagina`, `tamanhoPagina`), parâmetros `numeroAta` e `unidadeGerenciadora`. **Não suporta Webhooks nem ETag**.
- **PNCP**: Suporta filtros temporais por `dataInicial` e `dataFinal`, além de paginação por número de página e tamanho.
- **Contratos.gov.br**: Acesso direto por `contrato_id` ou por unidade gestora.

### Estratégia de Sync Proposta:
1. **Modo On-Demand (Gatilho de Interface)**: Sincronização disparada quando o gestor abre os detalhes de uma Ata ou Contrato (aproveitando os conectores do frontend, mas gravando os dados no banco soberano via RPC M17);
2. **Modo Periódico em Lote (Background Polling)**:
   - Consulta apenas atas e contratos vigentes;
   - Janela temporal deslizante de verificação ($T - 7 \text{ dias}$ para contratos ativos);
   - Processamento em lotes paginados de até 500 registros.

---

## 12. RESILIÊNCIA E TRATAMENTO DE FALHAS DE REDE

1. **Isolamento de Falha**: A indisponibilidade de uma API externa (HTTP 500, 502, 503, timeout) **nunca apaga, degrada ou invalida dados já armazenados no banco**;
2. **Tratamento de Rate Limiting (HTTP 429)**: Implementação de *Exponential Backoff* com jitter e limite máximo de tentativas antes de abortar a rodada;
3. **Falhas Parciais**: Se a API falhar no meio da paginação, os registros já processados e confirmados permanecem salvos (atomicidade por registro/lote), e a falha é registrada nos metadados de sincronização;
4. **Offline Resilience**: Se todas as APIs falharem, o SaldoARP opera plenamente em modo leitura sobre o SSOT do Supabase.

---

## 13. TRATAMENTO DE PAYLOADS INVÁLIDOS

Se a API governamental retornar um registro inconsistente (ex: UASG incompleta, ano fora do intervalo 2000-2100, valor negativo ou campos obrigatórios nulos):
1. O sincronizador **rejeita** individualmente o registro anômalo com código de validação `22023`;
2. Registra o descarte em log estruturado de observabilidade;
3. **Não aborta** a sincronização dos demais registros sadios do lote;
4. Previne que a corrupção de dados da fonte contamine o banco soberano.

---

## 14. OBSOLESCÊNCIA, ANULAÇÕES E CANCELAMENTOS

- **Ausência de Registro $\neq$ Exclusão**: Se uma Nota de Empenho que aparecia na consulta deixar de constar no payload, o sincronizador **jamais deleta** a linha em `public.empenhos`. Ela permanece gravada com seu histórico intacto;
- **Cancelamento Explícito**: Somente quando a API governamental reportar expressamente status `'CANCELADO'`, `'ANULADO'` ou valor reduzido a zero, a RPC é acionada para atualizar a situação e registrar o evento de `CANCELAMENTO_TOTAL` no histórico funcional.

---

## 15. TRATAMENTO DO SALDO DA ATA E DELIMITAÇÃO ARQUITETURAL (GAP M17-01)

Na Fase 7.2-C, registrou-se o `GAP-M17-01`:
> "A tabela `public.itens_ata` é um cache L2 no backend. A fonte soberana da quantidade homologada reside na API Compras.gov.br e os débitos em `public.arp_item_empenhos`. Por isso, a M17 não impôs bloqueio rígido por saldo disponível em nível de banco."

### Delimitação Arquitetural da Disponibilidade da Ata:
1. **Hierarquia e Regra Canônica de Saldo**:
   - **Quantidade Homologada / Registrada**: Fornecida exclusivamente pela fonte oficial da Ata (Compras.gov.br) e representada/cacheada em `public.itens_ata`;
   - **Quantidade Consumida Oficial**: Obtida exclusivamente pela agregação dinâmica dos débitos físicos confirmados em `public.arp_item_empenhos`;
   - **Fórmula Inviolável de Saldo do Item da Ata**:
     $$\text{SaldoQuantitativoItem} = \text{QuantidadeHomologadaAta} - \sum \text{QuantidadeConsumidaEmpenhos}$$

2. **Separação Ontológica Estrita: Domínio de Ata versus Domínio de Contrato**:
   - **ATA DE REGISTRO DE PREÇOS**:
     - Controla a quantidade física homologada licitada e a disponibilidade do registro de preços;
     - Os eventos de domínio de Ata (Fase 6.5) são exclusivamente: `CELEBRACAO`, `PRORROGACAO`, `REAJUSTE`, `REPACTUACAO`, `REEQUILIBRIO`, `REMANEJAMENTO`, `APOSTILAMENTO`, `ENCERRAMENTO_ESCOPO` e `ENCERRAMENTO_VIGENCIA`;
     - O domínio de Ata **NÃO POSSUI** eventos de `ACRESCIMO` nem de `SUPRESSAO`;
     - O empenho **NÃO aumenta, NÃO diminui e NÃO altera** a quantidade homologada da Ata; o empenho apenas **consome** quantitativo físico via `public.arp_item_empenhos`.
   - **CONTRATO OFICIAL**:
     - Os aditivos de acréscimo e supressão previstos no Art. 125 da Lei 14.133/2021 pertencem **estrita e exclusivamente ao domínio contratual**;
     - Um aditivo contratual de acréscimo de até 25% altera o quantitativo ou valor do **Contrato**, e **JAMAIS expande a quantidade homologada da Ata**;
     - É terminantemente vedada qualquer regra que transforme acréscimo contratual em aumento da quantidade da Ata.

3. **Fonte Oficial da Quantidade Homologada e Prevenção de Falsos Bloqueios**:
   - A sincronização atualiza a representação/cache em `public.itens_ata` unicamente quando a fonte oficial da Ata (Compras.gov.br) publica retificação oficial do edital/resultado homologado;
   - O banco de dados mantém atomicidade e não-negatividade ($\text{quantidade\_consumida} \ge 0$), enquanto a verificação de esgotamento opera como camada de conformidade e alerta operacional (Farol SaldoARP), sem criar bloqueios falsos baseados em descompasso de indexação externa.

---

## 16. PRESERVAÇÃO DAS GRANDEZAS FÍSICO-QUANTITATIVAS

É mantida a separação ontológica estrita entre grandezas:
- **Quantidade Homologada**: Unidades físicas licitadas e adjudicadas no item da Ata;
- **Quantidade Empenhada**: Unidades físicas debitadas pelo empenho de fornecimento;
- **Valor Financeiro**: Montante em Reais (R$) emitido no SIAFI como crédito orçamentário.

A Ata de Registro de Preços não possui "saldo financeiro fungível". O saldo é apurado e controlado **item por item**, em grandezas físicas.

---

## 17. VÍNCULOS AUTOMÁTICOS: DETERMINÍSTICOS vs AMBÍGUOS

| Cenário de Associação | Evidência Disponível no Payload | Ação da Sincronização | Intervenção Humana |
| :--- | :--- | :--- | :--- |
| **Item da Ata (Determinístico)** | Payload da API `/4_consultarEmpenhosSaldoItem` traz explicitamente `numeroAta`, `unidadeGerenciadora` e `numeroItem`. | Invoca `link_empenho_to_item_atomic` automaticamente. | Nenhuma. 100% automatizado. |
| **Item da Ata (Via Minuta SIAFI)** | Minuta do Contratos.gov.br (`itens_minuta`) possui `numero_item_compra` compatível com o item da Ata. | Invoca `link_empenho_to_item_atomic` automaticamente. | Nenhuma. 100% automatizado. |
| **Contrato (Determinístico)** | Payload traz `numeroContrato` ou `contratoId` oficial correspondente à `contract_key`. | Invoca `link_empenho_to_contract_atomic` automaticamente. | Nenhuma. 100% automatizado. |
| **Associação Ambígua / Global** | Empenho emitido contra a UASG com descrição genérica, sem número de contrato nem número de item. | Salva a Nota em `public.empenhos`, mas **NÃO vincula** a nenhum item/contrato. | **Exige Validação**: Encaminhado para a Fila de Conciliação na UI do gestor. |

---

## 18. ARQUITETURA CONCEITUAL DA SINCRONIZAÇÃO (FUTURA M18)

```text
       FONTES EXTERNAS
   ┌───────────────────────┐
   │ Compras.gov.br (Dados)│
   │ Contratos.gov.br      │
   │ PNCP                  │
   └───────────┬───────────┘
               │ HTTP Fetch
               ▼
   ┌───────────────────────┐
   │ Adapters / Connectors │  (Extração e higienização)
   └───────────┬───────────┘
               │
               ▼
   ┌───────────────────────┐
   │   Normalizer Engine   │  (Geração de canonical_key)
   └───────────┬───────────┘
               │
               ▼
   ┌───────────────────────┐
   │ Reconciliation Rules  │  (Aplicação da matriz de fontes)
   └───────────┬───────────┘
               │
               ▼
   ┌───────────────────────────────────────────────────────────┐
   │              RPCs TRANSACIONAIS DA M17                     │
   │ - save_empenho_soberano_atomic                            │
   │ - link_empenho_to_item_atomic                             │
   │ - link_empenho_to_contract_atomic                         │
   └───────────┬───────────────────────────────────────────────┘
               │
               ▼
   ┌───────────────────────────────────────────────────────────┐
   │               BANCO SOBERANO SUPABASE (M16)               │
   │ public.empenhos                                           │
   │ public.arp_item_empenhos                                  │
   │ public.contrato_empenhos                                  │
   │ public.empenho_eventos_historico                          │
   └───────────┬───────────────────────────────────────────────┘
               │
               ▼
   ┌───────────────────────────────────────────────────────────┐
   │           VIEWS ANALÍTICAS E READ MODELS (M18)            │
   │ - v_empenhos_resumo                                       │
   │ - v_arp_item_saldo_detalhado                              │
   │ - v_contrato_empenhos_lastro                              │
   │ - v_empenho_serie_temporal                                │
   └───────────┬───────────────────────────────────────────────┘
               │
               ▼
   ┌───────────────────────────────────────────────────────────┐
   │              FRONTEND / DASHBOARDS SALDOARP               │
   └───────────────────────────────────────────────────────────┘
```

---

## 19. PROIBIÇÃO DE ENTIDADES PARALELAS E STAGING PERMANENTE

- **Invariante P1**: Não serão criadas tabelas redundantes do tipo `empenhos_sync`, `empenhos_comprasnet` ou `empenhos_pncp`;
- O banco de dados do SaldoARP manterá **um único catálogo soberano** em `public.empenhos`;
- Caso seja necessário um buffer temporário de processamento em lote para requisições de grande porte, ele será modelado como tabela temporária de sessão (`CREATE TEMP TABLE ... ON COMMIT DROP`) ou objeto JSONB transitório em memória.

---

## 20. OBSERVABILIDADE E MÉTRICAS DE SINCRONIZAÇÃO

A futura camada de sincronização registrará métricas padronizadas:
- `ultimo_sync_em`: Timestamp da última execução;
- `ultimo_sync_sucesso_em`: Timestamp do último ciclo concluído sem erros;
- `total_empenhos_processados`: Contagem de registros analisados;
- `novos_empenhos_criados`: Empenhos inseridos pela primeira vez;
- `empenhos_reconciliados`: Empenhos manuais promovidos ou dados atualizados;
- `vínculos_itens_estabelecidos`: Cotas associadas a itens da Ata;
- `vínculos_contratos_estabelecidos`: Lastros associados a contratos;
- `registros_rejeitados`: Contagem de payloads defeituosos ignorados com erro `22023`;
- `tempo_execucao_ms`: Duração do ciclo de sync.

---

## 21. FREQUÊNCIA DE SINCRONIZAÇÃO

A frequência deve respeitar a dinâmica orçamentária do Governo Federal:
1. **Dias Úteis em Horário Comercial (08h às 19h)**:
   - Maior volatilidade (emissões de empenhos no SIAFI pelos ministérios e órgãos);
   - Sincronização On-Demand no carregamento da Ata/Contrato com debounce mínimo de 15 minutos;
2. **Rotina Periódica Noturna (Batch Sync)**:
   - Execução programada fora do horário de pico (ex: 02:00);
   - Varredura de confirmação de saldos em todas as atas ativas com menor sobrecarga nos servidores federais.

---

## 22. TESTES PLANEJADOS PARA A FUTURA IMPLEMENTAÇÃO

Quando a M18 for implementada, os seguintes cenários serão homologados:

1. **Testes de Identidade e Normalização**:
   - Geração correta de `canonical_key` para formatos variados de número SIAFI (`2026NE123`, `2026NE000123`, `123`);
   - Deduplicação determinística.
2. **Testes de Reconciliação Multi-Fonte**:
   - Mesmo empenho vindo do Compras.gov.br e do Contratos.gov.br com campos complementares;
   - Promoção de empenho manual com preservação da data de criação original.
3. **Testes de Resiliência de Rede**:
   - Simulação de timeout na API externa;
   - Simulação de HTTP 429 com retry exponencial;
   - Verificação de que dados do banco não são apagados em falhas de API.
4. **Testes de Vínculos**:
   - Vínculo automático de item com dados determinísticos;
   - Envio de empenho genérico para fila de aprovação humana sem vinculação indevida.
5. **Testes de Views Analíticas M18**:
   - Conferência de integridade das agregações de saldo e execução orçamentária.

---

## 23. PROPOSTA CONCEITUAL DA MIGRATION 18

A futura **Migration 18** (`20260924000018_empenho_sync_and_views.sql`) deverá conter exclusivamente:

1. **View `public.v_empenhos_resumo`**:
   - Visão consolidada unindo dados cadastrais de `public.empenhos` com o somatório de quantidades debitadas em itens e valores vinculados a contratos;
2. **View `public.v_arp_item_saldo_detalhado`**:
   - Agregação soberana do Item da Ata: `quantidade_homologada`, `total_empenhado_oficial`, `total_empenhado_manual`, `saldo_disponivel`, `percentual_consumido`;
3. **View `public.v_contrato_empenhos_lastro`**:
   - Agregação do lastro de contratos oficiais: `valor_contrato`, `total_empenhado_vinculado`, `saldo_a_empenhar`;
4. **View `public.v_empenho_serie_temporal`**:
   - Projeção temporal cronológica de débitos por mês/ano a partir de `public.empenho_eventos_historico` para abastecer os gráficos de Burn Rate e Farol;
5. **Índices de Cobertura Adicionais**: Otimizações para agregação de relatórios.

> **Importante**: Não é necessária nenhuma alteração no schema das tabelas criadas na M16 nem nas RPCs da M17.

---

## 24. RISCOS MAPEADOS E GAPs REGISTRADOS

| Risco / GAP | Impacto | Estratégia de Mitigação |
| :--- | :--- | :--- |
| **GAP-7.2D-01 (Acesso Direto ao SIAFI)** | Médio | Como o acesso direto ao HOD/Serpro exige certificado e-CNPJ dedicado, o SaldoARP utilizará com segurança a API do Contratos.gov.br como espelho contábil fiel do SIAFI. |
| **GAP-7.2D-02 (Ausência de Webhooks Federais)** | Baixo | APIs federais não possuem push notifications; adoção de polling com debounce e verificação temporal controlada. |
| **Risco de Falso Bloqueio por Cota** | Alto | O saldo é calculado dinamicamente no SSOT; a validação de extrapolação sinaliza alertas de conformidade sem travar operações válidas. |
| **Risco de Sobrescrita de Dados Oficiais** | Crítico | Mitigado na M17 pela guarda contábil que rejeita mutações manuais em dados já chancelados por fontes oficiais. |

---

## 25. VEREDITO FINAL DA FASE 7.2-D

### **FASE 7.2-D — VEREDITO: GO 🟢 (PLANEJAMENTO HOMOLOGADO)**

- O mapeamento de todas as fontes governamentais (Compras.gov.br, Contratos.gov.br, PNCP, SIAFI) foi concluído;
- O princípio de convergência para a identidade canônica soberana (`canonical_key`) está assegurado;
- A segregação ontológica entre quantidade física (Ata) e valor financeiro (Contrato) está estritamente respeitada;
- O GAP de saldo da Ata foi arquiteturalmente delimitado: o SaldoARP preservará a separação entre a quantidade oficial/homologada da Ata, o consumo físico por empenhos e os efeitos quantitativos próprios dos contratos, sem criar um saldo financeiro fungível ou um segundo SSOT;
- As regras de reconciliação e proteção de proveniência estão formalizadas;
- A estratégia de resiliência e tratamento de falhas está estruturada;
- O desenho conceitual da **Migration 18 (Views Analíticas e Read Models)** está pronto sem requerer modificações no schema da M16 nem nas RPCs da M17;
- **Zero código funcional ou modificação de banco de dados foi realizado nesta fase**.

---

## 26. RETIFICAÇÃO ARQUITETURAL — 7.2-D-R1

Em atenção à revisão arquitetural do modelo quantitativo do SaldoARP, registra-se a retificação formal de alinhamento:

### 1. Inconsistência Encontrada
A redação inicial do relatório 7.2-D mencionava a incorporação de aditivos de acréscimo (+25%) do Art. 125 da Lei 14.133/2021 sobre a `quantidade_homologada` da Ata em `public.itens_ata`.

### 2. Regra Anterior (Incorreta)
Equiparação indevida entre aditivo de acréscimo contratual (Art. 125) e alteração quantitativa da Ata, sugerindo que contratos decorrentes poderiam expandir o saldo homologado da Ata de Registro de Preços.

### 3. Regra Corrigida e Homologada (7.2-D-R1)
1. **Domínio de Ata**: Possui estritamente a quantidade homologada original e os eventos auditados na Fase 6.5 (`CELEBRACAO`, `PRORROGACAO`, `REAJUSTE`, `REPACTUACAO`, `REEQUILIBRIO`, `REMANEJAMENTO`, `APOSTILAMENTO`, `ENCERRAMENTO_ESCOPO`, `ENCERRAMENTO_VIGENCIA`). Não possui `ACRESCIMO` nem `SUPRESSAO`.
2. **Consumo por Empenhos**: O empenho consome quantidade física via `public.arp_item_empenhos`. O empenho não altera a quantidade homologada da Ata.
3. **Domínio de Contrato**: Acréscimos e supressões (Art. 125 da Lei 14.133/2021) aplicam-se exclusivamente ao instrumento contratual individual, sem retroagir ou ampliar o quantitativo registrado na Ata.
4. **Delimitação do GAP de Saldo da Ata**: O GAP foi delimitado: a Ata mantém seu saldo soberano ($\text{QtdHomologada} - \sum \text{QtdConsumida}$), isolado dos aditivos contratuais e sem criação de saldo financeiro fungível ou segundo SSOT.

### 4. Impacto
- Nenhuma alteração nas tabelas da M16 (`empenhos`, `arp_item_empenhos`, `contrato_empenhos`, `empenho_eventos_historico`);
- Nenhuma alteração nas RPCs da M17 (`save_empenho_soberano_atomic`, `link_empenho_to_item_atomic`, `unlink_empenho_from_item_atomic`, `link_empenho_to_contract_atomic`, `unlink_empenho_from_contract_atomic`);
- Nenhuma alteração no código de produção;
- Alinhamento pleno com a modelagem pura da Fase 6.5 e com a Lei 14.133/2021.

### 5. Confirmações Finais
- **Alterações de Banco de Dados**: ZERO.
- **Alterações de Código Funcional**: ZERO.
- **Resultado dos Testes de Regressão**: 71 arquivos / 628 testes PASS (100%), TypeScript 0 erros, ESLint 0 erros, Build PASS.

### 6. Veredito Retificado
> **FASE 7.2-D-R1 — VEREDITO FORMAL: GO 🟢**

> O planejamento técnico está corrigido, revalidado e homologado. Nenhuma implementação da **Fase 7.2-E (Implementação da Migration 18)** será iniciada sem a sua expressa autorização.
