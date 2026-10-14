# RELATÓRIO DE IMPLEMENTAÇÃO — FASE 6.5
## Modelagem Pura do Domínio de Atas e Saneamento de Instrumentos Contratuais

---

## 1. CABEÇALHO E METADADOS FORMAIS

* **Projeto**: SaldoARP — Sistema de Gestão de Atas de Registro de Preços e Contratos
* **Fase**: 6.5 — Modelagem Pura do Domínio de Atas e Saneamento de Instrumentos
* **Ambiente**: Produção / Supabase (`bouutpmxexvwppcmmhdi`)
* **Branch**: `claude/practical-curie-l7be2j`
* **Data**: 2026-09-23
* **Status**: **CONCLUÍDO COM GO**
* **Responsável**: Engenheiro de Software / Antigravity Agent

---

## 2. RESUMO EXECUTIVO E VEREDITO

A **Fase 6.5** implementou com rigor e conformidade estrita a fundação pura de domínio para Atas de Registro de Preços sob a égide da Nova Lei de Licitações (Lei 14.133/2021 e Decreto 11.462/2023), saneando simultaneamente as limitações arquiteturais de instrumentos contratuais identificadas no Checkpoint 6.4.

A implementação manteve **ZERO alteração de banco de dados, ZERO migrations e ZERO chamadas de rede/RPCs**, operando como uma camada de domínio pura em TypeScript.

### Veredito Oficial: **GO (APROVADO)**

Métricas de Entrega:
* **Arquivos de Teste**: 70 (69 legados + 1 novo de Atas)
* **Testes Automatizados**: **603 testes PASS** (100% de sucesso, sendo 20 novos)
* **TypeScript (`tsc -b`)**: **0 erros**
* **Linter (`eslint`)**: **0 erros**
* **Build de Produção (`vite build`)**: **Sucesso absoluto**

---

## 3. AUDITORIA EXAUSTIVA DE CONSUMIDORES DE `arpId`

Antes de qualquer modificação estrutural, realizou-se auditoria exaustiva em todo o código-fonte buscando todos os consumidores e acessos à propriedade `arpId`:

1. `src/services/allocationService.ts`:
   * Linha 635: Já possuía guarda defensiva ternária:
     `const rawItemKey = contrato.arpId ? `${contrato.arpId}-${contrato.uasg}-${contrato.itemId || '00001'}` : '';`
   * Mapeamento de persistência repassa `contrato.arpId` de forma transparente.
2. `src/adapters/contractRpcAdapter.ts`:
   * Linha 26: Possuía cadeia de fallbacks resiliente:
     `arp_id: contrato.arp_id || contrato.arpId || parsed.numeroAta || null`
3. `src/hooks/useSaveManualContract.ts`:
   * Linha 34: Já possuía checagem condicional:
     `variables.contrato.arpId ? ... : ''`
4. `src/components/modals/ManualContratoModal.tsx`:
   * Modal contextual ao item da Ata continua fornecendo `arpId` originário do item selecionado.
5. `src/services/balanceService.ts`:
   * `validateContrato` não dependia e não exige `arpId`, pois valida exclusivamente unicidade, integridade de número e lastro orçamentário.

**Conclusão da Auditoria**: A transição para opcionalidade (`arpId?: string`) é 100% segura, retrocompatível e elimina a deformação conceitual que forçava contratos oriundos de compras diretas a registrarem valores fictícios como `""` ou `"N/A"`.

---

## 4. SANEAMENTO DO MODELO `Contrato` E AUSÊNCIA DE REGRESSÃO

No arquivo `src/types/index.ts`, a interface canônica `Contrato` foi refinada:

