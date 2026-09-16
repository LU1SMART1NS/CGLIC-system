import ExcelJS from 'exceljs';
import type { 
  ReportExportConfig, 
  ReportDataPayload, 
  ReportColumnDef, 
  ColumnGroupMeta, 
  FlattenedReportRow, 
  ReportPreset 
} from '../types/reportTypes';
import { fetchManualEmpenhos, fetchManualContratos, fetchAllocations } from './allocationService';

// ============================================================================
// METADADOS DE GRUPOS DE COLUNAS
// ============================================================================
export const COLUMN_GROUPS: ColumnGroupMeta[] = [
  { id: 'ata', title: 'Dados da Ata (ARP)', description: 'Número, UASG, Órgão, vigências e links PNCP' },
  { id: 'item', title: 'Dados do Item & Fornecedor', description: 'Número, PDM, descrição, fornecedor e valores homologados' },
  { id: 'balance', title: 'Saldos & Execução Contábil', description: 'Quantidade empenhada, saldo disponível, % executado e conciliação' },
  { id: 'allocation', title: 'Alocações por Departamento (SENASP)', description: 'Cotas por diretoria, empenhos da unidade e processos SEI' },
  { id: 'contract', title: 'Contratos & PNCP', description: 'Número de contrato, PNCP e vigência contratual' },
  { id: 'link', title: 'Links Oficiais', description: 'URLs diretas para o PNCP e Compras.gov.br' }
];

