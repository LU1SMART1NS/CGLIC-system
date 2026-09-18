import { describe, it, expect } from 'vitest';
import { computeAdesaoStatus, formatCurrencyBRL, formatItemNumber, groupArpsAndItems } from '../ataGrouping';
import { formatPncpContractUrl, formatPncpAtaUrl, formatPncpCompraUrl } from '../pncpUtils';
import { getCanonicalContractKey } from '../../services/api';
import type { ArpRecord, ArpItemRecord } from '../../types';

// Mock base ARP
const mockArp2026: ArpRecord = {
  numeroAtaRegistroPreco: '00017/2026',
  codigoUnidadeGerenciadora: '200331',
  nomeUnidadeGerenciadora: 'SENASP',
  codigoOrgao: 20000,
  nomeOrgao: 'MJSP',
  numeroCompra: '00017',
  anoCompra: '2026',
  codigoModalidadeCompra: '05',
  nomeModalidadeCompra: 'Pregão',
  dataAssinatura: '2026-01-10',
  dataVigenciaInicial: '2026-01-15',
  dataVigenciaFinal: '2027-01-15',
  valorTotal: 100000,
  statusAta: 'Ata de Registro de Preços',
  objeto: 'Aquisição de equipamentos de segurança',
  quantidadeItens: 4,
  dataHoraAtualizacao: '2026-01-15T10:00:00Z',
  dataHoraInclusao: '2026-01-15T10:00:00Z',
  dataHoraExclusao: null,
  ataExcluido: false,
  numeroControlePncpAta: '00394494000136-1-00017/2026',
  numeroControlePncpCompra: '',
  idCompra: '200331000172026'
};

const mockArp2025: ArpRecord = {
  ...mockArp2026,
  numeroAtaRegistroPreco: '00017/2025',
  anoCompra: '2025'
};

// Mock items
const item1SupplierA: ArpItemRecord = {
  numeroAtaRegistroPreco: '00017/2026',
  codigoUnidadeGerenciadora: '200331',
  numeroCompra: '00017',
  anoCompra: '2026',
  codigoModalidadeCompra: '05',
  dataAssinatura: '2026-01-10',
  dataVigenciaInicial: '2026-01-15',
  dataVigenciaFinal: '2027-01-15',
  numeroItem: '00001',
  codigoItem: 101,
  descricaoItem: 'Manutenção e reparo em equipamento médico',
  tipoItem: 'MATERIAL',
  quantidadeHomologadaItem: 100,
  classificacaoFornecedor: '1',
  niFornecedor: '00.111.222/0001-33',
  nomeRazaoSocialFornecedor: 'QIAGEN BIOTECNOLOGIA BRASIL LTDA.',
  quantidadeHomologadaVencedor: 100,
  valorUnitario: 46042.0,
  valorTotal: 4604200.0,
  maximoAdesao: 200,
  nomeUnidadeGerenciadora: 'SENASP',
  nomeModalidadeCompra: 'Pregão',
  idCompra: '200331000172026',
  numeroControlePncpCompra: '',
  dataHoraInclusao: '2026-01-15T10:00:00Z',
  dataHoraAtualizacao: '2026-01-15T10:00:00Z',
  dataHoraExclusao: null,
  itemExcluido: false,
  numeroControlePncpAta: '',
  codigoPdm: 1,
  nomePdm: 'EQUIPAMENTO'
};

const item2SupplierA: ArpItemRecord = {
  ...item1SupplierA,
  numeroItem: '00002',
  descricaoItem: 'Óculos de proteção',
  valorUnitario: 23042.0,
  maximoAdesao: 100
};

const item3SupplierB: ArpItemRecord = {
  ...item1SupplierA,
  numeroItem: '00003',
  descricaoItem: 'Equipamento hospitalar',
  niFornecedor: '99.888.777/0001-66',
  nomeRazaoSocialFornecedor: 'DISTRIBUIDORA MEDICA BRASIL SA',
  valorUnitario: 18500.0,
  maximoAdesao: 0 // Não aceita adesão
};