```typescript
export interface Contrato {
  id: string;
  numero: string;
  ano: number;
  arpId?: string; // Saneamento Fase 6.5: Opcional (contrato pode derivar de compra direta sem Ata)
  tipoInstrumento?: TipoInstrumentoContratual; // Discriminador formal (Art. 95)
  itemId?: string;
  uasg: string;
  numeroControlePncp?: string;
  linkPncp?: string;
  fornecedor?: string;
  cnpjFornecedor?: string;
  objeto?: string;
  quantidadeContratada?: number;
  valorTotal?: number;
  origem: OrigemRegistro;
  criadoEm: string;
  atualizadoEm: string;
}
```

A interface de catálogo do dashboard `ContractDashboardRecord` também foi equipada com:
* `tipoInstrumento?: TipoInstrumentoContratual;`
* `arpId?: string;`

A integridade do legado de `contratos_manuais` foi preservada sem qualquer alteração regressiva.

---

## 5. TIPAGEM E MODELAGEM DE INSTRUMENTOS CONTRATUAIS (ART. 95)

Implementou-se em `src/types/index.ts` o discriminador formal dos instrumentos hábeis que podem substituir o termo solene de contrato, conforme preceitua o Art. 95 da Lei nº 14.133/2021:

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

Essa diferenciação ontológica prepara a Fase 6.6 para silenciar alertas indevidos de prorrogação continuada (D-180) para compras ordinárias de entrega imediata materializadas por simples nota de empenho.

---

## 6. MODELAGEM PURA DO DOMÍNIO DE ATAS (`src/types/ataEvents.ts`)

Criou-se o modelo puro de eventos de Atas de Registro de Preços, espelhando os princípios consolidados em `contractEvents.ts`, estruturado em:

* **Eventos Formais (`AtaEventType`)**:
  1. `CELEBRACAO`: Publicação e vigência inicial da Ata.
  2. `PRORROGACAO`: Prorrogação de vigência da Ata (Art. 84).
  3. `REAJUSTE`: Reajuste por índice em sentido estrito.
  4. `REPACTUACAO`: Repactuação decorrente de convenção coletiva/mão de obra.
  5. `REEQUILIBRIO`: Revisão por álea extraordinária imprevisível.
  6. `REMANEJAMENTO`: Remanejamento de quantitativos entre órgãos participantes.
  7. `APOSTILAMENTO`: Anotações administrativas sem alteração material.
  8. `ENCERRAMENTO_ESCOPO`: Extinção pelo esgotamento total dos saldos.
  9. `ENCERRAMENTO_VIGENCIA`: Extinção pelo término do prazo de validade temporal.
* **Naturezas Formais (`AtaEventNature`)**:
  `ATA_INICIAL`, `TERMO_ADITIVO_ATA`, `TERMO_APOSTILAMENTO_ATA`, `TERMO_REMANEJAMENTO`, `REGISTRO_ADMINISTRATIVO_ATA`.
* **Impactos Formais (`AtaEventImpact`)**:
  `ALTERA_VIGENCIA_ATA`, `ALTERA_PRECO_REGISTRADO`, `REMANEJA_QUANTITATIVO`, `ATUALIZA_DADOS_ATA`, `EXTINGUE_ATA`, `SEM_IMPACTO_FINANCEIRO_TEMPORAL`.
* **Ciclo de Vida da Ata (`AtaLifecycleState`)**:
  `VIGENTE`, `EM_PRORROGACAO`, `EM_REVISAO_PRECO`, `EM_REMANEJAMENTO`, `ESGOTADA`, `EXPIRADA`, `CANCELADA`.

---

## 7. PRINCÍPIO ONTOLÓGICO: VEDAÇÃO DE ACRÉSCIMO EM ATA DE REGISTRO DE PREÇOS

A legislação federal impõe distinção ontológica intransponível entre a Ata e o Contrato:
* **Contrato Administrativo (Art. 125, Lei 14.133/2021)**: Admite termos aditivos de acréscimo unilateral de até 25% (ou 50% para reforma).
* **Ata de Registro de Preços (Decreto nº 11.462/2023, art. 23)**: **É expressamente vedado efetuar acréscimos nos quantitativos fixados pela ata de registro de preços, inclusive o acréscimo de que trata o art. 125 da Lei nº 14.133/2021**.

