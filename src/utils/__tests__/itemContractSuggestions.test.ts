import { describe, it, expect } from 'vitest';
import {
  buildItemContractSuggestions,
  buildItemSuggestionCriteria,
  contractKeyOf,
  quantidadesPorContrato
} from '../itemContractSuggestions';
import type { ContractDashboardRecord, PncpContract } from '../../types';

const official = (over: Partial<ContractDashboardRecord>): ContractDashboardRecord =>
  ({ id: '', numero: '15', ano: 2026, numeroFormatado: '15/2026', uasg: '200331', fonteDados: 'Contratos.gov.br', ...over }) as any;

const pncp = (over: Partial<PncpContract>): PncpContract =>
  ({ numeroContrato: '15/2026', anoContrato: 2026, uasg: '200331', ...over }) as any;

const criteria = buildItemSuggestionCriteria(
  { idCompra: '20033105900452024', codigoUnidadeGerenciadora: '200331', numeroCompra: '90045', anoCompra: '2024' },
  { niFornecedor: '12.345.678/0001-90' }
);

describe('itemContractSuggestions', () => {
  it('item de fornecedor estrangeiro sugere o contrato da mesma compra pelo nome', () => {
    const crit = buildItemSuggestionCriteria(
      { idCompra: '20033105900332024', codigoUnidadeGerenciadora: '200331', numeroCompra: '90033', anoCompra: '2024' },
      { niFornecedor: 'ESTRANG0000348', nomeRazaoSocialFornecedor: 'Axon Enterprise, Inc.' }
    );
    const axon = official({ id: 'AX', idCompra: '20033105900332024', fornecedorCnpjCpf: 'EXAXONEN1', fornecedorNome: 'AXON  INTERPRISE' });
    const outro = official({ id: 'OUT', idCompra: '20033105900332024', fornecedorCnpjCpf: 'EXOUTRO', fornecedorNome: 'OUTRA EMPRESA GMBH' });
    const { suggestions } = buildItemContractSuggestions({ officialContracts: [axon, outro], criteria: crit });
    expect(suggestions.map((s) => s.contractKey)).toEqual([contractKeyOf(axon)]);
  });

  it('resolve o contrato do PNCP no catálogo e usa a chave do catálogo', () => {
    const cat = official({ id: 'CAT-1', numeroControlePncp: '00394494000136-2-000015/2026' });
    const { suggestions } = buildItemContractSuggestions({
      pncpContracts: [pncp({ numeroControlePncp: '00394494000136-2-000015/2026', quantidadeContratada: 40 })],
      officialContracts: [cat]
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ contractKey: 'CAT-1', sources: ['pncp'], quantidadeContratada: 40, linkable: true });
    expect(suggestions[0].contract).toBe(cat);
  });

  it('casa por UASG + número/ano quando não há número de controle', () => {
    const cat = official({ id: '', numero: '15', ano: 2026 });
    const { suggestions } = buildItemContractSuggestions({
      pncpContracts: [pncp({ numeroContrato: '15/2026' })],
      officialContracts: [cat]
    });
    expect(suggestions[0].contractKey).toBe(contractKeyOf(cat));
  });

  it('usa chave derivada quando o contrato do PNCP não está no catálogo', () => {
    const { suggestions } = buildItemContractSuggestions({
      pncpContracts: [pncp({ uasg: '160001', numeroContrato: '7/2026' })],
      officialContracts: []
    });
    expect(suggestions[0]).toMatchObject({ contractKey: '160001-7-2026', sources: ['pncp'] });
    expect(suggestions[0].contract).toBeUndefined();
  });

  it('mostra, sem permitir vincular, o contrato do PNCP sem UASG válida', () => {
    for (const uasg of [undefined, '', '76']) {
      const { suggestions } = buildItemContractSuggestions({
        pncpContracts: [pncp({ uasg, numeroContrato: '2252/2026', numeroControlePncp: '00394494000136-2-002252/2026' })]
      });
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].linkable).toBe(false);
      expect(suggestions[0].contractKey).toBe('PNCP:00394494000136-2-002252/2026');
    }
  });

  it('sem UASG válida e sem número de controle, usa número/ano como identificador', () => {
    const { suggestions } = buildItemContractSuggestions({ pncpContracts: [pncp({ uasg: '76', numeroContrato: '2252/2026' })] });
    expect(suggestions[0]).toMatchObject({ contractKey: 'PNCP:2252/2026', linkable: false });
  });

  it('o descarte de uma sugestão não vinculável usa o mesmo identificador', () => {
    const { suggestions, dismissed } = buildItemContractSuggestions({
      pncpContracts: [pncp({ uasg: '76', numeroContrato: '2252/2026' })],
      dismissedContractKeys: ['PNCP:2252/2026']
    });
    expect(suggestions).toEqual([]);
    expect(dismissed).toHaveLength(1);
  });

  it('sugere do catálogo só quando a compra E o fornecedor do item casam', () => {
    const certo = official({ id: 'A', idCompra: '20033105900452024', fornecedorCnpjCpf: '12345678000190' });
    const outroFornecedor = official({ id: 'B', idCompra: '20033105900452024', fornecedorCnpjCpf: '99999999000100' });
    const outraCompra = official({ id: 'C', idCompra: '20033105900462024', fornecedorCnpjCpf: '12345678000190' });
    const { suggestions } = buildItemContractSuggestions({
      officialContracts: [certo, outroFornecedor, outraCompra],
      criteria
    });
    expect(suggestions.map((s) => s.contractKey)).toEqual(['A']);
    expect(suggestions[0].sources).toEqual(['catalogo']);
  });

  it('une as duas origens numa só sugestão', () => {
    const cat = official({
      id: 'A', idCompra: '20033105900452024', fornecedorCnpjCpf: '12345678000190',
      numeroControlePncp: '00394494000136-2-000015/2026'
    });
    const { suggestions } = buildItemContractSuggestions({
      pncpContracts: [pncp({ numeroControlePncp: '00394494000136-2-000015/2026' })],
      officialContracts: [cat],
      criteria
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].sources).toEqual(['pncp', 'catalogo']);
  });

  it('remove os já vinculados, ignorando maiúsculas', () => {
    const { suggestions, dismissed } = buildItemContractSuggestions({
      pncpContracts: [pncp({ uasg: '160001', numeroContrato: '7/2026' })],
      linkedContractKeys: ['160001-7-2026']
    });
    expect(suggestions).toEqual([]);
    expect(dismissed).toEqual([]);
  });

  it('separa as descartadas das pendentes', () => {
    const { suggestions, dismissed } = buildItemContractSuggestions({
      pncpContracts: [
        pncp({ uasg: '160001', numeroContrato: '7/2026' }),
        pncp({ uasg: '160001', numeroContrato: '8/2026' })
      ],
      dismissedContractKeys: ['160001-8-2026']
    });
    expect(suggestions.map((s) => s.contractKey)).toEqual(['160001-7-2026']);
    expect(dismissed.map((s) => s.contractKey)).toEqual(['160001-8-2026']);
  });

  it('vinculado vence descartado', () => {
    const { suggestions, dismissed } = buildItemContractSuggestions({
      pncpContracts: [pncp({ uasg: '160001', numeroContrato: '7/2026' })],
      linkedContractKeys: ['160001-7-2026'],
      dismissedContractKeys: ['160001-7-2026']
    });
    expect(suggestions).toEqual([]);
    expect(dismissed).toEqual([]);
  });

  it('sem critérios nem PNCP não sugere nada do catálogo', () => {
    const { suggestions } = buildItemContractSuggestions({
      officialContracts: [official({ id: 'A', idCompra: '20033105900452024' })]
    });
    expect(suggestions).toEqual([]);
  });
});

