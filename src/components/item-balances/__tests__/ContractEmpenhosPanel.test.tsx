import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractEmpenhosPanel } from '../ContractEmpenhosPanel';
import type { ItemEmpenhoVinculo } from '../../../types/itemEmpenhoVinculo';

const v = (id: string, numero: string, over: Partial<ItemEmpenhoVinculo> = {}): ItemEmpenhoVinculo => ({
  id, itemKey: '00059/2025-200331-00001', empenhoId: id, quantidade: null, fonte: null,
  quantidadeSugerida: null, contractKey: '200331-00126-2026',
  empenho: { canonicalKey: numero, numero, ano: 2026, uasg: '200330', dataEmissao: '2026-03-27', valorEmpenhado: 11152 },
  ...over
});

const vinculos = [
  v('1', '2026NE000039', { quantidade: 8, fonte: 'API' }),
  v('2', '2026NE000040', { quantidade: 21, fonte: 'USUARIO' }),
  v('3', '2026NE000051', { quantidadeSugerida: 7 }),
  v('4', '2026NE000096', { quantidadeSugerida: 4 }),
  v('5', '2026NE000160', { contractKey: '200331-00160-2026', quantidade: 400, fonte: 'API' })
];

const base: React.ComponentProps<typeof ContractEmpenhosPanel> = {
  contractKey: '200331-00126-2026',
  contratado: 60,
  vinculos,
  loading: false,
  canEdit: true,
  canLinkEmpenhos: true,
  allocationOptions: [],
  linkedAllocationId: () => '',
  onConfirm: vi.fn(),
  onConfirmAll: vi.fn(),
  onLinkAllocation: vi.fn(),
  busy: false
};

const html = (over: Partial<typeof base> = {}) => renderToStaticMarkup(<ContractEmpenhosPanel {...base} {...over} />);

describe('ContractEmpenhosPanel', () => {
  it('lista só os empenhos do contrato, com o estado de cada um', () => {
    const out = html();
    expect(out).toContain('2026NE000039');
    expect(out).toContain('2026NE000051');
    expect(out).not.toContain('2026NE000160');
    expect(out).toContain('Oficial');
    expect(out).toContain('Confirmada');
    expect(out).toContain('Pendente');
  });

  it('resume contratado, empenhado e a empenhar do contrato', () => {
    const out = html();
    expect(out).toContain('Contratado: <strong>60</strong>');
    expect(out).toContain('Empenhado: <strong>29</strong>');
    expect(out).toContain('A empenhar: <strong>31</strong>');
    expect(out).toContain('2 pendentes (11 un sugeridas)');
  });

  it('oferece aceitar todas as sugestões, com o total, e aceitar cada pendente', () => {
    const out = html();
    expect(out).toContain('Aceitar todas as sugestões (11 un)');
    expect(out).toContain('Aceitar');
  });

  it('oferece desfazer só nas quantidades confirmadas pelo gestor', () => {
    expect(html()).toContain('Desfazer');
    expect(html({ vinculos: [vinculos[0]] })).not.toContain('Desfazer');
  });

  it('quem não edita não vê ações de confirmação', () => {
    const out = html({ canEdit: false });
    expect(out).not.toContain('Aceitar');
    expect(out).not.toContain('Desfazer');
  });

  it('mostra a mensagem de vazio quando o contrato não tem empenhos lidos', () => {
    expect(html({ vinculos: [] })).toContain('Nenhum empenho lido deste contrato');
  });

  it('sem unidades internas cadastradas avisa em vez de mostrar o seletor', () => {
    expect(html()).toContain('Sem unidades cadastradas');
    const out = html({ allocationOptions: [{ id: 'a1', unitName: 'DTI', saldoQty: 10 }] });
    expect(out).toContain('Não vinculado');
    expect(out).toContain('DTI');
  });
});
