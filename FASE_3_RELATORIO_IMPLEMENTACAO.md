# SALDOARP — FASE 3: RELATÓRIO DE IMPLEMENTAÇÃO E CONFORMIDADE

## Central de Prazos, Obrigações e Tarefas

**Data de Conclusão:** 23 de Setembro de 2026  
**Status:** CONCLUÍDO E VALIDADO COM SUCESSO  
**Métricas de Qualidade:**
* **49 arquivos de teste aprovados** (100% dos testes do projeto);
* **363 testes unitários e de integração passando** (0 falhas);
* **Build de Produção aprovado** (`tsc -b && vite build` sem warnings ou erros de tipagem);
* **Zero migrations desnecessárias** criadas (modelo existente foi 100% aproveitado).

---

## 1. OBJETIVO ATINGIDO

A **FASE 3 — Central de Prazos e Tarefas** consolidou o SaldoARP como plataforma proativa de governança do ciclo de vida contratual e de atas. O sistema agora responde em tempo de execução:
- **O que está vencendo hoje, nos próximos 7 dias, 30 dias ou atrasado?**
- **Qual é o fundamento de cada prazo (Legal, Contratual, Editalício, Interno ou Operacional)?**
- **Qual é o dado oficial de origem e por que a data foi calculada dessa forma (Ficha de Explicabilidade)?**
- **Quem é o gestor ou responsável designado para cada ação?**

---

## 2. ARQUITETURA IMPLEMENTADA

A implementação seguiu rigorosamente a separação conceitual aprovada:

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FONTES OFICIAIS DE DADOS                     │
│    (Compras.gov.br / Contratos.gov.br / PNCP / Base Local)      │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│             MOTOR TEMPORAL (temporalEngineService)              │
│  - Fuso horário America/Sao_Paulo                               │
│  - Dias corridos e dias úteis com feriados nacionais            │
│  - Status temporal desacoplado do Nível de Atenção              │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│          SERVIÇO AGREGADOR (centralPrazosService)               │
│  - Gera Gatilhos Operacionais em memória                        │
│  - Agrega Tarefas Humanas persistidas (contract_tasks)          │
│  - Aplica chave canônica de idempotência determinística         │
│  - Monta Ficha de Explicabilidade Transparente                  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│         HOOK CANÔNICO & UI (useCentralPrazosData / /prazos)     │
│  - Cards Executivos de Atenção Imediata (KPIs)                  │
│  - Filtros por Entidade, Nível de Atenção, Responsável          │
│  - Tabela Operacional Unificada com badges distintos            │
│  - Modal de Explicabilidade Transparente                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. SEPARAÇÃO CONCEITUAL E REGRAS DE DOMÍNIO

1. **MARCO / FATO OFICIAL:**
   - Datas provenientes de fontes federais (`dataVigenciaFim`, `dataAssinatura`, `dataVigenciaFinal`).
   - Não são editáveis diretamente e não sofrem sobrescrita em sincronizações.

2. **GATILHO OPERACIONAL:**
   - Evento temporal gerado dinamicamente em memória pelo motor de cálculo (ex.: 180 dias antes do fim da vigência).
   - **Não polui o banco de dados** com centenas de tarefas vazias ou artificiais.

3. **TAREFA HUMANA:**
   - Obrigação ou ação criada e persistida nas tabelas `contract_tasks` / `contract_task_plans`.
   - Vinculada ao plano de trabalho e ao gestor/servidor responsável.

4. **CONCEITO DE "ATRASADA":**
   - **Não é persistido como status no banco de dados.**
   - É um estado temporal derivado em tempo de execução: `diasRestantes < 0` e status diferente de `CONCLUIDA` / `NAO_APLICAVEL`.

---

## 4. IDEMPOTÊNCIA DETERMINÍSTICA

Cada item da Central de Prazos possui um identificador lógico estruturado:
```text
{tipoEntidade}::{idEntidade}::{eventoId}::{regraId}::{cicloRef}
```
Exemplo real:
`CONTRATO::200331-00015-2026::PRORROGACAO::GATILHO_180D::VIG_20270101`

Isso assegura que:
- Múltiplos ciclos de prorrogação e reajuste não geram duplicação;
- Itens em memória e tarefas persistidas convivem harmonicamente;
- Não há dependência de migrations adicionais no Supabase.

---

## 5. ARTEFATOS CRIADOS E MODIFICADOS

| Arquivo | Descrição |
|---|---|
| `src/types/centralPrazos.ts` | Tipos canônicos de item, filtros, KPIs e abas da Central. |
| `src/services/centralPrazosService.ts` | Serviço agregador e motor de regras de negócio em memória. |
| `src/services/contractManagementService.ts` | Adicionada função batch otimizada `fetchAllContractTaskPlans`. |
| `src/services/temporalEngineService.ts` | Adicionado utilitário `formatDateBR` para padronização institucional. |
| `src/hooks/useCentralPrazosData.ts` | Hook React Query para consumo centralizado da camada de prazos. |
| `src/components/prazos/ExplicabilidadeModal.tsx` | Modal com memória de cálculo, fundamentação e rastreabilidade. |
| `src/components/prazos/CentralPrazosKPIHeader.tsx` | Cards executivos interativos (Atrasadas, Hoje, 7d, 30d, Futuras, Total). |
| `src/components/prazos/CentralPrazosFiltersBar.tsx` | Barra de busca e filtros operacionais multidimensionais. |
| `src/components/prazos/CentralPrazosTable.tsx` | Tabela operacional de acompanhamento e auditoria. |
| `src/components/prazos/CentralPrazosDashboard.tsx` | Tela principal da Central de Prazos e Tarefas. |
| `src/routes/CentralPrazosRoute.tsx` | Rota para `/prazos`. |
| `src/App.tsx` & `src/config/navigation.ts` | Registro da rota `/prazos` e navegação visual institucional. |
| `src/services/__tests__/centralPrazosService.test.ts` | Suíte de testes do agregador (11 testes). |
| `src/hooks/__tests__/useCentralPrazosData.test.ts` | Teste do hook e filtros. |

---

## 6. CONCLUSÃO E PRÓXIMOS PASSOS

A **Fase 3** foi entregue integralmente com código limpo, cobertura de testes abrangente e conformidade com as diretrizes do Ministério da Justiça e Segurança Pública (SENASP / BR-DS).
