import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AllocationsTab } from '../AllocationsTab';
import { CatalogoVazioAviso } from '../../alocacao/AlocarUnidadeModal';

const departments = [
  { id: 'd1', sigla: 'DSUSP', nomeCompleto: 'Diretoria do Sistema Único', ativo: true },
  { id: 'd2', sigla: 'DGE', nomeCompleto: 'Diretoria de Gestão e Ensino', ativo: true }
];

const base: React.ComponentProps<typeof AllocationsTab> = {
  ugUasg: '200331',
  item: { numeroAta: '00041/2024', uasg: '200331', numeroItem: '1', quantitativoSenasp: 801 },
  totalUG: 801,
  totalAllocated: 300,
  remaining: 501,
  percentAllocated: 37.4,
  rows: [
    { id: 'a1', unitName: 'DSUSP', allocatedQty: 300, empenhado: 120, vinculados: 3 }
  ],
  semUnidade: { empenhado: 0, count: 0 },
  departments,
  departmentsLoading: false,
  canManage: true,
  error: null,
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

  it('lista a alocação com empenhado e a empenhar da unidade (sem "pendentes": a quantidade vem do vínculo aos itens)', () => {
    const out = html();
    expect(out).toContain('DSUSP');
    expect(out).toContain('300');
    expect(out).toContain('120');
    expect(out).toContain('180');
    expect(out).not.toContain('pendente');
  });

  it('a empenhar negativo (empenhado acima do alocado) aparece em vermelho', () => {
    const out = html({ rows: [{ id: 'a1', unitName: 'DSUSP', allocatedQty: 10, empenhado: 25, vinculados: 0 }] });
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
      { id: 'a1', unitName: 'DSUSP', allocatedQty: 1, empenhado: 0, vinculados: 0 },
      { id: 'a2', unitName: 'DGE', allocatedQty: 1, empenhado: 0, vinculados: 0 }
    ] });
    expect(todas).toContain('title="Alocar quantitativo a uma unidade interna"');
    expect(todas).not.toMatch(/aria-disabled="true"[^>]*title="Alocar quantitativo/);
    expect(html({ departments: [] })).not.toMatch(/aria-disabled="true"[^>]*title="Alocar quantitativo/);
  });

  it('com empenho vinculado a lixeira fica desativada e diz por quê; sem empenho fica ativa', () => {
    const out = html({ rows: [
      { id: 'a1', unitName: 'DSUSP', allocatedQty: 300, empenhado: 120, vinculados: 3 },
      { id: 'a2', unitName: 'DGE', allocatedQty: 50, empenhado: 0, vinculados: 0 }
    ] });
    expect(out).toContain('DSUSP tem 3 empenhos vinculados. Para remover, desvincule os empenhos na aba Contratos e empenhos.');
    expect(out).toMatch(/aria-label="DSUSP tem 3 empenhos vinculados[^"]*"[^>]*disabled=""|disabled=""[^>]*aria-label="DSUSP tem 3 empenhos vinculados/);
    expect(out).toContain('Excluir a alocação de DGE');
    expect(out).not.toMatch(/disabled=""[^>]*aria-label="Excluir a alocação de DGE"|aria-label="Excluir a alocação de DGE"[^>]*disabled=""/);
  });

  it('a explicação diz o que fazer quando o catálogo está vazio', () => {
    const out = renderToStaticMarkup(<MemoryRouter><CatalogoVazioAviso /></MemoryRouter>);
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

  it('avisa no topo, com o mesmo desenho da faixa de pendências, das notas vinculadas a este item ainda sem unidade', () => {
    const out = html({ semUnidade: { empenhado: 34, count: 3 } });
    expect(out).toContain('empenhos-sem-unidade');
    expect(out).toContain('background:var(--color-warning-bg)');
    expect(out).toContain('notas vinculadas a este item estão');
    expect(out).toContain('(34 un)');
    expect(out).toContain('Escolher a unidade em Contratos e empenhos');
    expect(html()).not.toContain('empenhos-sem-unidade');
    // fica logo abaixo do resumo, antes da tabela
    expect(out.indexOf('allocations-summary')).toBeLessThan(out.indexOf('empenhos-sem-unidade'));
    expect(out.indexOf('empenhos-sem-unidade')).toBeLessThan(out.indexOf('Alocações'));
  });

  it('no singular o aviso concorda: "1 nota vinculada a este item está"', () => {
    expect(html({ semUnidade: { empenhado: 5, count: 1 } })).toContain('nota vinculada a este item está');
  });

  it('sem alocações mostra o estado vazio', () => {
    const out = html({ rows: [] });
    expect(out).toContain('Nenhuma alocação interna neste item');
    expect(out).toContain('Use o botão Alocar');
  });
});
