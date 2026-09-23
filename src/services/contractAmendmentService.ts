/**
 * Serviço de Domínio para Alterações Contratuais e Apostilamentos (SaldoARP — Fase 4.3A)
 *
 * Funções Puras e Determinísticas:
 * 1. Classificação de Tipos e Categorias de Alterações e Instrumentos;
 * 2. Matriz de Compatibilidade Jurídica Assistida (Art. 124, 135 e 136 da Lei 14.133/2021);
 * 3. Rastreabilidade de Evolução de Valores (Original vs. Vigente vs. Proposto vs. Resultante);
 * 4. Classificação de Oficialidade de Dados (Fato Oficial vs. Decisão vs. Proposta);
 * 5. Avaliação Assistida de Limites Quantitativos (Consumindo `calculateAditamentoLimits`);
 * 6. Construção da Entidade Canônica de Alteração e Mapeamento para Eventos Formais.
 */

import type {
  AmendmentType,
  AmendmentCategory,
  AmendmentInstrument,
  InstrumentCompatibilityResult,
  AmendmentValueEvolution,
  AmendmentOfficialityClassification,
  ContractAmendmentDomain
} from '../types/contractAmendments';
import type {
  ContractEvent,
  ContractEventImpact,
  AditamentoLimitEvaluation
} from '../types/contractEvents';
import {
  generateIdempotentEventId,
  calculateAditamentoLimits
} from './contractEventService';

/**
 * 1. Classifica a categoria, tipo de alteração, instrumento formal e múltiplos impactos.
 */
export function classifyAmendment(params: {
  tipoOuDescricao?: string;
  variacaoValor?: number;
  novaVigencia?: string;
  vigenciaAnterior?: string;
  isApostilamento?: boolean;
  isQualitativa?: boolean;
  isRepactuacao?: boolean;
  isReajuste?: boolean;
}): {
  tipoAlteracao: AmendmentType;
  categoria: AmendmentCategory;
  naturezaInstrumento: AmendmentInstrument;
  impactos: ContractEventImpact[];
} {
  const desc = (params.tipoOuDescricao || '').toLowerCase();
  const impactos: ContractEventImpact[] = [];

  // A) Prorrogação de Vigência
  const hasVigenciaChange = Boolean(params.novaVigencia && params.vigenciaAnterior && params.novaVigencia !== params.vigenciaAnterior);
  if (desc.includes('prorroga') || desc.includes('renova') || desc.includes('vigência') || hasVigenciaChange) {
    impactos.push('ALTERA_VIGENCIA');
    if (params.variacaoValor && params.variacaoValor !== 0) {
      impactos.push('ALTERA_VALOR');
    }
    return {
      tipoAlteracao: 'PRORROGACAO',
      categoria: 'TEMPORAL',
      naturezaInstrumento: 'TERMO_ADITIVO',
      impactos
    };
  }

  // B) Repactuação de Mão de Obra
  if (params.isRepactuacao || desc.includes('repactua') || desc.includes('convenção coletiva') || desc.includes('cct') || desc.includes('dissídio')) {
    impactos.push('ALTERA_VALOR');
    return {
      tipoAlteracao: 'REPACTUACAO',
      categoria: 'ECONOMICA',
      naturezaInstrumento: 'TERMO_ADITIVO',
      impactos
    };
  }

  // C) Reajuste por Índice de Preços
  if (params.isReajuste || desc.includes('reajuste') || desc.includes('ipca') || desc.includes('inpc') || desc.includes('igp-m')) {
    impactos.push('ALTERA_VALOR');
    return {
      tipoAlteracao: 'REAJUSTE',
      categoria: 'ECONOMICA',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO',
      impactos
    };
  }

  // D) Alteração Qualitativa
  if (params.isQualitativa || desc.includes('qualitativ') || desc.includes('especificaç') || desc.includes('metodologia') || desc.includes('projeto')) {
    impactos.push('ATUALIZA_DADOS');
    if (params.variacaoValor && params.variacaoValor !== 0) {
      impactos.push('ALTERA_VALOR');
    }
    return {
      tipoAlteracao: 'ALTERACAO_QUALITATIVA',
      categoria: 'QUALITATIVA',
      naturezaInstrumento: 'TERMO_ADITIVO',
      impactos
    };
  }

  // E) Alterações Quantitativas (Acréscimo / Supressão)
  if (params.variacaoValor !== undefined && params.variacaoValor !== 0) {
    impactos.push('ALTERA_QUANTITATIVO');
    impactos.push('ALTERA_VALOR');
    if (params.variacaoValor > 0 || desc.includes('acréscimo') || desc.includes('aditamento de valor')) {
      return {
        tipoAlteracao: 'ACRESCIMO',
        categoria: 'QUANTITATIVA',
        naturezaInstrumento: 'TERMO_ADITIVO',
        impactos
      };
    } else {
      return {
        tipoAlteracao: 'SUPRESSAO',
        categoria: 'QUANTITATIVA',
        naturezaInstrumento: 'TERMO_ADITIVO',
        impactos
      };
    }
  }

  // F) Apostilamento Administrativo
  if (params.isApostilamento || desc.includes('apostilamento') || desc.includes('apostila') || desc.includes('dotação') || desc.includes('fiscal')) {
    impactos.push('ATUALIZA_DADOS');
    return {
      tipoAlteracao: 'OUTRA_ALTERACAO',
      categoria: 'ADMINISTRATIVA',
      naturezaInstrumento: 'TERMO_APOSTILAMENTO',
      impactos
    };
  }

  // G) Default
  impactos.push('SEM_IMPACTO_FINANCEIRO_TEMPORAL');
  return {
    tipoAlteracao: 'OUTRA_ALTERACAO',
    categoria: 'OUTRA',
    naturezaInstrumento: 'OUTRO_INSTRUMENTO',
    impactos
  };
}

