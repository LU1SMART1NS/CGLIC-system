# FASE 3 — PLANO TÉCNICO REVISADO: CENTRAL DE PRAZOS E TAREFAS

**Sistema**: SaldoARP  
**Data**: 23/09/2026  
**Status**: PROPOSTA TÉCNICA REVISADA — AGUARDANDO APROVAÇÃO  
**Conclusão e Parecer**: **`GO`** (Arquitetura 100% compatível, sem migrations obrigatórias imediatas)

---

## 1. Diagnóstico Revisado

A auditoria das Fases 1 e 2 comprovou que o SaldoARP possui uma base sólida de dados oficiais (Compras.gov.br, Contratos.gov.br, PNCP) e um **Motor Temporal Centralizado** (`temporalEngineService.ts`) capaz de calcular com precisão dias corridos, dias úteis, fusos horários e explicabilidade de prazos.

O desafio da Fase 3 é transformar esses cálculos em uma **ferramenta operacional e acionável** para a equipe e a coordenação, sem criar complexidade artificial e sem duplicar dados.

---

## 2. Auditoria de Schema e Necessidade de Migrations

### 2.1. Estruturas Existentes no Supabase Postgres:
* **`contract_managers`**: Armazena o gestor oficial do contrato (`contract_key`, `uasg`, `numero`, `ano`, `gestor_nome`, `updated_at`).
* **`contract_task_templates` / `contract_task_template_macrotasks` / `contract_task_template_tasks`**: Catálogo de templates de fluxos operacionais.
* **`contract_task_plans` / `contract_task_macrotasks` / `contract_tasks`**: Instâncias de tarefas concretas atribuídas aos contratos (`id`, `nome`, `status`, `responsavel_nome`, `prazo`, `observacao`, `concluido_em`, `concluido_por`).
* **Triggers de Auditoria**: `trg_audit_contract_tasks` e `trg_audit_contract_managers` já ativos.

### 2.2. Parecer sobre Migrations:
> [!IMPORTANT]
> **Nenhuma migration é obrigatória para a Fase 3.**
> A agregação entre **Gatilhos Operacionais em Memória** (alertas derivados do motor temporal sobre dados oficiais) e **Tarefas Humanas Persistidas** (`contract_tasks`) é realizada de forma desacoplada através do contrato intermediário `CentralPrazosItem`.
> 
> *Evolução futura não-destrutiva (Fases posteriores)*: Caso surja necessidade de gravar tarefas manuais diretamente desvinculadas de contratos (ex: tarefas de governança geral ou atreladas exclusivamente a processos SEI), poderá ser criada uma migration complementar aditiva sem impacto nas estruturas atuais.

---

## 3. Relação Conceitual: Prazo × Gatilho Operacional × Tarefa × Evento

Para eliminar qualquer ambiguidade entre direito administrativo e rotina operacional, o sistema adota quatro conceitos estritamente separados:

```text
┌───────────────────────────────────────────────────────────────────────────────────┐
│ 1. MARCO / FATO OFICIAL                                                           │
│    Data oficial de vigência final do contrato: 30/11/2026 (Contratos.gov.br).     │
├───────────────────────────────────────────────────────────────────────────────────┤
│ 2. GATILHO OPERACIONAL (Alerta do Motor Temporal)                                 │
│    "Avaliar viabilidade de prorrogação a 180 dias do término" (Prática Operacional│
│    Interna — Não constitui presunção jurídica de que haverá prorrogação).         │
│    Data Calculada: 03/06/2026 | Estado: VENCE_EM_BREVE | Nível: ATENCAO           │
├───────────────────────────────────────────────────────────────────────────────────┤
│ 3. TAREFA HUMANA (Ação Operacional Persistida)                                    │
│    Ação executada por uma pessoa após decisão administrativa.                     │
│    Ex: "Elaborar Nota Técnica de Justificativa" | Resp: João Silva | Status: PEND │
├───────────────────────────────────────────────────────────────────────────────────┤
│ 4. EVENTO CONTRATUAL (Fato Jurídico Formal)                                       │
│    Celebração e publicação do Termo Aditivo de Prorrogação no PNCP.               │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Estratégia de Idempotência e Prevenção de Duplicidades

Para suportar múltiplos ciclos de prorrogação, reajustes anuais sucessivos e repactuações sem gerar duplicidades diárias, o sistema adota uma **chave lógica determinística canônica**:

$$\mathbf{ChaveIdempotencia} = \text{tipoEntidade} + \text{"::"} + \text{idEntidade} + \text{"::"} + \text{eventoId} + \text{"::"} + \text{regraId} + \text{"::"} + \text{cicloRef}$$

### Exemplos Reais:
* **Prorrogação — Ciclo 1**: `CONTRATO::200331-00015-2026::PRORROGACAO::GATILHO_180D::VIG_20261130`
* **Prorrogação — Ciclo 2 (após aditivo)**: `CONTRATO::200331-00015-2026::PRORROGACAO::GATILHO_180D::VIG_20271130`
* **Reajuste Anual 2026**: `CONTRATO::200331-00015-2026::REAJUSTE::REAJUSTE_PERIODICO::ANIV_2026`
* **Exaustão de Vigência de ARP**: `ARP::00049/2025-200331::VIGENCIA_ARP::GATILHO_90D::VIG_20270829`

Essa chave garante que uma nova execução diária nunca duplique itens idênticos e reconheça automaticamente quando o contrato mudar de ciclo após um termo aditivo.

---

## 5. Contrato de Domínio Intermediário: `CentralPrazosItem`

O tipo `CentralPrazosItem` desacopla a complexidade de backend e APIs dos componentes visuais do React:

```typescript
export type CentralPrazosItemTipo = 'GATILHO_OPERACIONAL' | 'TAREFA_HUMANA' | 'MARCO_CONTRATUAL';
export type EntidadeOrigemTipo = 'CONTRATO' | 'ARP';

export interface CentralPrazosItem {
  id: string; // Chave de idempotência canônica
  tipoItem: CentralPrazosItemTipo;
  entidadeOrigem: EntidadeOrigemTipo;
  contractKey?: string;
  arpKey?: string;
  identificadorFormatado: string; // Ex: "Contrato 15/2026" ou "ARP 00049/2025"
  objetoResumido?: string;
  fornecedorNome?: string;
  uasg: string;
  processoNumero?: string;

  // Marco e Temporalidade
  marcoEvento: string; // Ex: "Término da Vigência", "Reajuste Periódico", "Vigência da Ata"
  dataBase: string; // YYYY-MM-DD
  fonteDataBase: string; // "Contratos.gov.br" | "Compras.gov.br" | "PNCP" | "Interno"
  regraNome: string;
  regraTipo: RegraOrigemTipo; // OPERACIONAL | CONTRATUAL | EDITAL | INTERNA | LEGAL
  dataAlvo: string; // YYYY-MM-DD
  diasRestantes: number;
  estadoTemporal: TemporalStatus; // FUTURO | VENCE_EM_BREVE | VENCE_HOJE | ATRASADO | CONCLUIDO
  nivelAtencao: AtencaoNivel; // NORMAL | ATENCAO | CRITICO

  // Atribuição e Responsabilidade
  responsavelNome?: string;
  isGestorContrato?: boolean;
  acaoDescricao: string; // Ação descritiva clara

  // Vínculo com Tarefa Persistida (quando existir)
  tarefaId?: string;
  tarefaStatus?: ContractTaskStatusValue; // PENDENTE | EM_ANDAMENTO | CONCLUIDA | NAO_APLICAVEL
  observacoes?: string;