describe('quantidadesPorContrato', () => {
  it('lê a quantidade da API por chave de contrato, sem inventar a que não vem', () => {
    const cat = official({ id: 'CAT-1', numeroControlePncp: '00394494000136-2-000015/2026' });
    const map = quantidadesPorContrato(
      [
        pncp({ numeroControlePncp: '00394494000136-2-000015/2026', quantidadeContratada: 40 }),
        pncp({ uasg: '160001', numeroContrato: '7/2026', quantidadeContratada: null }),
        pncp({ uasg: '160001', numeroContrato: '8/2026', quantidadeContratada: 12 })
      ],
      [cat]
    );
    expect(map.get('CAT-1')).toBe(40);
    expect(map.has('160001-7-2026')).toBe(false);
    expect(map.get('160001-8-2026')).toBe(12);
  });

  it('não sugere contrato vinculado a outra ata nem marcado "não pertence a ata"', () => {
    const outraAta = official({ id: 'OUTRA', numeroControlePncp: 'X-1' });
    const marcado = official({ id: 'MARCADO', numeroControlePncp: 'X-2' });
    const livre = official({ id: 'LIVRE', numeroControlePncp: 'X-3' });
    const { suggestions, dismissed } = buildItemContractSuggestions({
      pncpContracts: [pncp({ numeroControlePncp: 'X-1' }), pncp({ numeroControlePncp: 'X-2' }), pncp({ numeroControlePncp: 'X-3' })],
      officialContracts: [outraAta, marcado, livre],
      dismissedContractKeys: ['MARCADO'],
      excludedContractKeys: ['OUTRA', 'MARCADO']
    });
    expect(suggestions.map((s) => s.contractKey)).toEqual(['LIVRE']);
    expect(dismissed).toHaveLength(0);
  });
});
