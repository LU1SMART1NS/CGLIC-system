import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AllocationsTab } from '../AllocationsTab';

const departments = [
  { id: 'd1', sigla: 'DSUSP', nomeCompleto: 'Diretoria do Sistema Único', ativo: true },
  { id: 'd2', sigla: 'DGE', nomeCompleto: 'Diretoria de Gestão e Ensino', ativo: true }
];

const base: React.ComponentProps<typeof AllocationsTab> = {
  ugUasg: '200331',
  totalUG: 801,
  totalAllocated: 300,
  remaining: 501,
  percentAllocated: 37.4,
  rows: [
    { id: 'a1', unitName: 'DSUSP', allocatedQty: 300, empenhado: 120, pendentes: 2, pendentesSugerido: 11 }
  ],
  semUnidade: { empenhado: 0, count: 0 },
  departments,
  departmentsLoading: false,
  canManage: true,
  editingId: null,
  unitName: 'DGE',
  onUnitChange: vi.fn(),
  qty: '',
  onQtyChange: vi.fn(),
  onSubmit: vi.fn(),
  onCancelEdit: vi.fn(),
  saving: false,
  error: null,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onGoToContracts: vi.fn()
};

const html = (over: Partial<typeof base> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <AllocationsTab {...base} {...over} />
    </MemoryRouter>
  );

describe('AllocationsTab', () => {
  it('resume o quantitativo em uma linha, sem cartões', () => {
    const out = html();
    expect(out).toContain('Disponível da UG 200331');
    expect(out).toContain('Alocado');
    expect(out).toContain('A alocar');
    expect(out).toContain('801');
    expect(out).not.toContain('kpi-card');
  });

  it('lista a alocação com empenhado, a empenhar e as pendências da unidade', () => {
    const out = html();
    expect(out).toContain('DSUSP');
    expect(out).toContain('300');
    expect(out).toContain('120');
    expect(out).toContain('180');
    expect(out).toContain('2 pendentes');
  });

  it('a empenhar negativo (empenhado acima do alocado) aparece em vermelho', () => {
    const out = html({ rows: [{ id: 'a1', unitName: 'DSUSP', allocatedQty: 10, empenhado: 25, pendentes: 0, pendentesSugerido: 0 }] });
    expect(out).toContain('-15');
    expect(out).toContain('var(--danger)');
  });

  it('o formulário marca unidades já alocadas e desabilita quando todas já têm alocação', () => {
    expect(html()).toContain('DSUSP — Diretoria do Sistema Único (já alocada)');
    const todas = html({ rows: [
      { id: 'a1', unitName: 'DSUSP', allocatedQty: 1, empenhado: 0, pendentes: 0, pendentesSugerido: 0 },
      { id: 'a2', unitName: 'DGE', allocatedQty: 1, empenhado: 0, pendentes: 0, pendentesSugerido: 0 }
    ] });
    expect(todas).toContain('Todas as unidades do catálogo já têm alocação neste item');
  });

  it('em edição o botão vira Salvar e aparece Cancelar', () => {
    const out = html({ editingId: 'a1', unitName: 'DSUSP', qty: 300 });
    expect(out).toContain('Editar alocação');
    expect(out).toContain('Salvar');
    expect(out).toContain('Cancelar');
  });

  it('catálogo vazio mostra o aviso com o atalho e esconde o formulário', () => {
    const out = html({ departments: [] });
    expect(out).toContain('Nenhuma unidade interna cadastrada');
    expect(out).toContain('Abrir Unidades Internas');
    expect(out).not.toContain('Alocar quantitativo');
  });

  it('quem não gerencia alocações não vê formulário nem ações', () => {
    const out = html({ canManage: false });
    expect(out).not.toContain('Alocar quantitativo');
    expect(out).not.toContain('Editar a alocação');
    expect(out).not.toContain('Excluir a alocação');
  });

  it('mostra o erro de gravação com o componente de alerta', () => {
    expect(html({ error: 'Limite excedido!' })).toContain('Limite excedido!');
  });

  it('avisa dos empenhos confirmados ainda sem unidade, com o atalho para vincular', () => {
    const out = html({ semUnidade: { empenhado: 34, count: 3 } });
    expect(out).toContain('empenhos-sem-unidade');
    expect(out).toContain('3 empenhos');
    expect(out).toContain('34 un');
    expect(out).toContain('Vincular em Contratos e empenhos');
    expect(html()).not.toContain('empenhos-sem-unidade');
  });

  it('sem alocações mostra o estado vazio', () => {
    expect(html({ rows: [] })).toContain('Nenhuma alocação interna neste item');
  });
});
