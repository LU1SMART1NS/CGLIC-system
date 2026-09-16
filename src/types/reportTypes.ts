import type { ArpRecord, ArpItemRecord, ExtendedInternalAllocation } from './index';

export type ReportScope = 'CURRENT_FILTERED' | 'ALL_ATAS' | 'SELECTED_ATA' | 'ALL_ALLOCATIONS';

export type ReportGranularity = 'BY_ATA' | 'BY_ITEM' | 'BY_ALLOCATION' | 'MULTI_SHEET';

export type ReportPreset = 'EXECUTIVE' | 'BALANCES' | 'ALLOCATIONS' | 'PURCHASES' | 'CUSTOM';

export type ColumnGroup = 'ata' | 'item' | 'balance' | 'allocation' | 'contract' | 'link';

export interface ColumnGroupMeta {
  id: ColumnGroup;
  title: string;
  description: string;
}

export interface ReportColumnDef {
  id: string;
  label: string;
  group: ColumnGroup;
  defaultInPresets: ReportPreset[];
  description?: string;
  type: 'string' | 'number' | 'currency' | 'date' | 'percent' | 'link';
  width?: number;
  align?: 'left' | 'center' | 'right';
  getValue: (row: FlattenedReportRow) => any;
}

export interface ReportExportConfig {
  scope: ReportScope;
  granularity: ReportGranularity;
  preset: ReportPreset;
  selectedColumnIds: string[];
  includeHeaderMetadata: boolean;
  includeTotalsSummary: boolean;
  filenamePrefix?: string;
}

export interface FlattenedReportRow {
  // ATA
  numeroAta: string;
  codigoUasg: string;
  nomeUasg: string;
  numeroCompraAno: string;
  modalidade: string;
  objeto: string;
  dataAssinatura: string;
  dataVigenciaInicial: string;
  dataVigenciaFinal: string;
  diasRestantesVigencia: number | null;
  statusVigencia: string;
  valorTotalAta: number;
  totalItensAta: number;
  numeroControlePncpAta: string;
  linkPncpAta: string;
  linkPncpCompra: string;

  // ITEM
  numeroItem: string;
  codigoPdm: number | null;
  descricaoItem: string;
  fornecedorRazaoSocial: string;
  fornecedorCnpj: string;
  classificacaoFornecedor: string;
  tipoItem: string;
  valorUnitario: number;
  quantidadeHomologada: number;
  valorTotalHomologado: number;
  maximoAdesao: number;
  statusAdesao: string;

  // SALDOS / EXECUÇÃO CONTÁBIL
  quantidadeEmpenhada: number;
  valorEmpenhadoTotal: number;
  saldoQuantidade: number;
  saldoValor: number;
  percentualExecutado: number;
  statusSaldo: string;
  statusReconciliacao: string;

  // ALOCAÇÕES INTERNAS
  unidadeNome?: string;
  quantidadeAlocada?: number;
  quantidadeEmpenhadaUnidade?: number;
  saldoUnidade?: number;
  numeroProcessoSei?: string;
  numeroEmpenho?: string;
  dataEmpenho?: string;

  // CONTRATO
  numeroContrato?: string;
  numeroControlePncpContrato?: string;
  dataVigenciaFinalContrato?: string;
  quantidadeContratada?: number;
}

export interface ReportDataPayload {
  atas: ArpRecord[];
  itemsByAta?: Record<string, ArpItemRecord[]>;
  allocationsByItem?: Record<string, ExtendedInternalAllocation[]>;
  selectedAta?: ArpRecord | null;
  activeFiltersDesc?: string;
}
