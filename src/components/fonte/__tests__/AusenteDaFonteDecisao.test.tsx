import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ausenteDaLinha } from '../../../services/ausentesDaFonteService';

const nota = ausenteDaLinha({
  tipo: 'NOTA',
  chave: 'ce-1',
  contract_key: '200331-00145-2025',
  numero: '2025NE000123',
  valor: 1000,
  detectado_em: '2026-10-09T15:00:00+00:00',
  gestor_contrato: 'Alan Jonne',
  distribuido_por_nome: 'Daniel',
  quantidades_informadas: 0,
  unidades: null,
  ciclos: null
});

vi.mock('../../../hooks/useAusentesDaFonte', () => ({
  useAusentesDaFonte: () => ({
    ausentes: [nota],
    porChave: new Map([['NOTA|ce-1', nota]]),
    isLoading: false,
    podeDecidir: true,
    decidir: { isPending: false, mutateAsync: vi.fn() }
  })
}));
// Sem DOM no teste: o Modal vira um bloco com título, conteúdo e rodapé.
vi.mock('../../../design-system', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../design-system')>()),
  Modal: ({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  )
}));

import { AusenteDaFonteDecisao } from '../AusenteDaFonteDecisao';

describe('AusenteDaFonteDecisao', () => {
  it('mostra a nota, o trabalho, as duas decisões e pede justificativa', () => {
    const html = renderToStaticMarkup(<AusenteDaFonteDecisao tipo="NOTA" chave="ce-1" onClose={() => {}} />);
    expect(html).toContain('Nota de empenho a conferir');
    expect(html).toContain('Nota 2025NE000123');
    expect(html).toContain('Gestor do contrato: Alan Jonne');
    expect(html).toContain('distribuição entre os itens feita por Daniel');
    expect(html).toContain('Manter nota');
    expect(html).toContain('Retirar nota');
    expect(html).toContain('Justificativa (obrigatória)');
  });

  it('se a marca já saiu, avisa e não deixa decidir', () => {
    const html = renderToStaticMarkup(<AusenteDaFonteDecisao tipo="FATURA" chave="999" onClose={() => {}} />);
    expect(html).toContain('Esta fatura já não está a conferir');
  });
});
