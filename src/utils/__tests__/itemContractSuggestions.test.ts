import { describe, it, expect } from 'vitest';
import {
  buildItemContractSuggestions,
  buildItemSuggestionCriteria,
  contractKeyOf
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
  it('resolve o contrato do PNCP no catálogo e usa a chave do catálogo', () => {
    const cat = official({ id: 'CAT-1', numeroControlePncp: '00394494000136-2-000015/2026' });
    const { suggestions } = buildItemContractSuggestions({
      pncpContracts: [pncp({ numeroControlePncp: '00394494000136-2-000015/2026', quantidadeContratada: 40 })],
      officialContracts: [cat]
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ contractKey: 'CAT-1', sources: ['pncp'], quantidadeContratada: 40 });
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

  it('ignora contrato do PNCP sem UASG, pois não dá para montar a chave', () => {
    const { suggestions } = buildItemContractSuggestions({ pncpContracts: [pncp({ uasg: undefined })] });
    expect(suggestions).toEqual([]);
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
