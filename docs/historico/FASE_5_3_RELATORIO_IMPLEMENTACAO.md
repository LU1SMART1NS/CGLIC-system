# SALDOARP — RELATÓRIO DE IMPLEMENTAÇÃO DA FASE 5.3

## Linha do Tempo de Eventos do Contrato 360°

---

### 1. Resumo Executivo da Fase 5.3

A **Fase 5.3** entregou a funcionalidade completa da **Linha do Tempo Contratual** dentro da experiência do **Contrato 360°** (`/contratos/:contractKey`), respondendo à pergunta fundamental do usuário:

> **"O que aconteceu com este contrato ao longo do tempo?"**

A implementação operou estritamente como uma **projeção visual de leitura do histórico canônico**, sem criar novos domínios, sem criar segundas fontes de eventos, sem inferir fatos ou oficialidades e sem realizar mutações no banco de dados.

```text
FONTE / DADO OFICIAL (PNCP / Contratos.gov.br / SEI)
                      ↓
          CONTRACT EVENT (Fase 4.1)
                      ↓
               useContractEvents
                      ↓
          ContractEventsTimeline (UI)
                      ↓
                   USUÁRIO
```

---

### 2. Fonte Canônica dos Eventos

- **Entidade Base**: `ContractEvent` definida no domínio puro (`src/types/contractEvents.ts`).
- **Construção Canônica**: `buildContractEventsFromOfficialData(contract, officialAditivos)` em `src/services/contractEventService.ts`.
- **Identidade e Idempotência**: Chave única determinística via `generateIdempotentEventId`.
- **Hook Canônico**: `useContractEvents(contract)` (`src/hooks/useContractEvents.ts`) com Query Key `['contract-events', contractKey]`.

---

### 3. Componentes Criados e Atualizados

1. **`src/components/contracts/ContractEventsTimeline.tsx` (NOVO)**:
   - Visualização vertical conectada em timeline cronológica decrescente (mais recente $\to$ mais antigo).
   - Distinção visual e textual explícita de **Oficialidade**:
     - `FATO_OFICIAL`: *"Fato oficial"* (azul com ícone `CheckCircle2`).
     - `DECISAO_INTERNA`: *"Decisão interna"* (roxo com ícone `FileText`).
     - `PROPOSTA_ADMINISTRATIVA`: *"Proposta administrativa"* (âmbar com ícone `FileQuestion`).
     - `DADO_INTERNO`: *"Registro interno"* (cinza com ícone `Building2`).
   - Apresentação estruturada por evento:
     - Data canônica formatada (`formatDateBR`);
     - Tipo de evento (Celebração, Prorrogação, Reajuste, Repactuação, Acréscimo, Supressão, Apostilamento, Encerramento, Rescisão);
     - Instrumento formal (Contrato Inicial, Termo Aditivo, Termo de Apostilamento, Termo de Recebimento Definitivo, etc.);
     - Impacto formal (Altera Vigência, Altera Valor, Altera Quantitativo, Atualiza Dados, Extingue Contrato);
     - Variação formal de valor (`formatCurrencyBRL`) e nova vigência quando aplicável;
     - Fonte da informação (PNCP, Contratos.gov.br, Compras.gov.br, SEI, etc.);
     - Link para fonte oficial (`linkPncp`) com abertura externa segura (`target="_blank"`), exibido **apenas quando existente**.
   - Filtros simples e eficientes no topo: *Todos*, *Fatos Oficiais*, *Internos*.
   - Tratamento de estados:
     - **Loading**: Spinner e mensagem indicativa;
     - **Error**: Card amigável com mensagem de instabilidade;
     - **Empty**: *"Ainda não há eventos contratuais registrados."*.

2. **`src/hooks/useContractEvents.ts` (NOVO)**:
   - Hook React Query encapsulando a extração de aditivos oficiais e construção determinística de eventos.

3. **`src/components/contracts/Contract360Page.tsx` (ATUALIZADO)**:
   - Substituição do placeholder do Bloco 4 pela `<ContractEventsTimeline contract={contract} />`.

4. **`src/components/contracts/__tests__/ContractEventsTimeline.test.ts` (NOVO)**:
   - 10 testes cobrindo classificação de oficialidade, ordenação cronológica decrescente, desempate por sequencial, mapeamento de tipos, instrumentos, impactos e ausência de data inventada.

---

### 4. Respeito Rigoroso às Invariantes Arquiteturais

| Invariante | Status | Constatação |
| :--- | :--- | :--- |
| **Somente Leitura** | **100%** | Zero mutations, zero formulários de criação/edição de eventos. |
| **Não Criar Novo Domínio** | **100%** | Utiliza exclusivamente `ContractEvent` da Fase 4.1. |
| **Não Inferir Oficialidade** | **100%** | Baseia-se unicamente nas fontes e metadados formais do evento. |
| **Interno $\neq$ Oficial** | **100%** | Distinção visual e textual explícita nos cards e badges. |
| **Não Inventar Datas/Mocks** | **100%** | Exibe "Data não informada" quando não houver data formal; zero mocks de produção. |
| **Evento $\neq$ Task** | **100%** | A timeline não inclui logs transitórios de tarefas de workflows. |
| **Isolamento de Banco** | **100%** | **0 migrations novas**, **0 RPCs novas/alteradas**, **RLS inalterado**. |

---

### 5. Verificação de Qualidade e Testes

```bash
npm test -- --run
npm run build
npm run lint
```

- **Vitest**: 61 arquivos de teste, **539/539 testes PASS** (100% verde).
- **TypeScript**: `tsc -b` executado com **0 erros**.
- **Build de Produção**: `vite build` executado com sucesso gerando bundle de produção limpo.
- **Linter**: `oxlint` executado com **0 erros**.
- **Banco / Git**: 0 migrations novas, RLS inalterado.

---

### 6. Próximo Passo

A Fase 5.3 está concluída e pronta para homologação. O sistema está preparado para avançar para a **Fase 5.4 — Painel de Workflows Contratuais** (Prorrogação, Alterações/Apostilamento, Encerramento/Rescisão).
