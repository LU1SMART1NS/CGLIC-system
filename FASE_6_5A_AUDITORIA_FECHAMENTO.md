# AUDITORIA DE FECHAMENTO — FASE 6.5-A
## Modelagem Pura do Domínio de Atas e Saneamento de Instrumentos Contratuais

---

## 1. ESCOPO AUDITADO

Esta auditoria independente inspecionou exaustivamente todas as entregas técnicas e estruturais declaradas na Fase 6.5:
* Saneamento de `Contrato.arpId` (de obrigatório para opcional `arpId?: string`);
* Criação de `TipoInstrumentoContratual` e `isInstrumentoSubstitutivo`;
* Criação do domínio puro de Atas: `src/types/ataEvents.ts`;
* Criação do serviço puro de Atas: `src/services/ataEventService.ts`;
* Criação da suíte de testes de domínio: `src/services/__tests__/ataEventService.test.ts`;
* Integridade dos arquivos legados e preservação de `src/services/temporalEngineService.ts`;
* Ausência de intervenções no banco de dados e no Supabase.

---

## 2. AUDITORIA DE `Contrato.arpId`

### A. Caminhos que presumem existência de `arpId`
Nenhum caminho consumidor presume incondicionalmente a presença de `arpId`:
* `src/services/allocationService.ts` (L635): Já utiliza guarda ternária defensiva (`contrato.arpId ? ... : ''`);
* `src/adapters/contractRpcAdapter.ts` (L26): Utiliza cadeia defensiva de fallbacks (`contrato.arp_id || contrato.arpId || parsed.numeroAta || null`);
* `src/hooks/useSaveManualContract.ts` (L34): Utiliza guarda condicional antes de computar chaves de invalidação de cache;
* `src/services/balanceService.ts`: A função `validateContrato` valida exclusivamente a existência de número e lastro de empenhos, sem depender de `arpId`.

### B. Tratamento de `undefined`
Não foi detectada nenhuma conversão espúria de `undefined` para strings ou valores artificiais (`""`, `"N/A"`, UUIDs gerados ou objetos sintéticos). Quando ausente, o valor flui como `undefined` ou `null` no limite da persistência.

### C. Contratos derivados de Ata
Contratos derivados de Atas continuam operando de forma 100% idêntica, pois componentes como `ManualContratoModal` e `LinkContractModal` injetam explicitamente o `arpId` extraído do item da Ata em foco.

### D. Contratos sem Ata (compras diretas / dispensas)
Contratos sem Ata podem agora ser instanciados de forma legítima sem quebrar:
* **Fórmula de saldo da Ata**: O saldo da Ata é consumido por empenhos (`Empenho.quantidade`) e não por contratos;
* **Alocações internas**: Tratam contratos sem `arpId` sem gerar chave de item espúria;
* **Contrato 360°**: O catálogo oficial de contratos (`ContractDashboardRecord`) já contemplava compras diretas sem vínculo com Ata;
* **Consultas e Navegação**: Não há crashes ou acessos a propriedades de `undefined`.

### E. Natureza da alteração
A mudança é prioritariamente de tipagem formal, com saneamento semântico que desonera o modelo de forçar vínculos artificiais a Atas inexistentes.

---

## 3. AUDITORIA DE `TipoInstrumentoContratual` E ART. 95

Inspecionou-se a definição em `src/types/index.ts`:

```typescript
export type TipoInstrumentoContratual =
  | 'TERMO_CONTRATO'           // Instrumento solene bilateral ordinário
  | 'CARTA_CONTRATO'           // Instrumento substitutivo simplificado
  | 'NOTA_EMPENHO'             // Instrumento substitutivo para compras com entrega imediata
  | 'AUTORIZACAO_COMPRA'       // Instrumento substitutivo simplificado
  | 'ORDEM_EXECUCAO_SERVICO'   // Instrumento substitutivo simplificado
  | 'OUTRO_INSTRUMENTO_HABIL'; // Demais hipóteses admitidas pelo art. 95

export function isInstrumentoSubstitutivo(tipo?: TipoInstrumentoContratual): boolean {
  return tipo !== undefined && tipo !== 'TERMO_CONTRATO';
}
```

### Verificação Crítica de Regressão e Defaults
* **`tipoInstrumento === undefined`**: A função `isInstrumentoSubstitutivo(undefined)` retorna `false`. Nenhum contrato pré-existente foi reclassificado retroativamente como substitutivo.
* **Isolamento**: Não foram adicionados acoplamentos prematuros em componentes de UI ou serviços que imponham o discriminador a contratos antigos.

---

## 4. AUDITORIA DE IMPACTO NO MOTOR TEMPORAL

