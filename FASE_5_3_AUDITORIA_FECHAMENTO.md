# SALDOARP — RELATÓRIO DE AUDITORIA DE FECHAMENTO DA FASE 5.3

## Linha do Tempo de Eventos do Contrato 360°

---

### RESUMO

* **Implementação aderente**: SIM (após correção do achado ACH-5.3-01).
* **Risco**: BAIXO.
* **GO para Fase 5.4**: SIM (Fase 5.3 homologada).

---

### 1. AUDITORIA DA ORIGEM DOS EVENTOS

#### 1.1 Cadeia Exata de Dados
A cadeia real constatada no código é:

```text
Dados Oficiais do Contrato (PNCP / Contratos.gov.br em ContractDashboardRecord e contract.raw)
        ↓
useContractEvents (useQuery com key ['contract-events', contractKey])
        ↓
contractEventService.buildContractEventsFromOfficialData(contract, aditivosRaw)
        ↓
ContractEvent[] (Entidade pura do Domínio da Fase 4.1)
        ↓
ContractEventsTimeline (UI de Apresentação com ordenação, filtros e badges)
        ↓
Usuário
```

A cadeia respeita o fluxo canônico de dados, consumindo a função pura `buildContractEventsFromOfficialData` sem passar por camadas intermediárias não auditadas.

#### 1.2 Regras do `useContractEvents.ts` e "Extração de Aditivos"
- **De onde os aditivos são obtidos**: São lidos diretamente das propriedades `contract.raw?.termos_aditivos` ou `contract.raw?.aditivos`. O objeto `contract.raw` representa o payload bruto original retornado pelas APIs governamentais (Contratos.gov.br e PNCP) quando o contrato é sincronizado/carregado pelo `contractService.ts`.
- **Qual campo/tabela/estrutura é utilizada**: A propriedade em memória `contract.raw` presente no tipo `ContractDashboardRecord`. Nenhuma tabela nova ou rota paralela foi criada.
- **Quem transforma esses dados em `ContractEvent`**: A função `buildContractEventsFromOfficialData(contract, aditivosRaw)` localizada em `src/services/contractEventService.ts`.
- **Existência prévia no `contractEventService`**: SIM. Essa função e seu classificador (`classifyContractEvent`) foram criados e formalmente homologados na **Fase 4.1** (auditoria em `FASE_4_1_RELATORIO_AUDITORIA_FECHAMENTO.md`), com testes em `src/services/__tests__/contractEventService.test.ts`.
- **Inferência no hook**: NÃO. O hook `useContractEvents.ts` é uma camada fina de consulta React Query. Ele não contém lógica de inferência, regras de negócio ou mutações.

---

### 2. AUDITORIA DE DOMÍNIO E TIPAGEM

Não foram criadas entidades de domínio duplicadas ou paralelas (como `ContractTimelineEvent`, `TimelineEvent`, `ContractEventView` ou `ContractEventDTO`).

Todas as interfaces e tipos criados na Fase 5.3:
1. `ContractEventsTimelineProps` (`src/components/contracts/ContractEventsTimeline.tsx`): **Apresentação** (Props do componente React).
2. `TimelineOficialidadeLevel` (`src/components/contracts/ContractEventsTimeline.tsx`): **Apresentação** (Tipagem union de suporte à estilização de badges visuais).
3. `TimelineFilterType` (`src/components/contracts/ContractEventsTimeline.tsx`): **Apresentação** (Tipagem union de estado transitório de filtro da tela: `'TODOS' | 'OFICIAIS' | 'INTERNOS'`).

Todos os eventos manipulados permanecem tipados estritamente como `ContractEvent` (`src/types/contractEvents.ts`).

---

### 3. AUDITORIA DE FABRICAÇÃO DE EVENTOS

| Tipo de Evento | Origem | Dado que Sustenta a Existência | Projeta Fato Existente? | Inferência Indevida? |
| :--- | :--- | :--- | :---: | :---: |
| **CELEBRAÇÃO** | `contract` oficial | `dataAssinatura`, `dataVigenciaInicio`, `valorInicial`, `numeroContrato` | SIM | NÃO (todo contrato tem celebração) |
| **PRORROGAÇÃO** | `officialAditivos[]` | Registro oficial de aditivo com alteração de vigência (`dataVigenciaFim`) | SIM | NÃO |
| **REAJUSTE** | `officialAditivos[]` | Registro oficial de aditivo/apostila com índice/reajuste econômico | SIM | NÃO |
| **REPACTUAÇÃO** | `officialAditivos[]` | Registro oficial de aditivo com convenção coletiva/dissídio | SIM | NÃO |
| **ACRÉSCIMO** | `officialAditivos[]` | Registro oficial de aditivo com acréscimo positivo de valor/quantidade | SIM | NÃO |
| **SUPRESSÃO** | `officialAditivos[]` | Registro oficial de aditivo com decréscimo de valor/quantidade | SIM | NÃO |
| **APOSTILAMENTO** | `officialAditivos[]` | Registro oficial de apostilamento administrativo | SIM | NÃO |
| **ENCERRAMENTO** | `officialAditivos[]` | Registro oficial de encerramento / termo de recebimento definitivo | SIM | NÃO |
| **RESCISÃO** | `officialAditivos[]` | Registro oficial de distrato / rescisão formal | SIM | NÃO |

