/**
 * Tipos e Modelos de Read Model para Evolução do Valor Contratual (SaldoARP — Fase 7.5-C1)
 *
 * Princípios Fundamentais:
 * 1. Projeção determinística em memória e imutável (ValorVigente = ValorOriginal + Σ DeltaValor);
 * 2. Precisão monetária estrita em centavos (2 casas decimais);
 * 3. Separação de Domínios: Evento Contratual ≠ Empenho/Financeiro ≠ Saldo Físico da Ata.
 */

import type {
  ContractEventType,
  ContractEventNature,
  ContractEventImpact,
  ContractEventSource
} from './contractEvents';
import type { OfficialityLevel } from './contractAmendments';

/**
 * Item auditável da composição da evolução de valor
 */
export interface ContractValueEvolutionEventItem {
  eventoId: string;
  tipoEvento: ContractEventType;
  identificadorOficial: string;
  descricao: string;
  dataEfeito: string; // YYYY-MM-DD
  impacto: ContractEventImpact;
  impactoMonetario: boolean;
  deltaValor: number; // Variação monetária líquida com sinal (+ ou -)
  valorAnterior: number;
  valorResultante: number;
  instrumento: ContractEventNature;
  oficialidade: OfficialityLevel;
  fonteOrigem: ContractEventSource | string;
  linkPncp?: string;
  processoSeiNumero?: string;
}

/**
 * Read Model canônico e determinístico de Evolução e Projeção do Valor Contratual
 */
export interface ContractValueEvolutionReadModel {
  contractKey: string;
  uasg?: string;
  numeroContrato?: string;
  anoContrato?: number;
  valorOriginal: number;
  valorVigente: number;
  deltaAcumulado: number;
  percentualVariacaoAcumulada: number;
  totalAcrescimos: number;
  totalSupressoes: number;
  totalReajustes: number;
  totalRepactuacoes: number;
  totalReequilibrios: number;
  totalOutrosAditivos: number;
  totalEventosConsiderados: number;
  totalEventosMonetarios: number;
  dataUltimoEventoRelevante?: string;
  eventos: ContractValueEvolutionEventItem[];
}