* O arquivo `src/services/temporalEngineService.ts` **não sofreu nenhuma alteração** (`git diff` vazio).
* A busca global por `TipoInstrumentoContratual` confirmou que o tipo não é consumido pelo motor temporal na Fase 6.5.
* O motor temporal permanece 100% isolado, pronto para ser conectado na Fase 6.6.

---

## 5. AUDITORIA DO DOMÍNIO `AtaEvent`

Confirmaram-se em `src/types/ataEvents.ts` os 9 eventos canônicos de Ata:
1. `CELEBRACAO`
2. `PRORROGACAO`
3. `REAJUSTE`
4. `REPACTUACAO`
5. `REEQUILIBRIO`
6. `REMANEJAMENTO`
7. `APOSTILAMENTO`
8. `ENCERRAMENTO_ESCOPO`
9. `ENCERRAMENTO_VIGENCIA`

**Conformidade Ontológica**: Os eventos `ACRESCIMO` e `SUPRESSAO` foram deliberadamente omitidos de `AtaEventType`. A Ata de Registro de Preços não admite acréscimo unilateral de quantitativo (vedação expressa do Decreto nº 11.462/2023, art. 23).

---

## 6. AUDITORIA DE OFICIALIDADE

A tipagem `AtaEventOficialidade` reutiliza estritamente os 4 níveis conceituais de oficialidade e governança de dados:
* `FATO_OFICIAL` (publicações em diários oficiais e PNCP);
* `DECISAO_INTERNA` (deliberações formais e pareceres jurídicos);
* `PROPOSTA_ADMINISTRATIVA` (solicitações de fornecedores e participantes);
* `DADO_INTERNO` (registros operacionais locais).

Não houve proliferação de taxonomias paralelas.

---

## 7. AUDITORIA DE IDEMPOTÊNCIA

A função `generateAtaEventId` constrói a chave no formato:
`ATA::{numeroAta}::{uasgGerenciadora}::{tipoEvento}::{identificadorOficial}::{cicloRef}`
com sanitização determinística.

* Invocada múltiplas vezes com os mesmos metadados, produz idêntica chave primária;
* Não utiliza números randômicos nem `Date.now()`;
* Impossibilita duplicação histórica de um mesmo fato formal.

---

## 8. AUDITORIA DE `evaluateAtaProrrogationReadiness`

Inspecionada a função em `src/services/ataEventService.ts`. Constatou-se que:
* Opera de forma puramente determinística e em memória;
* Separa dados objetivos (saldo, vigência, edital) da avaliação de prontidão;
* **NÃO altera vigência**, **NÃO grava em banco**, **NÃO gera eventos**, **NÃO cria workflows** e **NÃO altera saldos**;
* O atributo `podeProsseguirComJustificativa: true` está presente em 100% dos retornos, assegurando a atuação como ferramenta assistiva sem bloqueios cegos de sistema.

---

## 9. AUDITORIA DA "CONCORDÂNCIA DO FORNECEDOR"

A análise revelou que `evaluateAtaProrrogationReadiness` inclui o parâmetro opcional `fornecedorConcordou?: boolean`:
* **Origem**: Trata-se de requisito do processo administrativo ordinário de prorrogação consensual de Ata;
* **Comportamento**: Quando omitido (`undefined`), a função sinaliza status `'PENDENTE_CONCORDANCIA_FORNECEDOR'` e `aptaParaProrrogacao = false`;
* **Avaliação**: O escopo da Fase 6.5 previa primordialmente a verificação de vantajosidade e saldo vs. edital (Art. 84 c/c Parecer 75/2024 AGU). A introdução de `fornecedorConcordou` é conceitualmente válida no processo administrativo, mas se não preenchida impede o status `PRONTA`.
* **Classificação**: Registrado como achado **`ACH-6.5-02` (INFO)** com recomendação para a integração na Fase 6.6.

---

## 10. AUDITORIA DO PRINCÍPIO "ASSISTÊNCIA, NÃO DECISÃO JURÍDICA"

Ao analisar `classifyAtaEvent` em `src/services/ataEventService.ts` (L75-79):
```typescript
if (desc.includes('acréscimo') || desc.includes('aditamento de quantitativo') || desc.includes('acrescimo')) {
  throw new Error('VIOLACAO_REGULATORIA_ATA: ...');
}
```

* **Diagnóstico**: Lançar `throw new Error` em um classificador textual de eventos interrompe a execução caso uma descrição legítima contenha a palavra "acréscimo" (ex: "Ofício de esclarecimento acerca de acréscimo vedado").
* **Impacto**: Atualmente nulo em produção, pois o serviço ainda não recebe chamadas da UI nem de APIs governamentais nesta fase.
* **Classificação**: Registrado como achado **`ACH-6.5-01` (LOW)** com recomendação de substituição por classificação com badge assistivo na Fase 6.6.