describe('Agrupamento de Atas e Utilitários', () => {
  it('Formatação monetária', () => {
    expect(formatCurrencyBRL(46042).replace(/\s/g, ' ')).toContain('46.042,00');
    expect(formatCurrencyBRL(0).replace(/\s/g, ' ')).toContain('0,00');
    expect(formatCurrencyBRL(null).replace(/\s/g, ' ')).toContain('0,00');
  });

  it('Formatação de número de item', () => {
    expect(formatItemNumber('1')).toBe('00001');
    expect(formatItemNumber('00017')).toBe('00017');
    expect(formatItemNumber('')).toBe('00001');
  });

  it('Cálculo de adesão', () => {
    expect(computeAdesaoStatus([item1SupplierA, item2SupplierA])).toBe('ACEITA');
    expect(computeAdesaoStatus([item3SupplierB])).toBe('NAO_ACEITA');
    expect(computeAdesaoStatus([item1SupplierA, item3SupplierB])).toBe('VARIAVEL');
    expect(computeAdesaoStatus([])).toBe('NAO_INFORMADA');
  });

  it('Agrupamento unívoco: 1 Ata = 1 Fornecedor Único = 1 Card', () => {
    const itemsMap: Record<string, ArpItemRecord[]> = {
      '00017/2026-200331': [item1SupplierA, item2SupplierA]
    };

    const cards = groupArpsAndItems([mockArp2026], itemsMap);
    expect(cards.length).toBe(1);

    const card = cards[0];
    expect(card.fornecedorNome).toBe('QIAGEN BIOTECNOLOGIA BRASIL LTDA.');
    expect(card.fornecedorCnpj).toBe('00.111.222/0001-33');
    expect(card.itens.length).toBe(2);
    expect(card.adesaoStatus).toBe('ACEITA');
  });

  it('Separação de Atas com mesmo número e anos diferentes', () => {
    const itemsMapYears: Record<string, ArpItemRecord[]> = {
      '00017/2026-200331': [item1SupplierA],
      '00017/2025-200331': [{ ...item1SupplierA, numeroAtaRegistroPreco: '00017/2025', anoCompra: '2025' }]
    };

    const cardsYears = groupArpsAndItems([mockArp2026, mockArp2025], itemsMapYears);
    expect(cardsYears.length).toBe(2);
    expect(cardsYears[0].arp.numeroAtaRegistroPreco).toBe('00017/2026');
    expect(cardsYears[1].arp.numeroAtaRegistroPreco).toBe('00017/2025');
  });

  it('Card sem itens', () => {
    const cardsEmpty = groupArpsAndItems([mockArp2026], {});
    expect(cardsEmpty.length).toBe(1);
    expect(cardsEmpty[0].itens.length).toBe(0);
    expect(cardsEmpty[0].adesaoStatus).toBe('NAO_INFORMADA');
  });

  it('Padrão correto de link no PNCP de contratos (sem fabricação indevida)', () => {
    // 1. Se forneceu numeroControlePncp oficial -> formata para URL canônica
    expect(
      formatPncpContractUrl('00394494000136-2-001456/2026')
    ).toBe('https://pncp.gov.br/app/contratos/00394494000136/2026/1456');

    // 2. Se forneceu linkVisualizacao oficial -> formata e usa o oficial
    expect(
      formatPncpContractUrl(undefined, 'https://pncp.gov.br/app/contratos/00394494000136-2-001456/2026')
    ).toBe('https://pncp.gov.br/app/contratos/00394494000136/2026/1456');

    expect(
      formatPncpContractUrl(undefined, 'https://pncp.gov.br/app/contratos/00394494000136/2026/1456')
    ).toBe('https://pncp.gov.br/app/contratos/00394494000136/2026/1456');

    // 3. Caso contrário -> NÃO fabricar URL
    expect(
      formatPncpContractUrl(undefined, undefined)
    ).toBe('');

    expect(
      formatPncpContractUrl('', '')
    ).toBe('');
  });

  it('Normalização de chave única de contratos para evitar duplicações', () => {
    expect(getCanonicalContractKey('00214/2026')).toBe('214/2026');
    expect(getCanonicalContractKey('214/2026')).toBe('214/2026');
    expect(getCanonicalContractKey('002142026')).toBe('214/2026');
    expect(getCanonicalContractKey('00214', '2026')).toBe('214/2026');
    expect(getCanonicalContractKey(undefined, undefined, '00394494000136-2-000214/2026')).toBe('214/2026');
    expect(getCanonicalContractKey('2026NE000123')).toBe('2026NE123');
    // Caso real: Contrato 00192/2026 com numeroControlePncp 00394494000136-2-000001/2026 normaliza para 192/2026
    expect(getCanonicalContractKey('00192/2026', '2026', '00394494000136-2-000001/2026')).toBe('192/2026');
    expect(getCanonicalContractKey('00192/2026')).toBe('192/2026');
  });

  it('Formatação oficial de URLs de Atas e Compras/Editais no PNCP', () => {
    // 1. Ata com link direto
    expect(
      formatPncpAtaUrl('https://pncp.gov.br/app/atas/00394494000136/2025/1651/1', '00394494000136-1-001651/2025-000001')
    ).toBe('https://pncp.gov.br/app/atas/00394494000136/2025/1651/1');

    // 2. Ata a partir de numeroControlePncpAta (ex: Ata 24/2026)
    expect(
      formatPncpAtaUrl(undefined, '00394494000136-1-001651/2025-000001')
    ).toBe('https://pncp.gov.br/app/atas/00394494000136/2025/1651/1');

    // 3. Compra/Edital a partir de numeroControlePncpCompra
    expect(
      formatPncpCompraUrl(undefined, '00394494000136-1-001651/2025')
    ).toBe('https://pncp.gov.br/app/editais/00394494000136/2025/001651');

    // 4. Compra/Edital a partir de numeroControlePncpAta
    expect(
      formatPncpCompraUrl(undefined, undefined, '00394494000136-1-001651/2025-000001')
    ).toBe('https://pncp.gov.br/app/editais/00394494000136/2025/001651');

    // 5. Ata 00035/2026 específica
    expect(
      formatPncpAtaUrl(undefined, undefined, '00035/2026')
    ).toBe('https://pncp.gov.br/app/atas/00394494000136/2025/1313/12');
  });
});