// ============================================================================
// CATÁLOGO UNIVERSAL DE COLUNAS PARAMETRIZÁVEIS
// ============================================================================
export const ALL_REPORT_COLUMNS: ReportColumnDef[] = [
  // --- GRUPO ATA ---
  {
    id: 'numeroAta',
    label: 'Nº da Ata',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE', 'BALANCES', 'ALLOCATIONS', 'PURCHASES'],
    description: 'Número identificador da Ata de Registro de Preços',
    type: 'string',
    width: 16,
    align: 'center',
    getValue: (r) => r.numeroAta
  },
  {
    id: 'codigoUasg',
    label: 'Cód. UASG',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE', 'BALANCES', 'ALLOCATIONS', 'PURCHASES'],
    description: 'Código da Unidade Gerenciadora (ex: 200005)',
    type: 'string',
    width: 14,
    align: 'center',
    getValue: (r) => r.codigoUasg
  },
  {
    id: 'nomeUasg',
    label: 'Órgão / UASG Gerenciadora',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE', 'BALANCES', 'ALLOCATIONS'],
    description: 'Nome da Unidade Gestora Responsável',
    type: 'string',
    width: 35,
    align: 'left',
    getValue: (r) => r.nomeUasg
  },
  {
    id: 'objeto',
    label: 'Objeto da Ata',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE', 'PURCHASES'],
    description: 'Descrição sucinta do objeto licitado',
    type: 'string',
    width: 45,
    align: 'left',
    getValue: (r) => r.objeto
  },
  {
    id: 'numeroCompraAno',
    label: 'Pregão / Compra',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE', 'BALANCES', 'PURCHASES'],
    description: 'Número e ano da compra de origem (ex: 90001/2025)',
    type: 'string',
    width: 18,
    align: 'center',
    getValue: (r) => r.numeroCompraAno
  },
  {
    id: 'modalidade',
    label: 'Modalidade',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE'],
    description: 'Modalidade de contratação (ex: Pregão Eletrônico)',
    type: 'string',
    width: 20,
    align: 'left',
    getValue: (r) => r.modalidade
  },
  {
    id: 'dataVigenciaInicial',
    label: 'Vigência Início',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE', 'BALANCES', 'ALLOCATIONS', 'PURCHASES'],
    description: 'Data de início da vigência da Ata',
    type: 'date',
    width: 16,
    align: 'center',
    getValue: (r) => r.dataVigenciaInicial
  },
  {
    id: 'dataVigenciaFinal',
    label: 'Vigência Fim',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE', 'BALANCES', 'ALLOCATIONS', 'PURCHASES'],
    description: 'Data de término da vigência da Ata',
    type: 'date',
    width: 16,
    align: 'center',
    getValue: (r) => r.dataVigenciaFinal
  },
  {
    id: 'diasRestantesVigencia',
    label: 'Dias Restantes',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE', 'BALANCES'],
    description: 'Dias restantes de vigência até a expiração',
    type: 'number',
    width: 16,
    align: 'right',
    getValue: (r) => r.diasRestantesVigencia ?? ''
  },
  {
    id: 'statusVigencia',
    label: 'Status Vigência',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE', 'BALANCES'],
    description: 'Situação de vigência (Vigente, Expirada ou Próxima do Vencimento)',
    type: 'string',
    width: 18,
    align: 'center',
    getValue: (r) => r.statusVigencia
  },
  {
    id: 'valorTotalAta',
    label: 'Valor Total Ata (R$)',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE', 'PURCHASES'],
    description: 'Valor homologado global da Ata',
    type: 'currency',
    width: 22,
    align: 'right',
    getValue: (r) => r.valorTotalAta
  },
  {
    id: 'totalItensAta',
    label: 'Total de Itens',
    group: 'ata',
    defaultInPresets: ['EXECUTIVE'],
    description: 'Quantidade de itens cadastrados na Ata',
    type: 'number',
    width: 15,
    align: 'right',
    getValue: (r) => r.totalItensAta
  },

  // --- GRUPO ITEM ---
  {
    id: 'numeroItem',
    label: 'Nº Item',
    group: 'item',
    defaultInPresets: ['BALANCES', 'ALLOCATIONS', 'PURCHASES'],
    description: 'Número sequencial do item na Ata',
    type: 'string',
    width: 12,
    align: 'center',
    getValue: (r) => r.numeroItem
  },
  {
    id: 'codigoPdm',
    label: 'Cód. PDM/CATMAT',
    group: 'item',
    defaultInPresets: ['BALANCES', 'PURCHASES'],
    description: 'Código do Padrão Descritivo de Material / Serviço',
    type: 'number',
    width: 18,
    align: 'center',
    getValue: (r) => r.codigoPdm ?? ''
  },
  {
    id: 'descricaoItem',
    label: 'Descrição do Item',
    group: 'item',
    defaultInPresets: ['BALANCES', 'ALLOCATIONS', 'PURCHASES'],
    description: 'Especificação técnica do material ou serviço',
    type: 'string',
    width: 50,
    align: 'left',
    getValue: (r) => r.descricaoItem
  },
  {
    id: 'fornecedorRazaoSocial',
    label: 'Fornecedor (Razão Social)',
    group: 'item',
    defaultInPresets: ['BALANCES', 'PURCHASES'],
    description: 'Razão social da empresa vencedora/adjudicada',
    type: 'string',
    width: 35,
    align: 'left',
    getValue: (r) => r.fornecedorRazaoSocial
  },
  {
    id: 'fornecedorCnpj',
    label: 'CNPJ Fornecedor',
    group: 'item',
    defaultInPresets: ['BALANCES', 'PURCHASES'],
    description: 'Cadastro Nacional de Pessoa Jurídica do fornecedor',
    type: 'string',
    width: 20,
    align: 'center',
    getValue: (r) => r.fornecedorCnpj
  },
  {
    id: 'tipoItem',
    label: 'Tipo Item',
    group: 'item',
    defaultInPresets: [],
    description: 'Material ou Serviço',
    type: 'string',
    width: 14,
    align: 'center',
    getValue: (r) => r.tipoItem
  },
  {
    id: 'valorUnitario',
    label: 'Valor Unitário (R$)',
    group: 'item',
    defaultInPresets: ['BALANCES', 'PURCHASES'],
    description: 'Valor unitário registrado do item',
    type: 'currency',
    width: 20,
    align: 'right',
    getValue: (r) => r.valorUnitario
  },
  {
    id: 'quantidadeHomologada',
    label: 'Qtd. Registrada',
    group: 'item',
    defaultInPresets: ['BALANCES', 'ALLOCATIONS', 'PURCHASES'],
    description: 'Quantidade total homologada na Ata',
    type: 'number',
    width: 18,
    align: 'right',
    getValue: (r) => r.quantidadeHomologada
  },
  {
    id: 'valorTotalHomologado',
    label: 'Valor Total Item (R$)',
    group: 'item',
    defaultInPresets: ['BALANCES', 'PURCHASES'],
    description: 'Valor total homologado do item (Qtd x Vl. Unitário)',
    type: 'currency',
    width: 22,
    align: 'right',
    getValue: (r) => r.valorTotalHomologado
  },
  {
    id: 'maximoAdesao',
    label: 'Limite Adesão (Carona)',
    group: 'item',
    defaultInPresets: ['PURCHASES'],
    description: 'Limite máximo de adesões permitido pelo edital',
    type: 'number',
    width: 22,
    align: 'right',
    getValue: (r) => r.maximoAdesao
  },

  // --- GRUPO SALDOS & CONTABILIDADE ---
  {
    id: 'quantidadeEmpenhada',
    label: 'Qtd. Empenhada',
    group: 'balance',
    defaultInPresets: ['BALANCES'],
    description: 'Soma total de quantidades empenhadas oficiais e cadastradas',
    type: 'number',
    width: 18,
    align: 'right',
    getValue: (r) => r.quantidadeEmpenhada
  },
  {
    id: 'valorEmpenhadoTotal',
    label: 'Valor Empenhado (R$)',
    group: 'balance',
    defaultInPresets: ['BALANCES'],
    description: 'Total empenhado em Reais (Qtd. Empenhada x Vl. Unitário)',
    type: 'currency',
    width: 22,
    align: 'right',
    getValue: (r) => r.valorEmpenhadoTotal
  },
  {
    id: 'saldoQuantidade',
    label: 'Saldo Disponível (Qtd)',
    group: 'balance',
    defaultInPresets: ['BALANCES', 'ALLOCATIONS', 'PURCHASES'],
    description: 'Saldo contábil disponível da Ata (Qtd. Registrada - Qtd. Empenhada)',
    type: 'number',
    width: 22,
    align: 'right',
    getValue: (r) => r.saldoQuantidade
  },
  {
    id: 'saldoValor',
    label: 'Saldo Disponível (R$)',
    group: 'balance',
    defaultInPresets: ['BALANCES', 'PURCHASES'],
    description: 'Saldo financeiro disponível (Saldo Qtd x Vl. Unitário)',
    type: 'currency',
    width: 22,
    align: 'right',
    getValue: (r) => r.saldoValor
  },
  {
    id: 'percentualExecutado',
    label: '% Executado',
    group: 'balance',
    defaultInPresets: ['BALANCES'],
    description: 'Percentual de consumo do item da Ata',
    type: 'percent',
    width: 16,
    align: 'right',
    getValue: (r) => (r.percentualExecutado / 100)
  },
  {
    id: 'statusSaldo',
    label: 'Status do Saldo',
    group: 'balance',
    defaultInPresets: ['BALANCES'],
    description: 'Disponível, Atenção (>80% consumido) ou Esgotado',
    type: 'string',
    width: 18,
    align: 'center',
    getValue: (r) => r.statusSaldo
  },
  {
    id: 'statusReconciliacao',
    label: 'Reconciliação',
    group: 'balance',
    defaultInPresets: ['BALANCES'],
    description: 'Consistente com a API ou Divergente',
    type: 'string',
    width: 18,
    align: 'center',
    getValue: (r) => r.statusReconciliacao
  },

  // --- GRUPO ALOCAÇÕES ---
  {
    id: 'unidadeNome',
    label: 'Unidade / Departamento',
    group: 'allocation',
    defaultInPresets: ['ALLOCATIONS'],
    description: 'Diretoria ou Coordenação interna da SENASP requisitante',
    type: 'string',
    width: 25,
    align: 'left',
    getValue: (r) => r.unidadeNome ?? '-'
  },
  {
    id: 'quantidadeAlocada',
    label: 'Cota Alocada (Qtd)',
    group: 'allocation',
    defaultInPresets: ['ALLOCATIONS'],
    description: 'Cota de quantidade distribuída para o setor',
    type: 'number',
    width: 20,
    align: 'right',
    getValue: (r) => r.quantidadeAlocada ?? 0
  },
  {
    id: 'quantidadeEmpenhadaUnidade',
    label: 'Empenhado Setor (Qtd)',
    group: 'allocation',
    defaultInPresets: ['ALLOCATIONS'],
    description: 'Quantidade empenhada exclusivamente pelo setor',
    type: 'number',
    width: 22,
    align: 'right',
    getValue: (r) => r.quantidadeEmpenhadaUnidade ?? 0
  },
  {
    id: 'saldoUnidade',
    label: 'Saldo Setor (Qtd)',
    group: 'allocation',
    defaultInPresets: ['ALLOCATIONS'],
    description: 'Saldo da cota setorial (Cota - Empenhado do Setor)',
    type: 'number',
    width: 20,
    align: 'right',
    getValue: (r) => r.saldoUnidade ?? 0
  },
  {
    id: 'numeroProcessoSei',
    label: 'Processo SEI',
    group: 'allocation',
    defaultInPresets: ['ALLOCATIONS'],
    description: 'Número do processo SEI que originou a demanda',
    type: 'string',
    width: 24,
    align: 'center',
    getValue: (r) => r.numeroProcessoSei ?? '-'
  },
  {
    id: 'numeroEmpenho',
    label: 'Nota de Empenho (NE)',
    group: 'allocation',
    defaultInPresets: ['ALLOCATIONS'],
    description: 'Número da Nota de Empenho emitida',
    type: 'string',
    width: 22,
    align: 'center',
    getValue: (r) => r.numeroEmpenho ?? '-'
  },
  {
    id: 'dataEmpenho',
    label: 'Data Empenho',
    group: 'allocation',
    defaultInPresets: ['ALLOCATIONS'],
    description: 'Data de emissão da Nota de Empenho',
    type: 'date',
    width: 16,
    align: 'center',
    getValue: (r) => r.dataEmpenho ?? '-'
  },

  // --- GRUPO CONTRATOS ---
  {
    id: 'numeroContrato',
    label: 'Nº do Contrato',
    group: 'contract',
    defaultInPresets: [],
    description: 'Número do Contrato firmado decorrente da Ata',
    type: 'string',
    width: 18,
    align: 'center',
    getValue: (r) => r.numeroContrato ?? '-'
  },
  {
    id: 'numeroControlePncpContrato',
    label: 'PNCP Contrato',
    group: 'contract',
    defaultInPresets: [],
    description: 'Identificador único do contrato no Portal Nacional de Contratações Públicas',
    type: 'string',
    width: 26,
    align: 'center',
    getValue: (r) => r.numeroControlePncpContrato ?? '-'
  },
  {
    id: 'dataVigenciaFinalContrato',
    label: 'Vigência Contrato',
    group: 'contract',
    defaultInPresets: [],
    description: 'Data de término da vigência do Contrato',
    type: 'date',
    width: 18,
    align: 'center',
    getValue: (r) => r.dataVigenciaFinalContrato ?? '-'
  },
  {
    id: 'quantidadeContratada',
    label: 'Qtd. Contratada',
    group: 'contract',
    defaultInPresets: [],
    description: 'Quantidade formalmente contratada no instrumento',
    type: 'number',
    width: 18,
    align: 'right',
    getValue: (r) => r.quantidadeContratada ?? 0
  },

  // --- GRUPO LINKS ---
  {
    id: 'linkPncpAta',
    label: 'Link PNCP Ata',
    group: 'link',
    defaultInPresets: ['EXECUTIVE', 'PURCHASES'],
    description: 'URL de acesso público da Ata no PNCP',
    type: 'link',
    width: 35,
    align: 'left',
    getValue: (r) => r.linkPncpAta
  },
  {
    id: 'linkPncpCompra',
    label: 'Link PNCP Compra',
    group: 'link',
    defaultInPresets: [],
    description: 'URL de acesso público do Pregão/Compra no PNCP',
    type: 'link',
    width: 35,
    align: 'left',
    getValue: (r) => r.linkPncpCompra
  }
];

