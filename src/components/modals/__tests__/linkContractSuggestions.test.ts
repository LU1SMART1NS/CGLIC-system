import { describe, it, expect } from 'vitest';
import {
  aplicarRestricoesDeVinculo,
  contractMatchesCompra,
  getContractSuggestionReasons,
  rankContractsBySuggestion,
  ataLinkCoverage
} from '../linkContractSuggestions';
import type { ContractDashboardRecord } from '../../../types';

const contract = (over: Partial<ContractDashboardRecord>): ContractDashboardRecord =>
  ({ id: 'X', numero: '1', ano: '2025', numeroFormatado: '1/2025', uasg: '200331', fonteDados: 'Compras.gov.br', ...over }) as any;

describe('linkContractSuggestions', () => {
  const compra = { uasg: '200331', numeroCompra: '90045', anoCompra: '2024' };

  it('casa o idCompra oficial de 17 dígitos (UASG + modalidade + número + ano)', () => {
    expect(contractMatchesCompra({ idCompra: '20033105900452024' }, compra)).toBe(true);
  });

  it('casa o idCompra local sem modalidade e numeroCompra sem zeros à esquerda', () => {
    expect(contractMatchesCompra({ idCompra: '200331000102026' }, { uasg: '200331', numeroCompra: '10', anoCompra: '2026' })).toBe(true);
  });

  it('casa quando numeroCompra já traz o ano embutido', () => {
    expect(contractMatchesCompra({ idCompra: '20033105900452024' }, { ...compra, numeroCompra: '900452024' })).toBe(true);
  });

  it('não casa compra de outra UASG, outro número ou sem idCompra', () => {
    expect(contractMatchesCompra({ idCompra: '16000105900452024' }, compra)).toBe(false);
    expect(contractMatchesCompra({ idCompra: '20033105900462024' }, compra)).toBe(false);
    expect(contractMatchesCompra({ idCompra: undefined }, compra)).toBe(false);
  });

  it('sugere por fornecedor comparando só os dígitos do CNPJ', () => {
    const c = contract({ fornecedorCnpjCpf: '11222333000144' });
    expect(getContractSuggestionReasons(c, { fornecedorCnpjs: ['11.222.333/0001-44'] })).toEqual(['fornecedor']);
    expect(getContractSuggestionReasons(c, undefined)).toEqual([]);
  });

  it('ordena mesma compra > mesmo fornecedor > demais, estável dentro do grupo', () => {
    const a = contract({ id: 'A' });
    const b = contract({ id: 'B', fornecedorCnpjCpf: '11222333000144' });
    const c = contract({ id: 'C', idCompra: '20033105900452024' });
    const d = contract({ id: 'D' });
    const ranked = rankContractsBySuggestion([a, b, c, d], { compra, fornecedorCnpjs: ['11222333000144'] });
    expect(ranked.map((r) => r.contract.id)).toEqual(['C', 'B', 'A', 'D']);
    expect(ranked[0].reasons).toEqual(['compra']);
  });
});

describe('ataLinkCoverage', () => {
  const itens = [
    { linkedContractKeys: ['200331-00160-2026'] },
    { linkedContractKeys: ['200331-00160-2026', '200331-00230-2026'] },
    { linkedContractKeys: [] }
  ];

  it('conta em quantos itens da ata o contrato já está vinculado, ignorando maiúsculas', () => {
    expect(ataLinkCoverage('200331-00160-2026', itens)).toEqual({ vinculados: 2, total: 3, completo: false });
    expect(ataLinkCoverage('200331-00230-2026'.toLowerCase(), itens)).toEqual({ vinculados: 1, total: 3, completo: false });
    expect(ataLinkCoverage('200331-00999-2026', itens)).toEqual({ vinculados: 0, total: 3, completo: false });
  });

  it('só é completo quando todos os itens já têm o contrato', () => {
    expect(ataLinkCoverage('200331-00160-2026', [{ linkedContractKeys: ['200331-00160-2026'] }])).toMatchObject({ completo: true });
    expect(ataLinkCoverage('200331-00160-2026', [])).toMatchObject({ completo: false });
  });
});

describe('aplicarRestricoesDeVinculo', () => {
  const c = (id: string) => ({ id, uasg: '200331', numero: id, ano: 2025 }) as any;
  const keyOf = (x: any) => x.id;

  it('sugeridos primeiro; marcados "não pertence a ata" perdem a sugestão; vinculados a outra ata vão para o fim, bloqueados', () => {
    const r = aplicarRestricoesDeVinculo(
      [
        { contract: c('OUTRA'), reasons: ['compra', 'fornecedor'] },
        { contract: c('MARCADO'), reasons: ['fornecedor'] },
        { contract: c('SUG'), reasons: ['compra'] },
        { contract: c('COMUM'), reasons: [] }
      ],
      { contractKeyOf: keyOf, ataDeOutroVinculo: new Map([['OUTRA', '00059/2025']]), naoPertencemAAta: new Set(['MARCADO']) }
    );
    expect(r.map((x) => x.contract.id)).toEqual(['SUG', 'MARCADO', 'COMUM', 'OUTRA']);
    expect(r[1]).toMatchObject({ reasons: [], naoPertenceAAta: true });
    expect(r[3]).toMatchObject({ reasons: [], vinculadoAOutraAta: '00059/2025' });
  });

  it('contrato descartado para esta ata perde a sugestão e é sinalizado', () => {
    const r = aplicarRestricoesDeVinculo(
      [
        { contract: c('DESCARTADO'), reasons: ['compra', 'fornecedor'] },
        { contract: c('SUG'), reasons: ['compra'] }
      ],
      { contractKeyOf: keyOf, ataDeOutroVinculo: new Map(), naoPertencemAAta: new Set(), descartadosParaEstaAta: new Set(['DESCARTADO']) }
    );
    expect(r.map((x) => x.contract.id)).toEqual(['SUG', 'DESCARTADO']);
    expect(r[1]).toMatchObject({ reasons: [], descartadoParaEstaAta: true });
  });
});