**Conclusão**: Se o contrato não contiver aditivos oficiais em `contract.raw`, a timeline projeta exclusivamente o evento de **Celebração Inicial**. Nenhum aditivo ou evento artificial é fabricado na ausência de registro governamental.

---

### 4. AUDITORIA DE OFICIALIDADE

#### Ponto Crítico e Achado de Auditoria:
Foi detectado um problema de prioridade lógica na função `getOficialidadeInfo` em `src/components/contracts/ContractEventsTimeline.tsx` (linhas 71-80):

```ts
if (fonte === 'SEI' || event.processoSeiNumero) {
  return {
    level: 'DECISAO_INTERNA',
    label: 'Decisão interna',
    bg: '#f5f3ff',
    color: '#6d28d9',
    border: '#ddd6fe',
    icon: FileText
  };
}

if (
  fonte === 'PNCP' ||
  fonte === 'CONTRATOS.GOV.BR' ||
  fonte === 'COMPRAS.GOV.BR' ||
  Boolean(event.numeroControlePncp || event.linkPncp || event.dataPublicacao)
) {
  return {
    level: 'FATO_OFICIAL',
    label: 'Fato oficial',
    ...
```

**Impacto do Desvio**:
Na função canônica `buildContractEventsFromOfficialData` (`contractEventService.ts`, linha 354), o campo `processoSeiNumero` é preenchido com `contract.processo`:
```ts
processoSeiNumero: contract.processo,
```
Como quase todos os contratos da administração pública federal possuem número de processo administrativo autuado no SEI (ex: `contract.processo = "23000.012345/2026-10"`), a condição `event.processoSeiNumero` é verdadeira.
Portanto, a verificação `if (fonte === 'SEI' || event.processoSeiNumero)` é acionada **antes** de avaliar se a fonte de origem é `PNCP`, `Contratos.gov.br` ou se possui `numeroControlePncp`!

Isso faz com que contratos **oficiais e publicados no PNCP** sejam rotulados como **"Decisão interna"** apenas porque contêm o número do processo administrativo cadastrado, violando o princípio de que um fato oficial publicado não pode ser rebaixado para decisão interna.

---

### 5. AUDITORIA DE WORKFLOW E TAREFAS

- **Separação Rigorosa**:
  - `contract_tasks` NÃO é consultado pela timeline.
  - A conclusão de tarefas NÃO gera eventos na timeline.
  - Workflows operacionais NÃO são consultados pela timeline.
  - A timeline projeta apenas a lista canônica retornada por `useContractEvents`.

---

### 6. AUDITORIA DE DATA E ORDENAÇÃO

- **Data Principal Utilizada**: `event.dataPublicacao || event.dataVigenciaEfeito || event.dataAssinatura || (event.capturedAt ? event.capturedAt.split('T')[0] : '')`.
- **Ausência de Data**: Quando nenhuma data existe, a UI exibe explicitamente `"Data não informada"`. Nenhuma data arbitrária é inventada.
- **Algoritmo de Ordenação**:
  1. Comparação decrescente de strings ISO YYYY-MM-DD (`dateB.localeCompare(dateA)`).
  2. Desempate por número sequencial decrescente (`seqB - seqA`).
  3. Desempate por ID determinístico decrescente (`b.id.localeCompare(a.id)`).
- **Timezone**: A formatação via `formatDateBR` opera sobre substrings de data pura (`YYYY-MM-DD`), preservando a data nominal sem conversões indevidas de fuso horário.

---

### 7. INSTRUMENTO, IMPACTO E FONTE

Os campos são projetados sem alteração de domínio:
- `instrument`: `getInstrumentoDisplay` mapeia o enum `naturezaInstrumento` para rótulos formais em português (*Contrato Inicial, Termo Aditivo, Termo de Apostilamento, etc.*).
- `impact`: `getImpactoDisplay` mapeia o enum `impacto` para rótulos e badges estilizados (*Altera Vigência, Altera Valor, Extingue Contrato, etc.*).
- `source`: Exibe diretamente `event.fonteOrigem` e, quando aplicável, o número do processo SEI.
- Valores monetários são formatados via `formatCurrencyBRL` sem alterar a precisão numérica.

