# SALDOARP — RELATÓRIO DE CORREÇÃO DO ACHADO ACH-5.3-01

## Correção da Precedência de Oficialidade na Linha do Tempo Contratual

---

### 1. Causa Raiz
Na implementação inicial da Fase 5.3, a função `getOficialidadeInfo` (`src/components/contracts/ContractEventsTimeline.tsx`) continha a seguinte condicional antes da verificação de fontes oficiais:

```ts
if (fonte === 'SEI' || event.processoSeiNumero) {
  return {
    level: 'DECISAO_INTERNA',
    label: 'Decisão interna',
    ...
  };
}
```

Como a função canônica de mapeamento `buildContractEventsFromOfficialData` (`src/services/contractEventService.ts`) propaga o número do processo administrativo para o evento (`processoSeiNumero: contract.processo`), qualquer contrato oficial originado no PNCP ou Contratos.gov.br que possuísse processo administrativo cadastrado tinha a propriedade `processoSeiNumero` preenchida.

Com isso, a verificação interceptava o evento antes de avaliar se a fonte era `PNCP`, `Contratos.gov.br` ou se possuía `numeroControlePncp`, rebaixando erroneamente eventos oficiais para "Decisão interna".

---

### 2. Correção Realizada
A precedência em `getOficialidadeInfo` foi corrigida para garantir que a evidência de fonte oficial seja avaliada com prioridade sobre indicadores internos de processo:

```ts
// 1. Proposta Administrativa
if (desc.includes('PROPOSTA') || desc.includes('ESTUDO PRELIMINAR') || desc.includes('MINUTA')) {
  return {
    level: 'PROPOSTA_ADMINISTRATIVA',
    label: 'Proposta administrativa',
    ...
  };
}

// 2. Fato Oficial (Precedência Obrigatória)
const hasOfficialEvidence =
  fonte === 'PNCP' ||
  fonte === 'CONTRATOS.GOV.BR' ||
  fonte === 'COMPRAS.GOV.BR' ||
  Boolean(event.numeroControlePncp || event.linkPncp || event.dataPublicacao);

if (hasOfficialEvidence) {
  return {
    level: 'FATO_OFICIAL',
    label: 'Fato oficial',
    ...
  };
}

// 3. Decisão Interna (Apenas na ausência de evidência oficial)
if (fonte === 'SEI' || Boolean(event.processoSeiNumero)) {
  return {
    level: 'DECISAO_INTERNA',
    label: 'Decisão interna',
    ...
  };
}

// 4. Registro Interno (Fallback padrão)
return {
  level: 'DADO_INTERNO',
  label: 'Registro interno',
  ...
};
```

---

### 3. Arquivos Alterados
1. `src/components/contracts/ContractEventsTimeline.tsx`: Ajuste da ordem lógica de precedência da função `getOficialidadeInfo`.
2. `src/components/contracts/__tests__/ContractEventsTimeline.test.ts`: Inclusão dos 6 testes obrigatórios de comprovação e regressão.

---

### 4. Testes Adicionados
Foram adicionados os 6 testes estritos solicitados:
- **TESTE 1**: `fonte = 'PNCP'` + `processoSeiNumero` presente $\longrightarrow$ classificado como `FATO_OFICIAL` (e NÃO `DECISAO_INTERNA`).
- **TESTE 2**: `fonte = 'Contratos.gov.br'` + `processoSeiNumero` presente $\longrightarrow$ classificado como `FATO_OFICIAL`.
- **TESTE 3**: `numeroControlePncp` presente + `processoSeiNumero` presente $\longrightarrow$ classificado como `FATO_OFICIAL`.
- **TESTE 4**: `fonte = 'SEI'` sem fonte oficial $\longrightarrow$ classificado como `DECISAO_INTERNA`.
- **TESTE 5**: `processoSeiNumero` isolado sem fonte oficial $\longrightarrow$ classificado como `DECISAO_INTERNA`.
- **TESTE 6**: Regressão comprovando `DADO_INTERNO` quando não há fonte oficial nem processo SEI.

---

### 5. Resultados de Validação

```bash
npm test -- --run
npm run build
npm run lint
git status --short
```

* **Vitest**: 61/61 arquivos PASS | **545/545 testes PASS** (100% verde).
* **TypeScript / Build**: `tsc -b && vite build` PASS (0 erros).
* **Linter**: `oxlint` PASS (0 erros).
* **Zero Migrations**: Nenhuma migration criada.
* **Zero RPCs**: Nenhuma RPC criada ou modificada.
* **RLS Inalterado**: Nenhuma alteração de segurança ou permissão.
* **Zero Alteração de Domínio**: Domínio canônico `ContractEvent` preservado intacto.

---

### 6. Parecer de Conclusão da Correção

O achado `ACH-5.3-01` foi **100% corrigido e validado com testes automatizados**.

A Fase 5.3 encontra-se em conformidade arquitetural estrita.
