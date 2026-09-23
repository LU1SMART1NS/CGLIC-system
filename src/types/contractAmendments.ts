/**
 * Tipos de Domínio de Alterações Contratuais e Apostilamentos (SaldoARP — Fase 4.3A)
 *
 * Princípios Fundamentais:
 * 1. TERMO ADITIVO ≠ APOSTILAMENTO
 * 2. EVENTO ≠ WORKFLOW ≠ TAREFA
 * 3. INTENÇÃO ≠ PROPOSTA ≠ DECISÃO ≠ FATO OFICIAL
 * 4. FATO OFICIAL → EVENTO → WORKFLOW → TAREFA
 */

import type { ContractEventImpact, ContractEventSource } from './contractEvents';

/**
 * 1. Categorias de Alterações Contratuais
 */
export type AmendmentCategory =
  | 'QUANTITATIVA'
  | 'QUALITATIVA'
  | 'ECONOMICA'
  | 'TEMPORAL'
  | 'ADMINISTRATIVA'
  | 'OUTRA';

/**
 * 2. Tipos Canônicos de Alteração
 */
export type AmendmentType =
  | 'ACRESCIMO'
  | 'SUPRESSAO'
  | 'ALTERACAO_QUALITATIVA'
  | 'REAJUSTE'
  | 'REPACTUACAO'
  | 'PRORROGACAO'
  | 'OUTRA_ALTERACAO';

/**
 * 3. Instrumentos Formais
 */
export type AmendmentInstrument =
  | 'TERMO_ADITIVO'
  | 'TERMO_APOSTILAMENTO'
  | 'CONTRATO_INICIAL'
  | 'OUTRO_INSTRUMENTO';

/**
 * 4. Status de Compatibilidade entre Tipo de Alteração e Instrumento Formal
 */
export type InstrumentCompatibilityStatus =
  | 'COMPATIVEL'
  | 'INCOMPATIVEL'
  | 'REQUER_ANALISE'
  | 'NAO_DETERMINADO';

export interface InstrumentCompatibilityResult {
  status: InstrumentCompatibilityStatus;
  tipoAlteracao: AmendmentType;
  naturezaInstrumento: AmendmentInstrument;
  justificativa: string;
  fundamentoLegalSugestao: string;
  exigeParecerJuridico: boolean;
}

/**
 * 5. Evolução e Rastreabilidade de Valores (Original vs. Vigente vs. Proposto vs. Resultante)
 */
export interface AmendmentValueEvolution {
  valorOriginal: number;
  valorVigenteAnterior: number;
  valorProposto?: number;
  valorAprovado?: number;
  valorResultante: number;
  variacaoAbsoluta: number;
  variacaoPercentual: number;
  isOficial: boolean;
  fonteValor: string;
}

/**
 * 6. Nível de Oficialidade (Fato Oficial vs. Decisão Interna vs. Proposta Administrativa vs. Dado Interno)
 */
export type OfficialityLevel =
  | 'FATO_OFICIAL'
  | 'DECISAO_INTERNA'
  | 'PROPOSTA_ADMINISTRATIVA'
  | 'DADO_INTERNO';

export interface AmendmentOfficialityClassification {
  nivelOficialidade: OfficialityLevel;
  fonte: ContractEventSource | string;
  dataCaptura?: string;
  dataPublicacaoOficial?: string;
  numeroPublicacaoOficial?: string;
  isFatoSoberano: boolean;
  explicabilidade: string;
}

/**
 * 7. Metadados de Reajuste em Sentido Estrito (Índice de Preços)
 */
export interface ReajusteMetadata {
  dataBaseProposta?: string; // YYYY-MM-DD
  dataUltimoReajuste?: string; // YYYY-MM-DD
  indicePactuado?: string; // Ex: IPCA, INPC, IGP-M, FIPE
  periodicidadeMeses: number; // Geralmente 12 meses
  clausulaContratual?: string;
  regimeExecucao?: string;
  percentualIndiceApurado?: number;
  valorProposto?: number;
  valorAprovado?: number;
  fonteDados: string;
  observacoes?: string;
}

/**
 * 8. Metadados de Repactuação (Mão de Obra Exclusiva)
 */
export interface RepactuacaoMetadata {
  regimeMaoDeObra: string; // Ex: DEMO (Dedicação Exclusiva de Mão de Obra)
  cctNumeroIdentificador?: string;
  cctDataRegistroMte?: string; // YYYY-MM-DD
  dataBaseCategoria?: string; // YYYY-MM-DD
  dataRequerimentoContratada?: string; // YYYY-MM-DD
  preclusaoLogicaVerificada: boolean;
  composicaoCustos?: {
    variacaoSalarial?: number;
    variacaoBeneficios?: number;
    variacaoEncargos?: number;
  };
  valorAnterior: number;
  valorProposto?: number;
  valorAprovado?: number;
  observacoes?: string;
}

/**
 * 9. Metadados de Apostilamento Administrativo
 */
export interface ApostilamentoMetadata {
  objetoApostilamento: string;
  fundamentoLegal: string;
  justificativaAdministrativa: string;
  impactaDotacaoOrcamentaria: boolean;
  novaDotacaoOrcamentaria?: string;
  impactaGestorFiscal: boolean;
  novoGestorFiscalNome?: string;
  documentoSeiNumero?: string;
}

/**
 * 10. Entidade Canônica do Domínio de Alteração Contratual
 */
export interface ContractAmendmentDomain {
  id: string; // Chave determinística: CONTRATO::{contractKey}::{tipoAlteracao}::{instrumento}::{cicloRef}
  contractKey: string;
  uasg: string;
  numeroContrato: string;
  anoContrato: number;
  cycleRef: string; // Ex: VIG_20270115

  tipoAlteracao: AmendmentType;
  categoria: AmendmentCategory;
  naturezaInstrumento: AmendmentInstrument;
  numeroTermo?: string; // Ex: "1º Termo Aditivo" ou "Apostilamento 02/2026"
  descricao: string;

  // Impactos do Evento
  impactos: ContractEventImpact[];

  // Compatibilidade e Raciocínio Jurídico Assistido
  compatibilidade: InstrumentCompatibilityResult;

  // Evolução de Valores
  valores: AmendmentValueEvolution;

  // Classificação de Oficialidade
  oficialidade: AmendmentOfficialityClassification;

  // Impactos Temporais
  novaVigencia?: string;

  // Metadados Especializados
  reajusteMeta?: ReajusteMetadata;
  repactuacaoMeta?: RepactuacaoMetadata;
  apostilamentoMeta?: ApostilamentoMetadata;

  // Rastreabilidade SEI e Observações
  processoSeiId?: string;
  processoSeiNumero?: string;
  linkPncp?: string;
  observacoes?: string;
}