O domínio do SaldoARP implementa essa regra como invariante cardinal:
* `ACRESCIMO` e `SUPRESSAO` foram excluídos de `AtaEventType`.
* A função `classifyAtaEvent` lança exceção formal `VIOLACAO_REGULATORIA_ATA` caso seja submetida intenção de acréscimo quantitativo na Ata.
* Alterações de saldo na Ata ocorrem unicamente via `REMANEJAMENTO` (soma-zero entre órgãos participantes).

---

## 8. TAXONOMIA DE OFICIALIDADE DE EVENTOS DE ATA

Alinhado ao padrão de governança de dados soberanos do SaldoARP, o tipo `AtaEventOficialidade` classifica a proveniência e força probatória do fato:

1. `FATO_OFICIAL`: Publicações no PNCP, Diário Oficial da União (DOU) ou compras.gov.br.
2. `DECISAO_INTERNA`: Pareceres jurídicos conclusivos, deliberações de comissão e despachos homologatórios da autoridade máxima.
3. `PROPOSTA_ADMINISTRATIVA`: Pedidos de reequilíbrio econômico pelo fornecedor ou ofícios de solicitação de remanejamento por participantes.
4. `DADO_INTERNO`: Notas operacionais, apontamentos de acompanhamento e estimativas do gestor da Ata.

---

## 9. SERVIÇO PURO DE DOMÍNIO DE ATAS (`src/services/ataEventService.ts`)

O serviço puro expõe 4 funções determinísticas e livres de efeitos colaterais:

1. `generateAtaEventId`:
   Gera identificador canônico e idempotente:
   `ATA::{numeroAta}::{uasgGerenciadora}::{tipoEvento}::{identificadorOficial}::{cicloRef}`
2. `classifyAtaEvent`:
   Classifica strings e metadados oficiais identificando o tipo exato, instrumento formal e impacto, com interceptação e bloqueio de acréscimos ilegais.
3. `buildAtaEvent`:
   Constrói o objeto canônico `AtaEvent` com validação de datas, impactos e rastreabilidade temporal.
4. `evaluateAtaProrrogationReadiness`:
   Motor de avaliação assistiva de prorrogação da vigência da Ata.

---

## 10. MOTOR ASSISTIVO DE PRORROGAÇÃO DA ATA (ART. 84 C/C PARECER 75/2024 AGU)

Nos termos do art. 84 da Lei 14.133/2021, o prazo de vigência da ata de registro de preços será de 1 (um) ano e poderá ser prorrogado, por igual período, desde que comprovado o preço vantajoso.

A função `evaluateAtaProrrogationReadiness` avalia os 4 critérios consolidados da jurisprudência e da Advocacia-Geral da União (Parecer nº 75/2024/DECOR/CGU/AGU):

1. **Vantajosidade Econômica**:
   * Se a pesquisa de mercado indicar perda de vantajosidade $\rightarrow$ Status `PRECO_DESVANTAJOSO` (Badge Vermelho).
   * Se a pesquisa não foi juntada aos autos $\rightarrow$ Status `PENDENTE_PESQUISA_PRECO` (Badge Amarelo).
2. **Anuência do Beneficiário**:
   * Se o fornecedor recusar prorrogar $\rightarrow$ Status `IMPEDIDA` (Badge Vermelho, orientação para chamar cadastro de reserva).
   * Se pendente de resposta formal $\rightarrow$ Status `PENDENTE_CONCORDANCIA_FORNECEDOR` (Badge Amarelo).
3. **Saldo e Previsão Editalícia**:
   * Se `saldoDisponivelTotal > 0` $\rightarrow$ Saldo existente autoriza prorrogação.
   * Se `saldoDisponivelTotal === 0` E `editalPreveRenovacaoQuantitativos === true` $\rightarrow$ Status `PRONTA` (Badge Verde, cota renovada conforme cláusula editalícia).
   * Se `saldoDisponivelTotal === 0` E `editalPreveRenovacaoQuantitativos === false` $\rightarrow$ Status `SALDO_ESGOTADO_SEM_PREVISAO_EDITAL` (Badge Vermelho, ata exaurida sem previsão de novas cotas não pode ser prorrogada).
