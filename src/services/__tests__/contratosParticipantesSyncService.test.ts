import { describe, it, expect, vi } from 'vitest';
import {
  chaveDaCompra,
  indexarCompras,
  atasDoContrato,
  linhasDoContrato,
  orgaosParaLer,
  lerOrgao,
  type AtaDaUasg
} from '../contratosParticipantesSyncService';

// Dados reais (medição de 09/10/2026): DITI (200342) tem os contratos 00045/2025 e 00001/2026 na compra
// 90046/2025 da SENASP, com os itens 1 e 2; a PRF-PB (200122) tem a nota 2025NE000129 na compra da ata 00091/2024.
const ATAS: AtaDaUasg[] = [
  { numeroAta: '00075/2025', uasg: '200331', numeroCompra: '90046', anoCompra: '2025', itens: [
    { numeroItem: '00001', fornecedorCnpj: '01.462.017/0001-23' }, { numeroItem: '00002', fornecedorCnpj: '01462017000123' }
  ] },
  // Mesma compra, outro fornecedor: não pode receber o contrato da EMC.
  { numeroAta: '00076/2025', uasg: '200331', numeroCompra: '90046', anoCompra: '2025', itens: [
    { numeroItem: '00003', fornecedorCnpj: '99.999.999/0001-99' }
  ] }
];
const indice = indexarCompras(ATAS);
const contratoEmc = {
  id: 123456, numero: '00045/2025', tipo: 'Contrato', situacao: 'Ativo', unidade_compra: '200331', licitacao_numero: '90046/2025',
  fornecedor: { tipo: 'JURIDICA', cnpj_cpf_idgener: '01.462.017/0001-23', nome: 'EMC COMPUTER SYSTEMS BRASIL LTDA' },
  valor_global: '4.050.000,00', vigencia_fim: '2026-12-30'
};

describe('chaveDaCompra', () => {
  it('normaliza número e ano da compra', () => {
    expect(chaveDaCompra('90046/2025')).toBe('90046/2025');
    expect(chaveDaCompra('46/2025')).toBe('00046/2025');
    expect(chaveDaCompra('90046', '2025')).toBe('90046/2025');
    expect(chaveDaCompra('900462025', '2025')).toBe('90046/2025');
    expect(chaveDaCompra('', '2025')).toBeNull();
    expect(chaveDaCompra('abc')).toBeNull();
  });
});

describe('atasDoContrato', () => {
  it('casa compra e fornecedor; outro fornecedor da mesma compra fica de fora', () => {
    const atas = atasDoContrato(contratoEmc, indice);
    expect(atas).toHaveLength(1);
    expect([...atas[0].itens.values()]).toEqual(['00075/2025-200331-00001', '00075/2025-200331-00002']);
  });

  it('contrato de compra de outra UASG ou sem fornecedor não entra', () => {
    expect(atasDoContrato({ ...contratoEmc, unidade_compra: '200342' }, indice)).toEqual([]);
    expect(atasDoContrato({ ...contratoEmc, licitacao_numero: '90007/2025' }, indice)).toEqual([]);
    expect(atasDoContrato({ ...contratoEmc, fornecedor: {} }, indice)).toEqual([]);
  });
});

describe('linhasDoContrato', () => {
  it('uma linha por item da ata, com a quantidade e os números no padrão brasileiro', () => {
    const linhas = linhasDoContrato(contratoEmc, [
      { numero_item_compra: '00002', quantidade: '5', valorunitario: '270.000,00' },
      { numero_item_compra: '00001', quantidade: '15', valorunitario: '160.000,00' },
      { numero_item_compra: '00009', quantidade: '1', valorunitario: '1,00' }
    ], atasDoContrato(contratoEmc, indice));
    expect(linhas).toEqual([
      expect.objectContaining({ item_key: '00075/2025-200331-00002', contrato_id: '123456', quantidade: 5, valor_unitario: 270000, valor_global: 4050000, vigencia_fim: '2026-12-30', tipo: 'Contrato' }),
      expect.objectContaining({ item_key: '00075/2025-200331-00001', quantidade: 15, valor_unitario: 160000 })
    ]);
  });

  it('o mesmo item em duas linhas do contrato soma as quantidades', () => {
    const linhas = linhasDoContrato(contratoEmc, [
      { numero_item_compra: '1', quantidade: '3' }, { numero_item_compra: '1', quantidade: '2' }
    ], atasDoContrato(contratoEmc, indice));
    expect(linhas).toHaveLength(1);
    expect(linhas[0].quantidade).toBe(5);
  });
});

describe('orgaosParaLer', () => {
  const agora = Date.parse('2026-10-13T12:00:00Z');
  it('nunca lidos primeiro, depois os mais antigos; os lidos há menos de 24 h e a SENASP ficam de fora', () => {
    const fila = [
      { uasg: '200109', lidoEm: '2026-10-11T10:00:00Z' },
      { uasg: '200122', lidoEm: null },
      { uasg: '200342', lidoEm: '2026-10-13T08:00:00Z' },
      { uasg: '926015', lidoEm: '2026-10-10T10:00:00Z' },
      { uasg: '200330', lidoEm: null }
    ];
    expect(orgaosParaLer(fila, { agora })).toEqual(['200122', '926015', '200109']);
    expect(orgaosParaLer(fila, { agora, forcar: true })).toEqual(['200122', '926015', '200109', '200342']);
  });
});

describe('lerOrgao', () => {
  it('lê ativos e encerrados, conta os contratos da UG e só busca itens dos contratos de compras da SENASP', async () => {
    const fontes = {
      lista: vi.fn(async () => [contratoEmc, { id: 1, unidade_compra: '200342', licitacao_numero: '90007/2025', fornecedor: { cnpj_cpf_idgener: '1' } }]),
      encerrados: vi.fn(async () => [{ ...contratoEmc, id: 777, numero: '2025NE000010', tipo: 'Empenho', situacao: 'Inativo' }, contratoEmc]),
      itens: vi.fn(async (id: string) => (id === '777' ? [{ numero_item_compra: '1', quantidade: '2' }] : [{ numero_item_compra: '1', quantidade: '15' }]))
    };
    const r = await lerOrgao('200342', indice, fontes);
    expect(r.contratos_na_ug).toBe(3);
    expect(fontes.itens).toHaveBeenCalledTimes(2);
    expect(r.linhas.map((l) => [l.contrato_id, l.quantidade, l.situacao])).toEqual([['123456', 15, 'Ativo'], ['777', 2, 'Inativo']]);
  });

  it('falha numa das listas: lança, para o órgão voltar na próxima execução', async () => {
    const fontes = { lista: vi.fn(async () => []), encerrados: vi.fn(async () => { throw new Error('503'); }), itens: vi.fn() };
    await expect(lerOrgao('200342', indice, fontes)).rejects.toThrow('503');
  });
});