  // Explicabilidade Transparente
  explicabilidade: ExplicabilidadePrazo;
}
```

---

## 6. Distinção entre Estados e Níveis

* **Estado Temporal (Derivado)**:
  * `ATRASADO` ($\text{diasRestantes} < 0$)
  * `VENCE_HOJE` ($\text{diasRestantes} = 0$)
  * `VENCE_EM_BREVE` ($1 \le \text{diasRestantes} \le 30$)
  * `FUTURO` ($\text{diasRestantes} > 30$)
  * `CONCLUIDO` (quando a tarefa vinculada está concluída)
* **Status da Tarefa (Persistido em `contract_tasks`)**:
  * `PENDENTE` | `EM_ANDAMENTO` | `CONCLUIDA` | `NAO_APLICAVEL`
* **Nível de Atenção / Urgência**:
  * `NORMAL` | `ATENCAO` | `CRITICO`

> **Regra arquitetural**: "Vence em 7 dias" não é automaticamente "Risco Alto" — é um gatilho de prioridade de despacho. O status `ATRASADO` não é gravado como string estática no banco, evitando inconsistências quando o dia virar.

---

## 7. Tratamento Unificado de Contratos e ARPs

A Central processa tanto Contratos quanto Atas de Registro de Preços:
* **Contratos Administrativos**:
  * Gatilhos de avaliação de prorrogação (180d, 120d, 60d antes do fim);
  * Gatilhos de acompanhamento de reajuste (quando configurada data-base);
  * Tarefas dos planos de trabalho (`contract_tasks`).
* **Atas de Registro de Preços (ARP)**:
  * Gatilho de alerta de exaustão de vigência da ata (90d antes do fim);
  * Monitoramento de término de vigência para planejamento de novos certames.

---

## 8. Interface da Central de Prazos e Tarefas

### 8.1. Visões e Abas de Navegação:
* **`Todas`**: Visão consolidada de todas as obrigações e tarefas;
* **`Atrasadas`**: Itens com prazo vencido sem conclusão;
* **`Vence Hoje`**: Obrigações do dia corrente;
* **`Próximos 7 Dias`**: Despachos da semana;
* **`Próximos 30 Dias`**: Planejamento do mês;
* **`Futuras`**: Horizonte > 30 dias;
* **`Minhas Tarefas`**: Filtrado pelo gestor/responsável selecionado;
* **`Por Responsável`**: Carga de trabalho agrupada por servidor;
* **`Por Contrato`**: Agrupamento por instrumento contratual;
* **`Por ARP`**: Agrupamento por Ata de Registro de Preços.

### 8.2. Ficha de Explicabilidade (Modal / Drawer Transparente):
$$\text{Data-Base (30/11/2026)} \longrightarrow \text{Regra (Gatilho 180d)} \longrightarrow \text{Data Calculada (03/06/2026)} \longrightarrow \text{Fonte (Contratos.gov.br)} \longrightarrow \text{Responsável (João Silva)}$$

---

## 9. Plano de Implementação Incremental (Fase 3)

* **Passo 3.1 — Tipos e Serviço de Agregação (`src/types/centralPrazos.ts` e `src/services/centralPrazosService.ts`)**:
  * Implementação da unificação de contratos, ARPs, gestores e tarefas em objetos `CentralPrazosItem`.
  * Geração idempotente de chaves e cálculo em memória via `temporalEngineService`.
* **Passo 3.2 — Hook Reativo e Painel UI (`useCentralPrazosData.ts` e `CentralPrazosDashboard.tsx`)**:
  * Hook React Query com cache inteligente e filtros dinâmicos.
  * Tela da Central de Prazos com cards executivos, tabela de despacho, modal de explicabilidade e rota `/prazos`.
* **Passo 3.3 — Testes Automatizados e Build**:
  * Testes unitários do agregador `centralPrazosService.test.ts`.
  * Verificação de 100% dos testes passando (`npx vitest run`) e build (`npm run build`).

---

## 10. Riscos e Mitigações

| Risco | Impacto | Mitigação Arquitetural |
| :--- | :--- | :--- |
| **Sobrecarga de alertas** | Fadiga do operador | Agrupamento em horizontes temporais (7d, 30d, futuras) e filtros por responsável. |
| **Contratos sem gestor** | Obrigação órfã | Identificação visual explícita de "Gestor não atribuído" com botão de atribuição rápida. |
| **Timezone drift** | Prazo mudar de dia | Utilização estrita das funções `parseDateBRT` e `formatDateISO` de `temporalEngineService`. |

---

## 11. Critérios de Aceite da Fase 3

* [ ] Central de Prazos apresenta Contratos e ARPs sem duplicidade;
* [ ] Gatilhos operacionais em memória e tarefas persistidas convivem harmoniosamente;
* [ ] Chave de idempotência cobre múltiplos ciclos de prorrogação e reajuste;
* [ ] Explicabilidade detalha data-base, regra, data calculada e fonte oficial;
* [ ] Estado temporal (atrasado/hoje/7d/30d) é derivado matematicamente;
* [ ] Nenhuma alteração destrutiva de banco ou perda de compatibilidade;
* [ ] 100% dos testes Vitest passando e build de produção aprovado.

---

## Conclusão e Parecer

**Parecer Técnico**: **`GO`**

O plano técnico atende a todas as diretrizes de integridade, simplicidade e compatibilidade. Aguardo sua autorização para iniciar a execução dos passos 3.1, 3.2 e 3.3.