/**
 * 2. Matriz de Compatibilidade Jurídica Assistida entre Tipo de Alteração e Instrumento Formal.
 * Conforme arts. 124, 135 e 136 da Lei nº 14.133/2021.
 * ATENÇÃO: Verificação assistida e orientativa, NUNCA bloqueio automático.
 */
export function evaluateInstrumentCompatibility(
  tipoAlteracao: AmendmentType,
  instrumento: AmendmentInstrument
): InstrumentCompatibilityResult {
  // A) Acréscimo Quantitativo
  if (tipoAlteracao === 'ACRESCIMO') {
    if (instrumento === 'TERMO_ADITIVO') {
      return {
        status: 'COMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Acréscimo quantitativo formalizado por Termo Aditivo bilateral (art. 124, I, "b" da Lei 14.133/21).',
        fundamentoLegalSugestao: 'Art. 124, I, "b" da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
    if (instrumento === 'TERMO_APOSTILAMENTO') {
      return {
        status: 'INCOMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Incompatível: Acréscimo de objeto ou valor altera o encargo das partes e é nulo se feito por simples apostilamento. Exige Termo Aditivo bilateral.',
        fundamentoLegalSugestao: 'Art. 124, I c/c Art. 136 da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
  }

  // B) Supressão Quantitativa
  if (tipoAlteracao === 'SUPRESSAO') {
    if (instrumento === 'TERMO_ADITIVO') {
      return {
        status: 'COMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Supressão quantitativa formalizada por Termo Aditivo (art. 124, I, "b" da Lei 14.133/21).',
        fundamentoLegalSugestao: 'Art. 124, I, "b" c/c Art. 126 da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
    if (instrumento === 'TERMO_APOSTILAMENTO') {
      return {
        status: 'INCOMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Incompatível: Supressão quantitativa de contrato não pode ser formalizada por apostilamento. Exige Termo Aditivo.',
        fundamentoLegalSugestao: 'Art. 124, I c/c Art. 136 da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
  }

  // C) Alteração Qualitativa
  if (tipoAlteracao === 'ALTERACAO_QUALITATIVA') {
    if (instrumento === 'TERMO_ADITIVO') {
      return {
        status: 'COMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Alteração qualitativa (projeto, especificações ou metodologia) formalizada por Termo Aditivo (art. 124, I, "a").',
        fundamentoLegalSugestao: 'Art. 124, I, "a" da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
    if (instrumento === 'TERMO_APOSTILAMENTO') {
      return {
        status: 'INCOMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Incompatível: Alterações de especificações de projeto não podem ser formalizadas por simples apostila.',
        fundamentoLegalSugestao: 'Art. 124, I, "a" da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
  }

  // D) Prorrogação de Vigência
  if (tipoAlteracao === 'PRORROGACAO') {
    if (instrumento === 'TERMO_ADITIVO') {
      return {
        status: 'COMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Prorrogação de vigência formalizada por Termo Aditivo bilateral (art. 106/107 da Lei 14.133/21).',
        fundamentoLegalSugestao: 'Art. 106 e 107 da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
    if (instrumento === 'TERMO_APOSTILAMENTO') {
      return {
        status: 'INCOMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Incompatível: Prorrogação de prazo de vigência contratual exige Termo Aditivo bilateral antes do vencimento.',
        fundamentoLegalSugestao: 'Art. 106 c/c Art. 136 da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
  }

  // E) Reajuste em Sentido Estrito (Índice de Preços)
  if (tipoAlteracao === 'REAJUSTE') {
    if (instrumento === 'TERMO_APOSTILAMENTO') {
      return {
        status: 'COMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Aplicação do índice de reajuste contratual formalizada por simples Termo de Apostilamento (art. 136, I). Dispensa parecer jurídico prévio.',
        fundamentoLegalSugestao: 'Art. 136, I da Lei nº 14.133/2021',
        exigeParecerJuridico: false
      };
    }
    if (instrumento === 'TERMO_ADITIVO') {
      return {
        status: 'REQUER_ANALISE',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Requer Análise: A regra legal prevê apostilamento para reajuste de índice. Termo aditivo é admissível se houver alteração de cláusula de reajuste ou aditamento conjunto.',
        fundamentoLegalSugestao: 'Art. 136, I da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
  }

  // F) Repactuação de Mão de Obra
  if (tipoAlteracao === 'REPACTUACAO') {
    if (instrumento === 'TERMO_ADITIVO') {
      return {
        status: 'COMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Repactuação de custos de mão de obra exclusiva decorrente de CCT formalizada por Termo Aditivo (art. 135).',
        fundamentoLegalSugestao: 'Art. 135 da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
    if (instrumento === 'TERMO_APOSTILAMENTO') {
      return {
        status: 'INCOMPATIVEL',
        tipoAlteracao,
        naturezaInstrumento: instrumento,
        justificativa: 'Incompatível: Repactuação exige análise da planilha de custos e formação de preços, não sendo mero cálculo de índice automático. Exige Termo Aditivo.',
        fundamentoLegalSugestao: 'Art. 135 da Lei nº 14.133/2021',
        exigeParecerJuridico: true
      };
    }
  }

  // G) Outras Alterações Administrativas
  if (instrumento === 'TERMO_APOSTILAMENTO') {
    return {
      status: 'REQUER_ANALISE',
      tipoAlteracao,
      naturezaInstrumento: instrumento,
      justificativa: 'Requer Análise: Apostilamento é cabível para dotação orçamentária, alteração de fiscal/gestor, retificação de erro material ou compensações do art. 136.',
      fundamentoLegalSugestao: 'Art. 136 da Lei nº 14.133/2021',
      exigeParecerJuridico: false
    };
  }

  return {
    status: 'REQUER_ANALISE',
    tipoAlteracao,
    naturezaInstrumento: instrumento,
    justificativa: 'Caso concreto exige análise da instrução processual e enquadramento nos arts. 124 a 136 da Lei 14.133/2021.',
    fundamentoLegalSugestao: 'Lei nº 14.133/2021',
    exigeParecerJuridico: true
  };
}

/**
 * 3. Rastreabilidade e Cálculo da Evolução de Valores (Original vs. Vigente vs. Proposto vs. Resultante).
 */
export function calculateAmendmentValueEvolution(params: {
  valorOriginal: number;
  valorVigenteAnterior: number;
  valorProposto?: number;
  valorAprovado?: number;
  isOficial?: boolean;
  fonteValor?: string;
}): AmendmentValueEvolution {
  const valorOriginal = Math.max(0, params.valorOriginal || 0);
  const valorVigenteAnterior = Math.max(0, params.valorVigenteAnterior || 0);

  // O valor resultante adota o valor aprovado se existente, senão o valor vigente anterior
  const valorResultante = params.valorAprovado !== undefined
    ? Math.max(0, params.valorAprovado)
    : (params.valorProposto !== undefined ? Math.max(0, params.valorProposto) : valorVigenteAnterior);

  const variacaoAbsoluta = valorResultante - valorVigenteAnterior;
  const variacaoPercentual = valorVigenteAnterior > 0 ? (variacaoAbsoluta / valorVigenteAnterior) * 100 : 0;

  return {
    valorOriginal,
    valorVigenteAnterior,
    valorProposto: params.valorProposto,
    valorAprovado: params.valorAprovado,
    valorResultante,
    variacaoAbsoluta,
    variacaoPercentual,
    isOficial: Boolean(params.isOficial),
    fonteValor: params.fonteValor || 'SaldoARP (Instrução Interna)'
  };
}

/**
 * 4. Classificação do Nível de Oficialidade dos Dados.
 */
export function classifyOfficiality(params: {
  fonte: string;
  dataPublicacaoOficial?: string;
  numeroPublicacaoOficial?: string;
  isFatoSoberano?: boolean;
}): AmendmentOfficialityClassification {
  const fonteLower = (params.fonte || '').toLowerCase();
  const isSoberano = Boolean(params.isFatoSoberano || fonteLower.includes('pncp') || fonteLower.includes('contratos.gov') || fonteLower.includes('compras.gov'));

  if (isSoberano && (params.dataPublicacaoOficial || params.numeroPublicacaoOficial)) {
    return {
      nivelOficialidade: 'FATO_OFICIAL',
      fonte: params.fonte,
      dataPublicacaoOficial: params.dataPublicacaoOficial,
      numeroPublicacaoOficial: params.numeroPublicacaoOficial,
      isFatoSoberano: true,
      explicabilidade: 'Dado confirmado oficialmente na fonte soberana de publicação (PNCP / Contratos.gov.br).'
    };
  }

  if (params.dataPublicacaoOficial || params.numeroPublicacaoOficial) {
    return {
      nivelOficialidade: 'DECISAO_INTERNA',
      fonte: params.fonte,
      dataPublicacaoOficial: params.dataPublicacaoOficial,
      numeroPublicacaoOficial: params.numeroPublicacaoOficial,
      isFatoSoberano: false,
      explicabilidade: 'Ato formalizado internamente (SEI/SaldoARP), aguardando sincronização oficial das APIs.'
    };
  }

  return {
    nivelOficialidade: 'PROPOSTA_ADMINISTRATIVA',
    fonte: params.fonte || 'SaldoARP (Instrução)',
    isFatoSoberano: false,
    explicabilidade: 'Informação em fase de instrução ou proposta administrativa, sem eficácia jurídica oficial concluída.'
  };
}

/**
 * 5. Avaliação Assistida de Limites Quantitativos de Aditamento.
 * Reutiliza estritamente a função `calculateAditamentoLimits` de `contractEventService.ts`.
 */
export function evaluateAmendmentLimits(params: {
  valorInicialAtualizado: number;
  acrescimos: number | number[];
  supressoes: number | number[];
  isReforma?: boolean;
}): AditamentoLimitEvaluation {
  return calculateAditamentoLimits(params);
}

/**
 * 6. Constrói a Entidade Canônica de Alteração Contratual do Domínio.
 */
export function buildContractAmendmentDomain(params: {
  contractKey: string;
  uasg: string;
  numeroContrato: string;
  anoContrato: number;
  cycleRef: string;
  tipoAlteracao: AmendmentType;
  categoria: AmendmentCategory;
  naturezaInstrumento: AmendmentInstrument;
  numeroTermo?: string;
  descricao: string;
  impactos?: ContractEventImpact[];
  valores: AmendmentValueEvolution;
  oficialidade: AmendmentOfficialityClassification;
  novaVigencia?: string;
  processoSeiId?: string;
  processoSeiNumero?: string;
  linkPncp?: string;
  observacoes?: string;
}): ContractAmendmentDomain {
  const {
    contractKey,
    uasg,
    numeroContrato,
    anoContrato,
    cycleRef,
    tipoAlteracao,
    categoria,
    naturezaInstrumento,
    numeroTermo,
    descricao,
    impactos = ['SEM_IMPACTO_FINANCEIRO_TEMPORAL'],
    valores,
    oficialidade,
    novaVigencia,
    processoSeiId,
    processoSeiNumero,
    linkPncp,
    observacoes
  } = params;

  const id = generateIdempotentEventId({
    contractKey,
    tipoEvento: tipoAlteracao === 'ALTERACAO_QUALITATIVA' || tipoAlteracao === 'OUTRA_ALTERACAO'
      ? (naturezaInstrumento === 'TERMO_APOSTILAMENTO' ? 'APOSTILAMENTO' : 'ACRESCIMO')
      : (tipoAlteracao as any),
    identificadorOficial: numeroTermo || 'ALTERACAO',
    cicloRef: cycleRef
  });


  const compatibilidade = evaluateInstrumentCompatibility(tipoAlteracao, naturezaInstrumento);

  return {
    id,
    contractKey,
    uasg,
    numeroContrato,
    anoContrato,
    cycleRef,
    tipoAlteracao,
    categoria,
    naturezaInstrumento,
    numeroTermo,
    descricao,
    impactos,
    compatibilidade,
    valores,
    oficialidade,
    novaVigencia,
    processoSeiId,
    processoSeiNumero,
    linkPncp,
    observacoes
  };
}

/**
 * 7. Mapeia a Entidade Canônica de Alteração para o Evento Formal (`ContractEvent`).
 */
export function buildAmendmentEvent(amendment: ContractAmendmentDomain): ContractEvent {
  const mapTipoEvento = (): any => {
    if (amendment.tipoAlteracao === 'ALTERACAO_QUALITATIVA' || amendment.tipoAlteracao === 'OUTRA_ALTERACAO') {
      return amendment.naturezaInstrumento === 'TERMO_APOSTILAMENTO' ? 'APOSTILAMENTO' : 'ACRESCIMO';
    }
    return amendment.tipoAlteracao;
  };

  return {
    id: amendment.id,
    contractKey: amendment.contractKey,
    uasg: amendment.uasg,
    numeroContrato: amendment.numeroContrato,
    anoContrato: amendment.anoContrato,
    tipoEvento: mapTipoEvento(),
    naturezaInstrumento: amendment.naturezaInstrumento === 'OUTRO_INSTRUMENTO' ? 'REGISTRO_ADMINISTRATIVO' : amendment.naturezaInstrumento,
    identificadorOficial: amendment.numeroTermo || 'Termo de Alteração',
    descricao: amendment.descricao,
    impacto: amendment.impactos[0] || 'SEM_IMPACTO_FINANCEIRO_TEMPORAL',
    vigenciaAnterior: undefined,
    vigenciaPosterior: amendment.novaVigencia,
    valorAnterior: amendment.valores.valorVigenteAnterior,
    valorPosterior: amendment.valores.valorResultante,
    variacaoValor: amendment.valores.variacaoAbsoluta,
    percentualVariacaoValor: amendment.valores.variacaoPercentual,
    fonteOrigem: (amendment.oficialidade.fonte as any) || 'SaldoARP',
    processoSeiNumero: amendment.processoSeiNumero,
    linkPncp: amendment.linkPncp,
    capturedAt: new Date().toISOString()
  };
}