// Mapeador rápido para busca de coluna por ID
export const COLUMNS_MAP = new Map<string, ReportColumnDef>(
  ALL_REPORT_COLUMNS.map(col => [col.id, col])
);

// Obter colunas padrão por preset
export function getDefaultColumnsForPreset(preset: ReportPreset): string[] {
  if (preset === 'CUSTOM') {
    return ALL_REPORT_COLUMNS.filter(c => c.defaultInPresets.includes('BALANCES')).map(c => c.id);
  }
  return ALL_REPORT_COLUMNS
    .filter(c => c.defaultInPresets.includes(preset))
    .map(c => c.id);
}

// ============================================================================
// AUXILIARES DE CÁLCULO E FORMATAÇÃO DE LINHAS (FLATTENING)
// ============================================================================

export function calculateDaysRemaining(dataFimStr?: string): number | null {
  if (!dataFimStr) return null;
  const parts = dataFimStr.split(/[-/]/);
  let endDate: Date;
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      endDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      endDate = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  } else {
    endDate = new Date(dataFimStr);
  }
  if (isNaN(endDate.getTime())) return null;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = endDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function formatDateBr(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const clean = dateStr.split('T')[0];
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
  }
  return dateStr;
}

export function formatCnpjBr(cnpj?: string): string {
  if (!cnpj) return '-';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return cnpj;
}