4. **Princípio Fundamental de Assistência**:
   * A propriedade `podeProsseguirComJustificativa: true` é preservada em todas as saídas, assegurando que o sistema atue como copiloto assistivo e não substitua o juízo de conveniência e oportunidade da autoridade administrativa competente.

---

## 11. SUÍTE DE TESTES UNITÁRIOS DE ATAS

Criou-se `src/services/__tests__/ataEventService.test.ts` com **20 testes unitários específicos**:

* Chave canônica determinística e sanitização (2 testes)
* Classificação formal e vedação legal de acréscimo (9 testes)
* Construtor canônico com rastreabilidade (1 teste)
* Cenários de prorrogação: vantajosa, saldo zerado com edital, saldo zerado sem edital, pendência de pesquisa, preço desvantajoso, recusa do fornecedor (6 testes)
* Saneamento de instrumentos contratuais e Art. 95 (2 testes)

Resultado: **20 PASS (0 falhas)** em 6ms.

---

## 12. COMPROVAÇÃO DA REGRESSÃO TÉCNICA GLOBAL

A validação automatizada de integridade executou o pipeline completo do projeto:

```bash
# 1. Testes Automatizados (Vitest)
Test Files  70 passed (70)
Tests       603 passed (603)
Duration    3.93s

# 2. Tipagem Estrita (TypeScript)
npx tsc -b
Exit code: 0 (Zero erros de tipo)

# 3. Análise Estática (ESLint)
npm run lint
Found 43 warnings and 0 errors.
Exit code: 0

# 4. Compilação de Produção (Vite)
npm run build
dist/assets/index-CODpI-M9.js   2,018.43 kB
built in 672ms
Exit code: 0
```

---

## 13. RESPEITO ÀS RESTRIÇÕES ABSOLUTAS

| Restrição Imposta | Conformidade | Evidência Comprobatória |
| :--- | :---: | :--- |
| **Zero Migrations no Supabase** | **100%** | Nenhuma migration foi criada ou alterada na pasta `supabase/migrations/` |
| **Zero Modificação no Banco de Dados** | **100%** | Nenhuma tabela, RPC, trigger ou RLS do PostgreSQL foi tocada |
| **Zero Workflows de Ata** | **100%** | Não foram criados steppers, templates ou executores de workflows de Ata nesta fase |
| **Não alterar `temporalEngineService`** | **100%** | Arquivo `src/services/temporalEngineService.ts` permaneceu intacto para a Fase 6.6 |
| **Preservar `contratos_manuais`** | **100%** | Compatibilidade total preservada em adapters e componentes |
| **Preservar `arp_item_contract_links`** | **100%** | Módulo de vínculos da Fase 6.3 permaneceu 100% íntegro e testado |

---

## 14. CONCLUSÃO E PRÓXIMOS PASSOS

A **Fase 6.5** foi concluída com excelência técnica, estabelecendo a base sólida e pura para a gestão regulatória de Atas de Registro de Preços sob a Lei 14.133/2021 e saneando os instrumentos contratuais do sistema.

### Próxima Frente: **FASE 6.6 — INTEGRAÇÃO TEMPORAL E CENTRAL DE PRAZOS UNIFICADA**
Objetivos previstos:
1. Integrar a gestão temporal de Atas de Registro de Preços ao motor unificado (`temporalEngineService.ts`);
2. Incorporar a Central de Prazos do SaldoARP para monitorar simultaneamente prazos de Atas (D-180, D-120, D-90, D-60) e Contratos;
3. Aplicar o filtro de instrumentos substitutivos (`TipoInstrumentoContratual`) para desativar alertas de prorrogação contínua em compras de entrega imediata.
