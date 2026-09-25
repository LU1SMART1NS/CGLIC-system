# FASE 7.0-A — AUDITORIA DE FECHAMENTO DO DOMÍNIO DE EMPENHOS

**Sistema**: SaldoARP — Gestão Avançada de Atas de Registro de Preços e Contratos  
**Data**: 23 de Setembro de 2026  
**Status**: CONCLUÍDA — GO HOMOLOGADO  
**Ambiente**: Supabase PostgreSQL 17.6 (`bouutpmxexvwppcmmhdi`)  
**Metodologia**: Auditoria Crítica de Domínio, Verificação de Hipóteses Arquiteturais e Triangulação com APIs Governamentais  

---

## 1. RN-07 — CONCLUSÃO E DESMITIFICAÇÃO

A auditoria da Fase 7.0 postulou que *"nenhum contrato formal subsiste sem vínculo a pelo menos um empenho"*. Esta afirmação foi submetida a um escrutínio rigoroso:

### 1.1 Achados da Investigação
1. **Origem da "RN-07"**:
   - A sigla `RN-07` não é um artigo de lei federal nem uma regra de integridade do PNCP ou Contratos.gov.br.
   - Trata-se de uma **regra negocial interna criada no SaldoARP (Fase 4 e Fase 6)** aplicada estritamente à RPC `save_manual_contrato_atomic` para inserção de contratos manuais de contingência (`contratos_manuais`), impedindo que um usuário criasse um contrato "fantasma" sem apontar o ID do empenho correspondente.
2. **Realidade das Fontes Oficiais**:
   - No Portal Nacional de Contratações Públicas (PNCP) e no Contratos.gov.br, **existem contratos oficiais publicados sem empenhos vinculados**.
   - O próprio componente `ContractCard.tsx` (L364-366) trata formalmente esse cenário:
     ```tsx
     {empenhos.length === 0 ? (
       <p>Nenhum empenho foi retornado pela API para este contrato.</p>
     ) : ...}
     ```
   - No modal oficial de vinculação da Fase 6.3 (`LinkContractModal.tsx`), homologado na Migration 15 (`arp_item_contract_links`), a vinculação de um contrato oficial ao item da Ata **não exige nem valida empenhos**.
3. **Causas da Ausência de Empenho em Contratos Oficiais**:
   - **Atraso de Integração / Publicação**: O termo de contrato costuma ser publicado no PNCP antes que os empenhos do exercício sejam integrados pelos sistemas legados de contabilidade (SIAFI);
   - **Início de Vigência Futura**: Contratos assinados para execução em exercício orçamentário seguinte nascem juridicamente antes da emissão da Nota de Empenho;
   - **Contratos sem Desembolso Imediato**: Contratos de receita, acordos de cooperação, termos de credenciamento ou atas de registro de preços propriamente ditas.

### 1.2 Conclusão
> [!IMPORTANT]
> **A REGRA RN-07 É ESTRITAMENTE OPERACIONAL E NEGOCIAL PARA DADOS MANUAIS.**  
> Ela **NÃO** deve ser convertida em constraint estrutural (`NOT NULL` ou Foreign Key obrigatória) no modelo relacional soberano. Contratos oficiais podem e devem ser representados no sistema mesmo antes da emissão ou sincronização de seus empenhos.

---

## 2. CONTRATO × EMPENHO

O relacionamento entre Contratos e Empenhos opera sob as seguintes regras na Administração Pública:

1. **Papel do Empenho no Contrato**: O empenho atua como **lastro orçamentário/financeiro** para suportar a obrigação jurídica firmada pelo contrato;
2. **Evolução Temporal do Lastro**:
   - Um contrato com vigência de múltiplos anos (ou prorrogável até 5 ou 10 anos sob a Lei 14.133/2021) recebe Notas de Empenho sucessivas a cada exercício financeiro (ex.: empenho de 2026, novo empenho de 2027, etc.);
   - Um contrato também pode ter múltiplos empenhos no mesmo exercício se derivar de diferentes fontes de recursos, planos internos ou naturezas de despesa;
3. **Independência de Ciclo de Vida**:
   - A extinção ou anulação de um empenho não rescinde automaticamente o contrato;
   - A rescisão de um contrato pode deixar saldos de empenho a anular.

---

## 3. ITEM × EMPENHO

A relação entre Item da Ata de Registro de Preços e a Nota de Empenho atende a três cenários fundamentais identificados na auditoria:

### Cenário A — Aquisição Contratualizada Derivada de Ata
```text
Ata de Registro de Preços
       ↓ (possui)
  Item da Ata
       ↓ (gera via arp_item_contract_links)
Contrato Oficial
       ↓ (possui como lastro financeiro)
    Empenho
```
- O Item da Ata dá origem ao Contrato Oficial;
- O Contrato Oficial possui os Empenhos emitidos no SIAFI;
- A quantidade do item associada ao contrato deduz o saldo daquele item na Ata.

### Cenário B — Aquisição Direta sem Termo de Contrato (Art. 95, Lei 14.133/2021)
```text
Ata de Registro de Preços
       ↓ (possui)
  Item da Ata
       ↓ (debita diretamente via Nota de Empenho substitutiva)
    Empenho
```
- Para compras de pronta entrega ou sem obrigações futuras, a legislação dispensa o termo solene de contrato;
- A Nota de Empenho atua como instrumento substitutivo (Art. 95) e debita **diretamente** o quantitativo do Item da Ata, sem a existência de nenhum contrato intermediário.

### Cenário C — Contrato Autônomo sem Ata de Registro de Preços
```text
Contrato Oficial (arpId = null)
       ↓ (possui lastro)
    Empenho
```
- Contratações diretas (dispensas e inexigibilidades) ou licitações tradicionais que não utilizam o Sistema de Registro de Preços;
- O contrato possui empenhos de lastro, mas **não há Item da Ata e nem Ata envolvida**.

> [!TIP]
> O modelo relacional da Fase 7.1 deve suportar com total naturalidade os **três cenários**, sem forçar vínculos nulos ou artificiais.

---

## 4. ATA × EMPENHO

- A Ata de Registro de Preços relaciona-se com o Empenho de forma **indireta e agregada**, intermediada por seus Itens:
  $$\text{Ata} \longrightarrow \text{Itens} \longrightarrow \text{Empenhos}$$
- Não existe uma relação direta de 1 empenho debitando a "Ata como um todo": toda Nota de Empenho emitida contra uma Ata especifica quais **itens** e quais **quantidades físicas** estão sendo adquiridas (através dos itens da minuta SIAFI).

---

## 5. CARDINALIDADE COMPROVADA

Comprovou-se empiricamente, com base nas APIs e nos schemas reais, a seguinte matriz de cardinalidades:

| Relacionamento | Cardinalidade Real | Evidência / Prova no Sistema |
|---|---|---|
| **Contrato $\leftrightarrow$ Empenho** | **N : N** | 1 Contrato possui múltiplos empenhos ao longo dos anos de vigência (`ContratosGovEmpenhoRecord[]`). 1 Empenho global pode atender termos ou contratos agregados. Tabela `contrato_empenho_links` possui constraint UNIQUE `(contrato_id, empenho_id)` operando como relação associativa N:N. |
| **Item da Ata $\leftrightarrow$ Empenho** | **N : N** | 1 Item recebe dezenas de empenhos durante a vigência da Ata. Por outro lado, 1 única Nota de Empenho federal pode comprar múltiplos itens de uma vez (conforme comprovado pela interface `EmpenhoItemMinuta[]` na rota `/consultar/{id}`). |
| **Ata $\leftrightarrow$ Empenho** | **1 : N (indireta)** | Uma Ata congrega múltiplos empenhos emitidos para seus diversos itens por diversas UASGs participantes e gerenciadora. |

---

## 6. QUANTIDADE × VALOR: SEPARAÇÃO RIGOROSA