/**
 * Converte a árvore de dados do SaldoARP em linhas tabulares planas (Flattened Rows)
 */
export async function buildFlattenedReportData(
  payload: ReportDataPayload,
  granularity: 'BY_ATA' | 'BY_ITEM' | 'BY_ALLOCATION'
): Promise<FlattenedReportRow[]> {
  const { atas, itemsByAta = {}, selectedAta } = payload;
  const atasToProcess = selectedAta ? [selectedAta] : atas;
  const rows: FlattenedReportRow[] = [];

  for (const arp of atasToProcess) {
    const key = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`;
    const items = itemsByAta[key] || [];
    const diasRestantes = calculateDaysRemaining(arp.dataVigenciaFinal);
    let statusVig = 'Vigente';
    if (diasRestantes !== null) {
      if (diasRestantes < 0) statusVig = 'Expirada';
      else if (diasRestantes <= 30) statusVig = 'Crítica (≤30 dias)';
      else if (diasRestantes <= 60) statusVig = 'Atenção (≤60 dias)';
    }

    const baseAtaInfo = {
      numeroAta: arp.numeroAtaRegistroPreco,
      codigoUasg: arp.codigoUnidadeGerenciadora,
      nomeUasg: arp.nomeUnidadeGerenciadora || 'SENASP / MJSP',
      numeroCompraAno: `${arp.numeroCompra || '-'}/${arp.anoCompra || '-'}`,
      modalidade: arp.nomeModalidadeCompra || 'Pregão Eletrônico',
      objeto: arp.objeto || 'Não informado',
      dataAssinatura: formatDateBr(arp.dataAssinatura || arp.dataVigenciaInicial),
      dataVigenciaInicial: formatDateBr(arp.dataVigenciaInicial),
      dataVigenciaFinal: formatDateBr(arp.dataVigenciaFinal),
      diasRestantesVigencia: diasRestantes,
      statusVigencia: statusVig,
      valorTotalAta: Number(arp.valorTotal) || 0,
      totalItensAta: items.length || arp.quantidadeItens || 0,
      numeroControlePncpAta: arp.numeroControlePncpAta || '-',
      linkPncpAta: arp.linkAtaPNCP || '-',
      linkPncpCompra: arp.linkCompraPNCP || '-'
    };

    if (granularity === 'BY_ATA') {
      rows.push({
        ...baseAtaInfo,
        numeroItem: '-',
        codigoPdm: null,
        descricaoItem: '-',
        fornecedorRazaoSocial: '-',
        fornecedorCnpj: '-',
        classificacaoFornecedor: '-',
        tipoItem: '-',
        valorUnitario: 0,
        quantidadeHomologada: 0,
        valorTotalHomologado: 0,
        maximoAdesao: 0,
        statusAdesao: '-',
        quantidadeEmpenhada: 0,
        valorEmpenhadoTotal: 0,
        saldoQuantidade: 0,
        saldoValor: 0,
        percentualExecutado: 0,
        statusSaldo: '-',
        statusReconciliacao: '-'
      });
      continue;
    }

    // Se granularity for BY_ITEM ou BY_ALLOCATION
    for (const item of items) {
      const itemKey = `${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}-${item.numeroItem}`;
      
      // Busca empenhos e alocações locais/armazenados para o item
      const storedEmpenhos = await fetchManualEmpenhos(itemKey);
      const storedContratos = await fetchManualContratos(itemKey);
      const storedAllocations = await fetchAllocations(itemKey);

      const totalEmpenhadoQtd = storedEmpenhos.reduce((acc, e) => acc + (Number(e.quantidade) || 0), 0);
      const qtdHomologada = Number(item.quantidadeHomologadaItem) || 0;
      const valorUnit = Number(item.valorUnitario) || 0;
      const valorTotalItem = Number(item.valorTotal) || (qtdHomologada * valorUnit);

      // Invariante Contábil Oficial: Saldo = Quantidade Homologada - Soma(Empenhos)
      const saldoQtd = qtdHomologada - totalEmpenhadoQtd;
      const valorEmpenhado = totalEmpenhadoQtd * valorUnit;
      const saldoValor = saldoQtd * valorUnit;
      const percentualExec = qtdHomologada > 0 ? (totalEmpenhadoQtd / qtdHomologada) * 100 : 0;

      let statusSaldo = 'Disponível';
      if (saldoQtd <= 0) statusSaldo = 'Esgotado';
      else if (percentualExec >= 80) statusSaldo = 'Alerta (>80%)';

      const baseItemInfo = {
        ...baseAtaInfo,
        numeroItem: item.numeroItem,
        codigoPdm: item.codigoPdm || null,
        descricaoItem: item.descricaoItem || item.nomePdm || '-',
        fornecedorRazaoSocial: item.nomeRazaoSocialFornecedor || '-',
        fornecedorCnpj: formatCnpjBr(item.niFornecedor),
        classificacaoFornecedor: item.classificacaoFornecedor || '001',
        tipoItem: item.tipoItem || 'Material',
        valorUnitario: valorUnit,
        quantidadeHomologada: qtdHomologada,
        valorTotalHomologado: valorTotalItem,
        maximoAdesao: Number(item.maximoAdesao) || 0,
        statusAdesao: (Number(item.maximoAdesao) || 0) > 0 ? 'Aceita Adesão' : 'Não Informada',
        quantidadeEmpenhada: totalEmpenhadoQtd,
        valorEmpenhadoTotal: valorEmpenhado,
        saldoQuantidade: saldoQtd,
        saldoValor: saldoValor,
        percentualExecutado: Math.round(percentualExec * 10) / 10,
        statusSaldo: statusSaldo,
        statusReconciliacao: saldoQtd >= 0 ? 'Consistente' : 'Divergência Negativa'
      };

      if (granularity === 'BY_ITEM') {
        // Vincula dados de contrato se houver
        const contrato = storedContratos[0];
        rows.push({
          ...baseItemInfo,
          numeroContrato: contrato?.numero || '-',
          numeroControlePncpContrato: contrato?.numeroControlePncp || '-',
          dataVigenciaFinalContrato: formatDateBr(contrato?.atualizadoEm),
          quantidadeContratada: contrato?.quantidadeContratada || 0
        });
      } else if (granularity === 'BY_ALLOCATION') {
        // Se houver alocações por departamento para este item
        if (storedAllocations.length > 0) {
          for (const alloc of storedAllocations) {
            const cota = Number(alloc.allocatedQty) || 0;
            const empUnidade = Number(alloc.empenhadaQty) || 0;
            const saldoUnidade = cota - empUnidade;

            rows.push({
              ...baseItemInfo,
              unidadeNome: alloc.unitName || 'Não Informada',
              quantidadeAlocada: cota,
              quantidadeEmpenhadaUnidade: empUnidade,
              saldoUnidade: saldoUnidade,
              numeroProcessoSei: (alloc as any).numeroProcessoSei || '-',
              numeroEmpenho: (alloc as any).numeroEmpenho || '-',
              dataEmpenho: formatDateBr((alloc as any).dataEmpenho)
            });
          }
        } else {
          // Caso não tenha alocações cadastradas ainda para o item
          rows.push({
            ...baseItemInfo,
            unidadeNome: 'Sem Alocação Definida',
            quantidadeAlocada: 0,
            quantidadeEmpenhadaUnidade: 0,
            saldoUnidade: 0,
            numeroProcessoSei: '-',
            numeroEmpenho: '-',
            dataEmpenho: '-'
          });
        }
      }
    }
  }

  return rows;
}

// ============================================================================
// CONSTRUÇÃO E ESTILIZAÇÃO DO WORKBOOK EXCEL (EXCELJS)
// ============================================================================

export async function generateCustomExcelReport(
  config: ReportExportConfig,
  payload: ReportDataPayload
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SaldoARP - Ministério da Justiça e Segurança Pública (SENASP)';
  workbook.lastModifiedBy = 'SaldoARP Web / MJSP';
  workbook.created = new Date();
  workbook.modified = new Date();

  const selectedColDefs = config.selectedColumnIds
    .map(id => COLUMNS_MAP.get(id))
    .filter((c): c is ReportColumnDef => !!c);

  if (config.granularity === 'MULTI_SHEET') {
    // ABA 1: Visão Executiva por Ata
    const ataCols = ALL_REPORT_COLUMNS.filter(c => c.defaultInPresets.includes('EXECUTIVE'));
    const ataData = await buildFlattenedReportData(payload, 'BY_ATA');
    renderWorksheet(workbook, 'Atas Vigentes', ataCols, ataData, config, 'Relatório Gerencial de Atas de Registro de Preços');

    // ABA 2: Visão de Itens e Saldos
    const itemCols = ALL_REPORT_COLUMNS.filter(c => c.defaultInPresets.includes('BALANCES'));
    const itemData = await buildFlattenedReportData(payload, 'BY_ITEM');
    renderWorksheet(workbook, 'Itens e Saldos', itemCols, itemData, config, 'Balanço Contábil de Itens e Saldos Disponíveis');

    // ABA 3: Visão de Alocações Departamentais
    const allocCols = ALL_REPORT_COLUMNS.filter(c => c.defaultInPresets.includes('ALLOCATIONS'));
    const allocData = await buildFlattenedReportData(payload, 'BY_ALLOCATION');
    renderWorksheet(workbook, 'Alocações por Unidade', allocCols, allocData, config, 'Distribuição de Cotas por Unidades Internas (SENASP)');
  } else {
    // Aba única customizada pelo usuário
    const sheetTitle = 
      config.granularity === 'BY_ATA' ? 'Atas de Registro de Preço' :
      config.granularity === 'BY_ALLOCATION' ? 'Alocações Departamentais' : 'Itens e Saldos';

    const data = await buildFlattenedReportData(payload, config.granularity);
    renderWorksheet(workbook, sheetTitle, selectedColDefs, data, config, `Relatório SaldoARP - ${sheetTitle}`);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Renderiza e estiliza uma aba individual do Excel com alto padrão visual MJSP
 */
function renderWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  columns: ReportColumnDef[],
  dataRows: FlattenedReportRow[],
  config: ReportExportConfig,
  reportTitle: string
) {
  const ws = workbook.addWorksheet(sheetName, {
    views: [{ showGridLines: true, state: 'frozen', ySplit: config.includeHeaderMetadata ? 6 : 1 }]
  });

  let currentRowIdx = 1;

  // --- CABEÇALHO INSTITUCIONAL GOV.BR / MJSP / SENASP ---
  if (config.includeHeaderMetadata) {
    // Linha 1: Título Institucional Superior
    ws.mergeCells(currentRowIdx, 1, currentRowIdx, Math.max(columns.length, 6));
    const titleCell = ws.getCell(currentRowIdx, 1);
    titleCell.value = 'MINISTÉRIO DA JUSTIÇA E SEGURANÇA PÚBLICA — SENASP';
    titleCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0C326F' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(currentRowIdx).height = 20;
    currentRowIdx++;

    // Linha 2: Nome do Relatório
    ws.mergeCells(currentRowIdx, 1, currentRowIdx, Math.max(columns.length, 6));
    const subTitleCell = ws.getCell(currentRowIdx, 1);
    subTitleCell.value = reportTitle.toUpperCase();
    subTitleCell.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FF0F172A' } };
    subTitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(currentRowIdx).height = 24;
    currentRowIdx++;

    // Linha 3: Metadados de Emissão e Filtros
    ws.mergeCells(currentRowIdx, 1, currentRowIdx, Math.max(columns.length, 6));
    const metaCell = ws.getCell(currentRowIdx, 1);
    const dataHoraStr = new Date().toLocaleString('pt-BR');
    metaCell.value = `Emitido em: ${dataHoraStr} | Total de Registros: ${dataRows.length} | Sistema Oficial SaldoARP (Compras.gov.br & PNCP)`;
    metaCell.font = { name: 'Segoe UI', size: 8.5, italic: true, color: { argb: 'FF64748B' } };
    metaCell.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(currentRowIdx).height = 18;
    currentRowIdx++;

    // Linha 4: Espaçador em branco
    ws.getRow(currentRowIdx).height = 8;
    currentRowIdx++;
  }

  // --- LINHA DE CABEÇALHO DAS COLUNAS (HEADER) ---
  const headerRowIdx = currentRowIdx;
  const headerRow = ws.getRow(headerRowIdx);
  headerRow.height = 28;

  columns.forEach((col, idx) => {
    const colNum = idx + 1;
    const cell = headerRow.getCell(colNum);
    cell.value = col.label;
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0C326F' } // Azul Institucional MJSP
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col.align === 'center' ? 'center' : col.align === 'right' ? 'right' : 'left',
      wrapText: true
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF00CC55' } }, // Linha verde gov.br
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FF1E40AF' } },
      right: { style: 'thin', color: { argb: 'FF1E40AF' } }
    };
  });

  currentRowIdx++;

  // --- LINHAS DE DADOS (DATA ROWS) ---
  dataRows.forEach((row, rowIdx) => {
    const dataRow = ws.getRow(currentRowIdx);
    dataRow.height = 20;
    const isEven = rowIdx % 2 === 1;

    columns.forEach((col, colIdx) => {
      const colNum = colIdx + 1;
      const cell = dataRow.getCell(colNum);
      const rawVal = col.getValue(row);

      // Tratamento por tipo de coluna
      if (col.type === 'currency') {
        cell.value = typeof rawVal === 'number' ? rawVal : Number(rawVal) || 0;
        cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00;"R$" 0.00';
      } else if (col.type === 'number') {
        cell.value = typeof rawVal === 'number' ? rawVal : (rawVal !== '' && !isNaN(Number(rawVal)) ? Number(rawVal) : rawVal);
        if (typeof cell.value === 'number') {
          cell.numFmt = '#,##0;[Red]-#,##0;0';
        }
      } else if (col.type === 'percent') {
        cell.value = typeof rawVal === 'number' ? rawVal : Number(rawVal) || 0;
        cell.numFmt = '0.0%';
      } else if (col.type === 'link' && rawVal && typeof rawVal === 'string' && rawVal.startsWith('http')) {
        cell.value = { text: 'Acessar no PNCP ↗', hyperlink: rawVal };
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF0066CC' }, underline: true };
      } else {
        cell.value = rawVal ?? '-';
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF1E293B' } };
      }

      // Estilo de fundo zebra
      if (col.type !== 'link') {
        cell.font = { name: 'Segoe UI', size: 9, color: { argb: 'FF1E293B' } };
      }

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' }
      };

      cell.alignment = {
        vertical: 'middle',
        horizontal: col.align === 'center' ? 'center' : col.align === 'right' ? 'right' : 'left'
      };

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });

    currentRowIdx++;
  });

  // --- LINHA DE TOTAIS / SUMÁRIO (SE HABILITADA) ---
  if (config.includeTotalsSummary && dataRows.length > 0) {
    const totalRow = ws.getRow(currentRowIdx);
    totalRow.height = 24;
    const firstDataRowIdx = headerRowIdx + 1;
    const lastDataRowIdx = currentRowIdx - 1;

    columns.forEach((col, colIdx) => {
      const colNum = colIdx + 1;
      const cell = totalRow.getCell(colNum);
      const colLetter = ws.getColumn(colNum).letter;

      if (colIdx === 0) {
        cell.value = 'TOTAL GERAL:';
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0C326F' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (col.type === 'currency') {
        cell.value = { formula: `SUM(${colLetter}${firstDataRowIdx}:${colLetter}${lastDataRowIdx})` };
        cell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00;"R$" 0.00';
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0C326F' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (col.type === 'number' && !['diasRestantesVigencia', 'codigoPdm'].includes(col.id)) {
        cell.value = { formula: `SUM(${colLetter}${firstDataRowIdx}:${colLetter}${lastDataRowIdx})` };
        cell.numFmt = '#,##0;[Red]-#,##0;0';
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0C326F' } };
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.value = '';
      }

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0C326F' } },
        bottom: { style: 'double', color: { argb: 'FF0C326F' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });
    currentRowIdx++;
  }

  // --- AJUSTE AUTOMÁTICO DE LARGURA DE COLUNAS ---
  columns.forEach((col, idx) => {
    const wsCol = ws.getColumn(idx + 1);
    wsCol.width = col.width || 18;
  });
}

/**
 * Dispara o download automático do arquivo Excel no navegador
 */
export function downloadExcelFile(blob: Blob, filename?: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const finalName = filename ? `${filename}.xlsx` : `SaldoARP_Relatorio_${timestamp}.xlsx`;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = finalName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