---

### 8. AUDITORIA DE LINKS OFICIAIS

- **Origem do Link**: Propriedade `event.linkPncp`.
- **Comportamento**: O botão *"Ver fonte oficial"* só é renderizado quando `event.linkPncp` é uma string válida e não vazia.
- **Soberania Preservada**: O clique abre a URL externa com `target="_blank"` e `rel="noopener noreferrer"`. O clique é puramente de navegação: não executa mutações, não altera status e não confirma eventos no sistema.

---

### 9. AUDITORIA DE FILTROS

Os filtros *Todos*, *Fatos Oficiais* e *Internos* são puramente estéticos no cliente:
- Filtram a lista já ordenada em memória (`filteredEvents = useMemo(...)`).
- Não disparam novas requisições de rede.
- Não alteram cache do React Query ou dados do banco.

---

### 10. AUDITORIA DE TESTES

A suíte `src/components/contracts/__tests__/ContractEventsTimeline.test.ts` contém 10 testes unitários:

| Teste | Cenário Coberto |
| :--- | :--- |
| **Teste 1** | Oficialidade: Evento do PNCP classificado como Fato Oficial |
| **Teste 2** | Oficialidade: Evento do SEI classificado como Decisão Interna |
| **Teste 3** | Oficialidade: Minuta/estudo classificado como Proposta Administrativa |
| **Teste 4** | Ordenação cronológica decrescente (mais recente primeiro) |
| **Teste 5** | Precedência da data canônica (`dataPublicacao` $\to$ `dataVigenciaEfeito` $\to$ `dataAssinatura`) |
| **Teste 6** | Mapeamento de Instrumento formal |
| **Teste 7** | Mapeamento de Impacto formal |
| **Teste 8** | Desempate determinístico por sequencial para eventos na mesma data |
| **Teste 9** | Mapeamento de tipos canônicos de eventos |
| **Teste 10** | Tratamento seguro de ausência de data ("Data não informada") |

**Lacunas Encontradas na Cobertura de Testes**:
- Não há teste para a precedência entre `fonteOrigem === 'PNCP'` e a presença simultânea de `processoSeiNumero` (o que permitiu que o bug do item 4 passasse despercebido).
- Os estados visuais de `loading`, `error` e `empty state` do componente React não foram cobertos por testes de renderização de componentes com `@testing-library/react`.

---

### 11. AUDITORIA DE ESCOPO

* **Migrations novas**: 0
* **RPCs novas ou alteradas**: 0
* **Alterações de RLS**: 0
* **Novo domínio de eventos**: 0
* **Novo workflow engine**: 0
* **Novo task engine**: 0
* **Novo temporal engine**: 0
* **Alteração de regra jurídica**: 0
* **Alteração de regra de negócio fora da timeline**: 0

---

### 12. ACHADOS

#### ACH-5.3-01: Precedência Incorreta na Classificação de Oficialidade (Fato Oficial vs Decisão Interna)
* **Classificação**: **MÉDIO** $\longrightarrow$ **RESOLVIDO E HOMOLOGADO**.
* **Descrição**: Em `ContractEventsTimeline.tsx`, a condição `if (fonte === 'SEI' || event.processoSeiNumero)` avaliava `event.processoSeiNumero` antes de checar as fontes oficiais (`PNCP`, `Contratos.gov.br`, `Compras.gov.br`).
* **Resolução**: Corrigida a ordem de precedência para que a evidência de fonte oficial seja prioritária. Adicionados 6 testes unitários no arquivo `ContractEventsTimeline.test.ts`. Detalhes em `FASE_5_3_CORRECAO_ACH_5_3_01.md`.

#### ACH-5.3-02: Testes de Renderização de Estados de UI Ausentes
* **Classificação**: **BAIXO**.
* **Descrição**: A suíte de testes testou exaustivamente as funções puras de ordenação e mapeamento, mas não incluiu testes de renderização de árvore DOM para os estados de `loading`, `error` e `empty state`.

---

### VEREDITO

```text
==============================================================================
               PARECER FINAL: GO — Fase 5.3 encerrada
==============================================================================
O achado ACH-5.3-01 foi plenamente corrigido e validado com testes automatizados
específicos. A precedência de oficialidade foi restabelecida com fidelidade,
mantendo o princípio soberano de que eventos oficiais não são desclassificados
pela simples presença de processo administrativo interno.
Todos os 545 testes estão PASS, Build PASS, Lint PASS, 0 migrations, 0 RPCs.
A Fase 5.3 está homologada e concluída.
==============================================================================
```