A auditoria 7.0-A identificou que a documentação anterior misturava, em alguns trechos, o saldo quantitativo e o valor financeiro. Estabelece-se a separação formal e irrevogável entre as duas dimensões:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      DIMENSÃO QUANTITATIVA (FÍSICA)                    │
├────────────────────────────────────────────────────────────────────────┤
│ • Domínio: Item da Ata de Registro de Preços                          │
│ • Unidade de Medida: Unidades físicas (resma, caixa, licença, hora)   │
│ • Fórmula Oficial Canônica:                                            │
│     SaldoQuantitativo = QuantidadeHomologadaItem - ∑ QuantidadeEmpenhada│
│ • Regime Legal: Art. 82 e 84 da Lei 14.133/2021 (Controle por Item)    │
│ • Natureza: Teto intransponível por item. Não intercambiável.          │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│                      DIMENSÃO FINANCEIRA (ORÇAMENTÁRIA)                │
├────────────────────────────────────────────────────────────────────────┤
│ • Domínio: Contratos Administrativos e Orçamento Federal (SIAFI)      │
│ • Unidade de Medida: Reais (R$)                                       │
│ • Variáveis Oficiais:                                                 │
│     ValorEmpenhado, ValorALiquidar, ValorLiquidado, ValorPago, RP      │
│ • Regime Legal: Lei 4.320/1964 e LC 101/2000 (Execução da Despesa)     │
│ • Natureza: Fluxo financeiro orçamentário.                             │
└────────────────────────────────────────────────────────────────────────┘
```

> [!WARNING]
> **NÃO EXISTE SALDO FINANCEIRO GLOBAL INTERCAMBIÁVEL DA ATA NO MODELO OFICIAL.**  
> Uma Ata de R$ 10.000.000,00 dividida em 10 itens não permite comprar R$ 2.000.000,00 do Item 1 sacrificando o Item 2. A métrica "Valor Financeiro Disponível" presente em dashboards é uma **grandeza estimada derivada** ($S_{\text{quantitativo}} \times V_{\text{unitário}}$), e nunca um saldo financeiro livre.

---

## 7. CHAVE CANÔNICA DO EMPENHO

A auditoria reavaliou a proposta de chave única para a futura tabela `public.empenhos`:

### 7.1 Regra de Unicidade Federal do SIAFI
No governo federal, uma Nota de Empenho é identificada unicamente pela tripla:
$$\text{UASG Emitente} + \text{Ano do Exercício} + \text{Número da NE}$$
- O padrão da Nota de Empenho já incorpora o ano: `AAAANEnnnnnn` (ex: `2026NE000142`);
- Dois órgãos diferentes (ex: UASG 200331 e UASG 153000) podem emitir a nota `2026NE000142` no mesmo ano;
- Portanto, a chave universal deve contemplar a UASG emitente.

### 7.2 Tratamento de Variações Sintáticas
As APIs do governo retornam formatos heterogêneos para a mesma nota:
- API Compras.gov: `"000142"` ou `"142"`;
- API Contratos.gov: `"2026NE000142"`;
- Normalizador do SaldoARP: `normalizeEmpenhoNumero("2026NE000142")` $\rightarrow$ `"2026NE142"`.

### 7.3 Chave Canônica Recomendada para a Fase 7.1
$$\text{CanonicalId} = \text{uasg} \text{ + '-' + } \text{ano} \text{ + '-' + } \text{numeroNormalizado}$$
*(Exemplo: `200331-2026-2026NE142`)*.
- **Justificativa**: Imune a discrepâncias de zeros à esquerda, garantida contra colisão entre UASGs distintas e estável perante todas as APIs federais.
- **Reforços e Anulações**: No SIAFI, reforços e anulações afetam o valor da *mesma* Nota de Empenho mãe. Portanto, a chave acima identifica com perfeição a entidade orçamentária soberana.

---

## 8. HISTÓRICO: O QUE É REALMENTE OBSERVÁVEL HOJE

Para evitar promessas que as APIs não cumprem, delimitou-se estritamente o que é observável nas fontes atuais:

| Dado / Evento | Compras.gov.br (ARP) | Contratos.gov.br | PNCP | Observável em Tempo Real? |
|---|---|---|---|---|
| **Data de Emissão do Empenho** | SIM (`dataEmpenho`) | SIM (`data_emissao`) | SIM (`dataEmissaoEmpenho`) | **SIM** (Fonte Primária) |
| **Quantidade Física Inicial** | SIM (`quantidadeIncluida`) | NÃO (Requer minuta SIAFI) | NÃO | **SIM** |
| **Reforço de Quantidade** | SIM (`reforco`) | NÃO | NÃO | **SIM** |
| **Anulação de Quantidade** | SIM (`anulacao`) | NÃO | NÃO | **SIM** |
| **Valor Empenhado Acumulado** | SIM (`valorEmpenhado`) | SIM (`empenhado`) | SIM (`valorTotal`) | **SIM** |
| **Valor Liquidado Acumulado** | NÃO | SIM (`liquidado`) | NÃO | **SIM** (Apenas acumulado) |
| **Valor Pago Acumulado** | NÃO | SIM (`pago`) | NÃO | **SIM** (Apenas acumulado) |
| **Restos a Pagar (RP)** | NÃO | SIM (`rpinscrito`) | NÃO | **SIM** |
| **Extrato Diário de Pagamentos (OBs)** | NÃO | NÃO (Exige Comprasnet Contratos v2) | NÃO | **NÃO** |
| **Histórico de Alterações de Saldo** | NÃO | NÃO | NÃO | **NÃO** (Exige snapshot do SaldoARP) |

---

## 9. SÉRIE TEMPORAL: O QUE É REALMENTE CALCULÁVEL

Com base no inventário de dados observáveis:

### 1. O que é 100% calculável retroativamente e imediatamente:
- **Curva Histórica de Consumo do Item da Ata**:
  Como possuímos as datas de emissão de cada Nota de Empenho (`dataEmpenho`) e as quantidades debitadas (`quantidadeEmpenhada`), é possível reconstruir perfeitamente o gráfico diário/mensal de consumo físico do item desde o primeiro dia de vigência da Ata:
  $$S(t) = Q_{\text{homologada}} - \sum_{t_{\text{emissao}} \le t} Q_{\text{empenho}}$$

### 2. O que NÃO é calculável retroativamente (mas será prospectivamente):
- **Curva Diária de Liquidação e Pagamento**:
  Como as APIs fornecem apenas o saldo acumulado de liquidação no momento da chamada, a série temporal contínua da execução financeira não pode ser inferida para o passado.
- **Solução Arquitetural**: O SaldoARP criará uma tabela de **snapshots periódicos de sincronização**, que passará a registrar a linha do tempo prospectiva a partir da entrada da Fase 7.2.

---

## 10. SSOT: DEFINIÇÃO DE PAPÉIS DA ARQUITETURA FUTURA

Para garantir pureza relacional e eliminar duplicações, a arquitetura futura é subdividida em 3 camadas ontologicamente isoladas:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ CAMADA 1: ENTIDADE PURA DO EMPENHO (public.empenhos)                   │
├────────────────────────────────────────────────────────────────────────┤
│ Representa unicamente a Nota de Empenho Federal Oficial.               │
│ Não sabe de Ata, não calcula saldo de Item, não armazena burn rate.    │
│ Atributos: id, uasg, numero, ano, credor, data_emissao,                │
│            valor_empenhado, valor_liquidado, valor_pago, status.       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
┌─────────────────────────────────────────┐   ┌────────────────────────────────────────┐
│ CAMADA 2A: RELACIONAMENTO COM ATA       │   │ CAMADA 2B: RELACIONAMENTO COM CONTRATO │
│ (public.arp_item_empenhos)              │   │ (public.contrato_empenhos)             │
├─────────────────────────────────────────┤   ├────────────────────────────────────────┤
│ Vincula o Empenho ao Item da Ata.       │   │ Vincula o Empenho ao Contrato Oficial. │
│ Atributos: item_key, empenho_id,        │   │ Atributos: contract_key, empenho_id,   │
│            quantidade_consumida,        │   │            valor_vinculado,            │
│            origem_consumo.              │   │            data_vinculo.               │
└─────────────────────────────────────────┘   └────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ CAMADA 3: SÉRIE TEMPORAL E EVENTOS (public.empenho_eventos_historico)  │
├────────────────────────────────────────────────────────────────────────┤
│ Armazena a linha do tempo cronológica de eventos de consumo e snapshots│
│ periódicos para alimentar o Farol e cálculos de Burn Rate.             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 11. ARQUITETURA RECOMENDADA PARA A FASE 7.1

A Fase 7.1 deve implementar exclusivamente a modelagem relacional de sustentação:

1. **Tabela `public.empenhos`**:
   - `id VARCHAR(100) PRIMARY KEY`: chave canônica `${uasg}-${ano}-${numeroNormalizado}`;
   - `numero VARCHAR(50) NOT NULL`: número legível;
   - `ano INTEGER NOT NULL`: ano do exercício;
   - `uasg VARCHAR(10) NOT NULL`: código da UASG emitente;
   - `credor_nome VARCHAR(255)`, `credor_cnpj VARCHAR(20)`;
   - `data_emissao DATE NOT NULL`;
   - `valor_empenhado NUMERIC(18, 4) NOT NULL DEFAULT 0`;
   - `valor_liquidado NUMERIC(18, 4) NOT NULL DEFAULT 0`;
   - `valor_pago NUMERIC(18, 4) NOT NULL DEFAULT 0`;
   - `valor_rpinscrito NUMERIC(18, 4) NOT NULL DEFAULT 0`;
   - `fonte_origem VARCHAR(20) NOT NULL` (`'COMPRASNET'`, `'CONTRATOSNET'`, `'PNCP'`, `'MANUAL'`).
2. **Tabela de Vínculo `public.arp_item_empenhos`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`;
   - `item_key VARCHAR(100) NOT NULL`;
   - `empenho_id VARCHAR(100) NOT NULL REFERENCES public.empenhos(id) ON DELETE CASCADE`;
   - `quantidade_consumida NUMERIC(18, 4) NOT NULL CHECK (quantidade_consumida >= 0)`;
   - `valor_imputado NUMERIC(18, 4)`;
   - `CONSTRAINT uq_item_empenho UNIQUE (item_key, empenho_id)`.