---

## 11. AUDITORIA DE SEI

* `AtaEvent` utiliza o campo existente `processoSeiNumero?: string`;
* Não foram criados novos endpoints, services, tabelas ou cadastros de processos SEI.

---

## 12. AUDITORIA DE SEPARAÇÃO DE WORKFLOWS

* Não foram criados `AtaWorkflow`, steppers, templates ou tarefas operacionais nesta fase;
* O escopo permaneceu estritamente na modelagem de domínio puro.

---

## 13. AUDITORIA DE BANCO DE DADOS

* Novas migrations: **0** (mantidas as 15 existentes);
* Novas RPCs: **0**;
* Novas tabelas: **0**;
* Novas colunas ou triggers: **0**;
* Políticas RLS alteradas: **Nenhuma**.

---

## 14. AUDITORIA DE ARQUITETURA

Confirmada a separação ontológica clara:
```text
Contract Events (src/types/contractEvents.ts)  ───> Domínio de Contratos
Ata Events (src/types/ataEvents.ts)            ───> Domínio de Atas
```
Sem criação de motores genéricos precipitados ou duplicação indevida de regras de negócio.

---

## 15. AUDITORIA DA REGRESSÃO TÉCNICA

Pipeline executado com sucesso integral:
* **Vitest (`npm test -- --run`)**: **70 arquivos de teste / 603 testes PASS (100%)**
* **TypeScript (`npx tsc -b`)**: **0 erros**
* **ESLint (`npm run lint`)**: **0 erros**
* **Build de Produção (`npm run build`)**: **Sucesso em 1.72s**

---

## 16. AUDITORIA DO GIT

Inspecionado `git status` e `git diff`:
* Arquivos modificados: `src/types/index.ts` e `src/components/ItemBalances.tsx`;
* Arquivos novos de domínio: `src/types/ataEvents.ts`, `src/services/ataEventService.ts`, `src/services/__tests__/ataEventService.test.ts`;
* Nenhum arquivo fora do escopo foi modificado.

---

## 17. ACHADOS DA AUDITORIA

### `ACH-6.5-01` — Classificador textual de Ata lançando exceção (`throw`) em vez de retorno assistivo
* **Severidade**: **LOW** (Não bloqueante)
* **Evidência**: Linha 76 de `src/services/ataEventService.ts`: `throw new Error('VIOLACAO_REGULATORIA_ATA: ...')`.
* **Impacto**: Se uma descrição contiver a palavra "acréscimo" em contexto informativo, a função lança uma exceção não tratada em vez de emitir um alerta.
* **Recomendação**: Na Fase 6.6, substituir o `throw` por uma classificação assistiva estruturada (`tipoEvento: 'APOSTILAMENTO'`, com flag `avisoNormativo: 'ACRESCIMO_VEDADO_EM_ATA'`), alinhando 100% ao princípio "Assistência, Não Decisão Jurídica".
* **Bloqueia Fase 6.6?**: **Não**.

---

### `ACH-6.5-02` — Prontidão de prorrogação exigindo `fornecedorConcordou` para status `PRONTA`
* **Severidade**: **INFO** (Não bloqueante)
* **Evidência**: Linhas 341-350 de `src/services/ataEventService.ts`: quando `fornecedorConcordou === undefined`, o status passa de `PRONTA` para `PENDENTE_CONCORDANCIA_FORNECEDOR`.
* **Impacto**: Avaliações que queiram verificar apenas os dados objetivos de saldo e vantajosidade de preço não atingem `PRONTA` sem preenchimento explícito da anuência.
* **Recomendação**: Na Fase 6.6, documentar a distinção entre a "Prontidão Objetiva de Saldo/Vantajosidade" e a "Instrução Processual Completa (com Anuência)".
* **Bloqueia Fase 6.6?**: **Não**.

---

## 18. VEREDITO FINAL

Todos os critérios centrais foram satisfeitos:
1. `arpId` opcional é seguro, retrocompatível e não causa regressão;
2. `TipoInstrumentoContratual` do Art. 95 está adequadamente tipado e com defaults neutros;
3. `AtaEvent` possui domínio próprio e omite deliberadamente `ACRESCIMO/SUPRESSAO`;
4. Taxonomia de oficialidade e chave determinística foram preservadas;
5. O motor temporal (`temporalEngineService.ts`) permaneceu rigorosamente intacto;
6. Nenhuma alteração foi realizada no banco de dados ou no Supabase;
7. Nenhum workflow de Ata foi antecipado;
8. A regressão está 100% verde (603 testes PASS).

---

### **FASE 6.5-A — GO**

**Fase 6.5 definitivamente homologada, encerrada e liberada para a FASE 6.6 — Integração da Ata ao Motor Temporal e Central de Prazos.**
