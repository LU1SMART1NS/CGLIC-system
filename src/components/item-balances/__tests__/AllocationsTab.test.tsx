import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AllocationsTab, AllocationUnavailableNotice } from '../AllocationsTab';

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
  onSubmit: vi.fn().mockResolvedValue(true),
  onStartNew: vi.fn(),
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
    expect(out).toContain('allocations-summary');
    expect(out).toContain('300 de 801');
    expect(out).toContain('A alocar');
    expect(out).toContain('UG 200331');
    expect(out).toContain('role="progressbar"');
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

  it('a aba tem só o botão Alocar: o formulário não fica na página', () => {
    const out = html();
    expect(out).toContain('Alocar');
    expect(out).not.toContain('allocation-form');
    expect(out).not.toContain('Gerenciar Unidades Internas');
    expect(out).not.toContain('Quantidade');
  });

  it('o botão Alocar fica ativo mesmo sem unidade disponível: a explicação vem ao clicar', () => {
    const todas = html({ rows: [
      { id: 'a1', unitName: 'DSUSP', allocatedQty: 1, empenhado: 0, pendentes: 0, pendentesSugerido: 0 },
      { id: 'a2', unitName: 'DGE', allocatedQty: 1, empenhado: 0, pendentes: 0, pendentesSugerido: 0 }
    ] });
    expect(todas).toContain('title="Alocar quantitativo a uma unidade interna"');
    expect(todas).not.toMatch(/aria-disabled="true"[^>]*title="Alocar quantitativo/);
    expect(html({ departments: [] })).not.toMatch(/aria-disabled="true"[^>]*title="Alocar quantitativo/);
  });

  it('a explicação diz o que fazer quando todas as unidades já foram alocadas', () => {
    const out = renderToStaticMarkup(<MemoryRouter><AllocationUnavailableNotice catalogEmpty={false} /></MemoryRouter>);
    expect(out).toContain('Todas as unidades do catálogo já têm alocação neste item');
    expect(out).toContain('use o lápis na tabela');
    expect(out).toContain('href="/admin/departamentos"');
    expect(out).not.toContain('target="_blank"');
  });

  it('a explicação diz o que fazer quando o catálogo está vazio', () => {
    const out = renderToStaticMarkup(<MemoryRouter><AllocationUnavailableNotice catalogEmpty /></MemoryRouter>);
    expect(out).toContain('catálogo de Unidades Internas está vazio');
  });

  it('catálogo vazio mostra o aviso com o atalho na página', () => {
    const out = html({ departments: [] });
    expect(out).toContain('Nenhuma unidade interna cadastrada');
    expect(out).toContain('Abrir Unidades Internas');
  });

  it('o atalho para Unidades Internas abre na mesma aba, sem nova guia', () => {
    const out = html({ departments: [] });
    expect(out).toContain('href="/admin/departamentos"');
    expect(out).not.toContain('target="_blank"');
  });

  it('quem não gerencia alocações não vê o Alocar nem as ações de linha', () => {
    const out = html({ canManage: false });
    expect(out).not.toContain('title="Alocar quantitativo a uma unidade interna"');
    expect(out).not.toContain('Editar a alocação');
    expect(out).not.toContain('Excluir a alocação');
  });

  it('mostra o erro de gravação na página enquanto a janela está fechada', () => {
    expect(html({ error: 'Limite excedido!' })).toContain('Limite excedido!');
  });

  it('avisa no topo, com o mesmo desenho da faixa de pendências, dos empenhos confirmados ainda sem unidade', () => {
    const out = html({ semUnidade: { empenhado: 34, count: 3 } });
    expect(out).toContain('empenhos-sem-unidade');
    expect(out).toContain('background:var(--color-warning-bg)');
    expect(out).toContain('empenhos confirmados');
    expect(out).toContain('(34 un)');
    expect(out).toContain('Vincular em Contratos e empenhos');
    expect(html()).not.toContain('empenhos-sem-unidade');
    // fica logo abaixo do resumo, antes da tabela
    expect(out.indexOf('allocations-summary')).toBeLessThan(out.indexOf('empenhos-sem-unidade'));
    expect(out.indexOf('empenhos-sem-unidade')).toBeLessThan(out.indexOf('Alocações'));
  });

  it('no singular o aviso concorda: "1 empenho confirmado"', () => {
    expect(html({ semUnidade: { empenhado: 5, count: 1 } })).toContain('empenho confirmado');
  });

  it('sem alocações mostra o estado vazio', () => {
    const out = html({ rows: [] });
    expect(out).toContain('Nenhuma alocação interna neste item');
    expect(out).toContain('Use o botão Alocar');
  });
});