3. **Tabela de Vínculo `public.contrato_empenhos_v2`**:
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`;
   - `contract_key VARCHAR(100) NOT NULL`;
   - `empenho_id VARCHAR(100) NOT NULL REFERENCES public.empenhos(id) ON DELETE CASCADE`;
   - `valor_vinculado NUMERIC(18, 4)`;
   - `CONSTRAINT uq_contract_empenho UNIQUE (contract_key, empenho_id)`.

---

## 12. GAPS IDENTIFICADOS

1. **GAP-7.0A-01**: A API do Contratos.gov.br não fornece a quebra de quantidade física no endpoint mestre de empenhos (`/empenhos`). Ela exige chamadas complementares por ID (`/consultar/{id}`) que sofrem com gargalos de rate-limit.
2. **GAP-7.0A-02**: Não há endpoint público para consultar ordens bancárias individuais no Comprasnet Contratos Dados Abertos (apenas o acumulado de `pago`).
3. **GAP-7.0A-03**: Os dados manuais legados (`empenhos_manuais`) possuem chaves compostas geradas de forma distinta do padrão canônico unificado.

---

## 13. RISCOS E MITIGAÇÕES

| Risco Identificado | Impacto | Mitigação Arquitetural |
|---|---|---|
| **Risco 1: Quebra de contratos legítimos sem empenho** | Alto | Não transformar o vínculo Contrato $\leftrightarrow$ Empenho em foreign key obrigatória (`NOT NULL`). Manter contratos operacionais mesmo com empenhos nulos ou pendentes. |
| **Risco 2: Dupla contagem contábil de quantidade** | Crítico | Manter a constraint UNIQUE `(item_key, empenho_id)` em `arp_item_empenhos` e preservar o algoritmo `matchAndMergeEmpenhos`. |
| **Risco 3: Confusão de saldo financeiro com saldo de item** | Alto | Proibir terminantemente qualquer fórmula que debite saldo financeiro global da Ata. O saldo é e sempre será puramente quantitativo por item. |

---

## 14. RETIFICAÇÕES DO RELATÓRIO 7.0

O relatório `FASE_7_0_AUDITORIA_GLOBAL_EMPENHOS.md` foi atualizado com a seção `21. RETIFICAÇÕES DA AUDITORIA 7.0-A`, retificando formalmente:
1. **Qualificação da Regra RN-07**: De "obrigação absoluta de contrato" para "regra negocial interna de integridade de contratos manuais legados";
2. **Correção do Conceito de Saldo da Ata**: Descarte da afirmação de "saldo financeiro global intercambiável da Ata", reafirmando que o controle legal é estritamente físico-quantitativo item a item;
3. **Reconhecimento dos 3 Cenários**: Suporte formal aos Cenários A (Ata $\rightarrow$ Item $\rightarrow$ Contrato $\rightarrow$ Empenho), B (Ata $\rightarrow$ Item $\rightarrow$ Empenho direto) e C (Contrato autônomo $\rightarrow$ Empenho sem Ata);
4. **Isolamento do SSOT do Empenho**: Garantia de que a tabela `public.empenhos` será puramente a representação da Nota de Empenho federal, mantendo consumos e vínculos em tabelas associativas dedicadas.

---

## 15. TESTES DE REGRESSÃO

A integridade operacional e sintática de toda a base de código foi comprovada:

```bash
npm test -- --run
# Test Files  70 passed (70)
# Tests       611 passed (611)

npx tsc --noEmit
# 0 erros (PASS)

npm run lint
# 0 erros (43 warnings benignos preexistentes)

npm run build
# vite v8.2.2 building client environment for production...
# ✓ built in 551ms (PASS)
```

Nenhum arquivo funcional de código ou banco foi alterado. Todos os 611 testes unitários permanecem 100% verdes.

---

## 16. VEREDITO FORMAL

### **FASE 7.0-A: GO (HOMOLOGADO)**

- Todas as premissas fortes do relatório 7.0 foram auditadas, qualificadas e retificadas;
- Quantidade física e valor financeiro estão rigorosamente separados;
- A chave canônica determinística do empenho está validada;
- Os 3 cenários operacionais (Contrato derivado de Ata, Aquisição direta sem contrato e Contrato sem Ata) foram contemplados;
- O SSOT futuro da Fase 7.1 está perfeitamente desenhado em 3 camadas;
- O sistema está formalmente habilitado para avançar ao planejamento e modelagem da **FASE 7.1**.
