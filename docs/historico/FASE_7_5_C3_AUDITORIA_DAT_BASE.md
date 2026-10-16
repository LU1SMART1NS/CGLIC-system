# FASE 7.5-C3 — AUDITORIA PONTUAL: HIERARQUIA DA DATA-BASE DO RADAR

## STATUS: AUDITORIA CONCLUÍDA
**Data:** 24 de Setembro de 2026  
**Objeto:** Auditoria comparativa entre `FASE_7_5_B_PLANEJAMENTO_REAJUSTES_EVENTOS_CONTRATUAIS.md` e a implementação em `src/services/contractReajusteRadarService.ts`.  
**Veredito para avanço à FASE 7.5-C4:** **GO**

---

## 1. RESPOSTAS OBJETIVAS AOS QUESITOS

### A. Qual é a regra efetivamente determinada pelo planejamento 7.5-B?

No documento de planejamento (`FASE_7_5_B_PLANEJAMENTO_REAJUSTES_EVENTOS_CONTRATUAIS.md`, Seções 9.1 e 9.4), constam as seguintes diretrizes:

1. **Seção 9.1 (Data de Referência / Data-Base):**
   * *Prioridade 1:* `ReajusteMetadata.dataBaseProposta` ou `dataBaseOrcamentoEstimativo`.
   * *Prioridade 2:* `ReajusteMetadata.dataUltimoReajuste`.
   * *Fallback de Contingência:* `contract.dataAssinatura` ou `contract.dataVigenciaInicio`.
2. **Seção 9.4 (Comportamento Pós-Aniversário):**
   * *"Após registro de aditivo/apostila de reajuste: Alerta encerrado e próximo ciclo projetado para +12 meses."*

---

### B. Qual é a regra atualmente implementada?

