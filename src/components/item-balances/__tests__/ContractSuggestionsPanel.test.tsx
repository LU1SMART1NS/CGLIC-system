import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractSuggestionsPanel } from '../ContractSuggestionsPanel';
import { formatNumeroContrato, displayContractNumber } from '../../../utils/contractNumber';
import type { ItemContractSuggestion } from '../../../utils/itemContractSuggestions';

const suggestion = (key: string): ItemContractSuggestion => ({
  contractKey: key,
  linkable: true,
  sources: ['pncp'],
  pncp: { numeroContrato: '7/2026', uasg: '160001', nomeRazaoSocialFornecedor: 'Fornecedor X' } as any,
  quantidadeContratada: 40
});

const baseProps: React.ComponentProps<typeof ContractSuggestionsPanel> = {
  suggestions: [suggestion('160001-7-2026')],
  dismissed: [suggestion('160001-8-2026')],
  loading: false,
  canEdit: true,
  busy: false,
  onLink: vi.fn(),
  onDismiss: vi.fn(),
  onRestore: vi.fn()
};

const html = (over: Partial<React.ComponentProps<typeof ContractSuggestionsPanel>> = {}) =>
  renderToStaticMarkup(<ContractSuggestionsPanel {...baseProps} {...over} />);

describe('ContractSuggestionsPanel', () => {
  it('lista a sugestão com fornecedor, quantidade e ações de vincular e descartar', () => {
    const out = html();
    expect(out).toContain('7/2026');
    expect(out).toContain('Fornecedor X');
    expect(out).toContain('PNCP');
    expect(out).toContain('Vincular');
    expect(out).toContain('Descartar');
  });

  it('oferece ver os descartados quando existem', () => {
    expect(html()).toContain('Ver descartados (1)');
    expect(html({ dismissed: [] })).not.toContain('Ver descartados');
  });

  it('sem UASG na API mostra o aviso e só oferece descartar', () => {
    const naoVinculavel = { ...suggestion('PNCP:2252/2026'), linkable: false };
    const out = html({ suggestions: [naoVinculavel] });
    expect(out).toContain('UASG não identificada na API');
    expect(out).not.toContain('Vincular');
    expect(out).toContain('Descartar');
  });

  it('esconde as ações para quem não pode editar', () => {
    const out = html({ canEdit: false });
    expect(out).not.toContain('Vincular');
    expect(out).not.toContain('Descartar');
  });

  it('mostra mensagem quando não há sugestões', () => {
    expect(html({ suggestions: [], dismissed: [] })).toContain('Nenhum contrato sugerido para este item.');
  });

  it('mostra carregamento e erro no lugar da lista', () => {
    expect(html({ loading: true })).toContain('Buscando contratos no PNCP...');
    expect(html({ error: 'Falha na API' })).toContain('Falha na API');
  });
});

describe('formatNumeroContrato', () => {
  it('insere a barra antes do ano', () => {
    expect(formatNumeroContrato('001602026')).toBe('00160/2026');
    expect(formatNumeroContrato('00160', 2026)).toBe('00160/2026');
    expect(formatNumeroContrato('2026NE000123')).toBe('2026NE000123');
    expect(formatNumeroContrato('02252/2026')).toBe('02252/2026');
    expect(displayContractNumber({ numero: '002302026', ano: 2026, numeroFormatado: '002302026' })).toBe('00230/2026');
    expect(displayContractNumber({ numero: '00230', ano: 2026 })).toBe('00230/2026');
    expect(displayContractNumber({ numero: '', ano: 2026, numeroFormatado: '00230/2026' })).toBe('00230/2026');
  });
});
