/**
 * Tipos Canônicos para Normalização, Reconciliação, Sincronização e Orquestração de Empenhos
 * Conforme especificado nas FASES 7.2-F, 7.2-G, 7.2-H e implementado na FASE 7.2-I (SaldoARP 3.0).
 */

export type EmpenhoFonteOrigem = 'COMPRASNET' | 'CONTRATOSNET' | 'PNCP' | 'MANUAL' | 'SINCRONIZADO';

export type TipoConflitoReconciliacao =
  | 'IDENTIDADE'
  | 'VALOR'
  | 'DATA'
  | 'CREDOR'
  | 'QUANTIDADE'
  | 'VINCULO_CONTRATO'
  | 'VINCULO_ITEM';

export interface ConflitoCampo {
  campo: string;
  tipo: TipoConflitoReconciliacao;
  valor_primario: any;
  valor_secundario: any;
  fonte_primaria: string;
  fonte_secundaria: string;
  resolvido_automaticamente: boolean;
  descricao: string;
}

export interface NormalizedItemLink {
  item_key: string;
  quantidade_consumida: number;
  tipo_consumo?: 'ORDINARIO' | 'REFORCO' | 'AJUSTE_MANUAL';
  numero_item_minuta?: string;
  observacoes?: string;
  is_deduzido?: boolean;
}

export interface NormalizedContractLink {
  contract_key: string;
  valor_vinculado?: number;
}

export interface VinculoPendente {
  tipo: 'ITEM' | 'CONTRATO';
  motivo: string;
  contexto?: Record<string, any>;
}

/**
 * Representação transitória em memória de uma leitura de empenho por um Adapter
 */
export interface NormalizedEmpenho {
  canonical_key: string;
  uasg: string;
  ano: number;
  numero_oficial: string;
  numero_normalizado: string;
  data_emissao?: string;
  valor_empenhado?: number;
  valor_liquidado?: number;
  valor_pago?: number;
  valor_rpinscrito?: number;
  valor_rp_a_liquidar?: number;
  valor_rp_liquidado?: number;
  valor_rp_pago?: number;
  credor_nome?: string;
  credor_cnpj_cpf?: string;
  situacao?: string;
  fonte_origem: EmpenhoFonteOrigem;
  identificador_fonte?: string;
  url_oficial?: string;
  item_links?: NormalizedItemLink[];
  contract_links?: NormalizedContractLink[];
  vinculos_pendentes?: VinculoPendente[];
  warnings?: string[];
}

/**
 * Resultado da reconciliação determinística consolidando múltiplas leituras
 */
export interface EmpenhoReconciliado {
  canonical_key: string;
  uasg: string;
  ano: number;
  numero_oficial: string;
  numero_normalizado: string;
  data_emissao: string;
  valor_empenhado: number;
  valor_liquidado: number;
  valor_pago: number;
  valor_rpinscrito: number;
  valor_rp_a_liquidar?: number;
  valor_rp_liquidado?: number;
  valor_rp_pago?: number;
  credor_nome?: string;
  credor_cnpj_cpf?: string;
  situacao?: string;
  fonte_origem: EmpenhoFonteOrigem;
  identificador_fonte?: string;
  url_oficial?: string;
  status_reconciliacao: 'CONFIRMADO' | 'PENDENTE' | 'DIVERGENTE';
  fontes_consultadas: EmpenhoFonteOrigem[];
  conflitos: ConflitoCampo[];
  item_links: NormalizedItemLink[];
  contract_links: NormalizedContractLink[];
  vinculos_pendentes: VinculoPendente[];
}

export interface EmpenhoSyncSummary {
  total_processados: number;
  total_salvos: number;
  total_itens_vinculados: number;
  total_contratos_vinculados: number;
  total_conflitos: number;
  erros: Array<{ canonical_key?: string; erro: string }>;
  reconciliados: EmpenhoReconciliado[];
}

// -----------------------------------------------------------------------------
// CAMADA DE ORQUESTRAÇÃO ON-DEMAND (FASE 7.2-I)
// -----------------------------------------------------------------------------

export type OrchestrationTargetType = 'ITEM' | 'ATA' | 'CONTRATO' | 'EMPENHO';

export type OrchestrationStatus =
  | 'SUCESSO'
  | 'SUCESSO_PARCIAL'
  | 'SEM_DADOS'
  | 'COM_DIVERGENCIAS'
  | 'ERRO';

export interface ItemTarget {
  tipo: 'ITEM';
  itemKey: string;
  unitPrice?: number;
  contracts?: Array<{
    contratoId?: number | string;
    contractKey: string;
    cnpj?: string;
    ano?: number | string;
    sequencialContrato?: number | string;
    unitPrice?: number;
    historicoPrecos?: Array<{ dataTermo: string; valorUnitario: number }>;
  }>;
}

export interface AtaTarget {
  tipo: 'ATA';
  numeroAta: string;
  uasg: string;
  itemNumbers?: string[];
  concurrencyLimit?: number;
}

export interface ContractTarget {
  tipo: 'CONTRATO';
  contractKey: string;
  contratoId?: number | string;
  pncpParams?: {
    cnpj: string;
    ano: number | string;
    sequencialContrato: number | string;
  };
  uasg?: string;
  itemContext?: {
    numeroAta: string;
    uasg: string;
    numeroItem: string;
  };
}

export interface EmpenhoTarget {
  tipo: 'EMPENHO';
  canonicalKey: string;
  contextHints?: {
    numeroAta?: string;
    uasg?: string;
    numeroItem?: string;
    contractKey?: string;
    contratoId?: number | string;
  };
}

export type OrchestrationTarget = ItemTarget | AtaTarget | ContractTarget | EmpenhoTarget;

export interface OrchestrationResult {
  alvo: OrchestrationTarget;
  status: OrchestrationStatus;
  fontes_consultadas: EmpenhoFonteOrigem[];
  fontes_nao_aplicaveis: string[];
  empenhos_encontrados: number;
  empenhos_persistidos: number;
  empenhos_atualizados: number;
  vinculos_item_criados: number;
  vinculos_contrato_criados: number;
  divergencias: ConflitoCampo[];
  pendencias: VinculoPendente[];
  erros: Array<{ origem?: string; erro: string }>;
  resumo_sync: EmpenhoSyncSummary;
  executado_em: string;
}