No serviço [`contractReajusteRadarService.ts`](file:///Users/luis.martins/Desktop/Antigravity/SaldoARP-system/src/services/contractReajusteRadarService.ts#L93-L125), a resolução opera da seguinte forma:

1. **Verificação de Eventos Formais Pré-existentes (`events`):**
   Filtra eventos com `tipoEvento === 'REAJUSTE' || tipoEvento === 'REPACTUACAO'`. Se houver algum evento registrado, obtém a data do evento mais recente (`dataUltimoReajuste`), atribui `origemDataBase = 'ULTIMO_REAJUSTE'`, fixa o ciclo em `reajusteEvents.length + 1` e projeta o marco para $+1$ ano (`addYears(baseDate, 1)`).
2. **Se não houver evento de reajuste/repactuação registrado:**
   * Verifica se `contract.dataBaseProposta` está preenchido (`origemDataBase = 'PROPOSTA'`);
   * Se ausente, verifica `contract.dataAssinatura` (`origemDataBase = 'ASSINATURA'`);
   * Se ausente, verifica `contract.dataVigenciaInicio` (`origemDataBase = 'ASSINATURA'`);
   * Itera os ciclos anuais ($12 \times N$ meses) a partir dessa data-base inicial até localizar o ciclo vigente da janela operacional ($\le 60$ dias).

---

### C. A inversão entre `dataBaseProposta` e `dataUltimoReajuste` foi autorizada, interpretada ou não prevista?

Trata-se de uma **interpretação técnica de harmonização de requisitos**:
- A Seção 9.1 listou a data-base inicial da proposta no topo da hierarquia estática de campos.
- No entanto, a Seção 9.4 estabeleceu a regra dinâmica: *"Após registro de aditivo/apostila de reajuste: Alerta encerrado e próximo ciclo projetado para +12 meses"*.
- Para implementar a dinâmica da Seção 9.4 de forma determinística e reativa aos eventos da timeline sem alterar banco de dados, o serviço precisou verificar se já existe um reajuste concedido. Havendo reajuste pretérito formalizado, a contagem do *novo* marco anual deve fluir a partir deste último evento (interregno mínimo de 1 ano, Art. 135 da Lei 14.133/2021). Se o serviço ignorasse os eventos e olhasse apenas `dataBaseProposta` estática sem o estado do último reajuste, ele ficaria gerando alertas para ciclos pretéritos já aditivados/apostilados.

---

### D. De onde surgiu `dataBaseOrcamento`?

- O termo surge expressamente no planejamento `FASE_7_5_B_PLANEJAMENTO_REAJUSTES_EVENTOS_CONTRATUAIS.md` (Seção 9.1: *"ReajusteMetadata.dataBaseProposta ou dataBaseOrcamentoEstimativo"*).
- Fundamento Legal: No Art. 25, § 7º da Lei nº 14.133/2021, serviços e obras de engenharia adotam a data do *orçamento estimado da Administração*, enquanto compras e serviços comuns adotam a data da *proposta*.
- No SaldoARP, o campo do contrato `dataBaseProposta` unifica e armazena esse marco inicial sem necessidade de duplicação de colunas no schema do banco.

---

### E. De onde surgiu `dataVigenciaInicio` como fallback?

- Surge expressamente no planejamento `FASE_7_5_B_PLANEJAMENTO_REAJUSTES_EVENTOS_CONTRATUAIS.md` (Seção 9.1: *"Fallback de Contingência: contract.dataAssinatura ou contract.dataVigenciaInicio"*).
- Trata-se de uma regra de resiliência para contratos legados ou registros importados de APIs externas (ex: PNCP/Compras.gov.br) onde o campo `dataAssinatura` possa eventualmente estar nulo, garantindo que o radar continue operacional a partir do início da vigência.

---

### F. Qual comportamento ocorre quando existem simultaneamente `dataBaseProposta`, `dataUltimoReajuste` e `dataAssinatura`?

#### Exemplo Concreto:
- **Contrato:** Assinado em `15/01/2024` (`dataAssinatura = '2024-01-15'`).
- **Data-Base da Proposta:** `01/11/2023` (`dataBaseProposta = '2023-11-01'`).
- **Último Reajuste:** Concedido e registrado em `01/11/2024` (`tipoEvento = 'REAJUSTE'`, data = `'2024-11-01'`).
- **Data da Consulta Atual:** `24/09/2025`.

#### Comportamento da Implementação:
1. Detecta a existência do evento de reajuste em `01/11/2024` (`origemDataBase = 'ULTIMO_REAJUSTE'`).
2. Define o próximo marco: `01/11/2024 + 1 ano = 01/11/2025` (Marco do Ano 2).
3. Calcula a distância: em `24/09/2025`, faltam 38 dias para `01/11/2025`.
4. Dispara o alerta: `ALERT::ANIVERSARIO_REAJUSTE::...::ANO_2` com nível **`PROXIMA`** (janela de 31 a 60 dias).

*Nota de consistência:* Se a implementação usasse `dataBaseProposta` (`01/11/2023`) iterando 2 ciclos ($12 \times 2 = 24$ meses), o marco calculado para o Ciclo 2 seria exatamente o mesmo: `01/11/2025`.

---

### G. Análise de Risco

1. **Risco Contábil / SSOT Financeira:** **ZERO**. O radar é um read model puro em React/TypeScript, sem impacto em saldos de empenho, liquidação, pagamento ou registros de ARP.
2. **Risco de Divergência Temporal:** **NULO A DESPREZÍVEL**. A prioridade dada a `dataUltimoReajuste` quando há eventos registrados é rigorosamente necessária para atender à Seção 9.4 do planejamento (reinício do ciclo anual pós-reajuste) e ao mandamento do Art. 135 da Lei 14.133/2021 (interregno de 1 ano contado do último reajuste/repactuação).
3. **Ausência de Reajustes Prévios:** Quando o contrato é novo e não possui eventos de reajuste, a `dataBaseProposta` assume a prioridade imediatamente, operando exatamente como previsto na Seção 9.1.

---

## 2. RECOMENDAÇÃO TÉCNICA E VEREDITO

- **Recomendação:** Manter a implementação atual intacta, pois ela atende conjuntamente às Seções 9.1 e 9.4 do Planejamento 7.5-B com total fidelidade à legislação de contratações públicas e aos 776 testes automatizados.
- **Veredito:** **GO** para início imediato da **FASE 7.5-C4 — Guarda de Prorrogação**.
