import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AutorEmenda, EmendaPainelSemParlamentar, EmendaSiop } from '../../../services/emendasService';

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-11-03',
  useSalvarEmendaSiop: () => ({ isPending: false, mutateAsync: vi.fn() })
}));
vi.mock('../../../design-system/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock('../../../design-system/components/Modal', () => ({
  Modal: ({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) => (
    <div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {children}
      {footer}
    </div>
  )
}));

import { EmendaSiopModal } from '../EmendaSiopModal';

const autor = { id: 'A1', nome: 'Marcel van Hattem', tipo: 'DEPUTADO', uf: 'RS', partido: 'NOVO' } as AutorEmenda;
const registrada = { id: 'e1', numero: '41160011', ano: 2026, autorId: 'A1', valor: 1000, gnd: 'GND-4', beneficiarioId: 'b1', objeto: 'Viaturas', vistaEm: '2026-10-28', observacao: null, versao: 1, criadoPorNome: null } as EmendaSiop;
const doPainel: EmendaPainelSemParlamentar = { ano: 2026, numero: '50010003', autor: 'Fulano de Tal', tipoAutor: 'Deputado Federal', uf: 'MG', valor: 750_000, gnd: 'GND-3', foraCompraDireta: [], baseSiafiEm: '2026-11-02' };
const abrir = (emenda: EmendaSiop | null, painel: EmendaPainelSemParlamentar | null = null) =>
  renderToStaticMarkup(<EmendaSiopModal emenda={emenda} doPainel={painel} emendas={emenda ? [emenda] : []} pedidos={[]} autores={[autor]} onClose={() => {}} />);

describe('EmendaSiopModal (03/11/2026: o servidor registra as emendas do painel do SIOP)', () => {
  it('sem os campos de beneficiário e objeto: são do pedido', () => {
    const html = abrir(registrada);
    expect(html).not.toContain('Beneficiário indicado no SIOP');
    expect(html).not.toContain('Objeto no SIOP');
    expect(html).not.toContain('emendas-emenda-siop-beneficiario');
    expect(html).not.toContain('emendas-emenda-siop-objeto');
    expect(html).toContain('Emenda 4116 0011 / 2026');
    expect(html).toContain('Marcel van Hattem');
  });

  it('emenda do painel sem parlamentar: abre com nº, ano, valor e GND do painel; a CAEP só escolhe o parlamentar', () => {
    const html = abrir(null, doPainel);
    expect(html).toContain('Emenda 5001 0003 / 2026');
    expect(html).toContain('Emenda do painel do SIOP sem parlamentar no cadastro: escolha o parlamentar uma vez.');
    expect(html).toMatch(/value="2026 5001 0003"/);
    expect(html).toMatch(/value="750\.000,00"/);
    expect(html).toMatch(/<option value="GND-3" selected="">/);
    expect(html).toContain('data-testid="emendas-emenda-siop-busca-autor"');
    expect(html).toContain('No painel do SIOP: <b>Fulano de Tal</b> · Deputado Federal · MG');
    expect(html).not.toContain('Copie do SIOP');
  });
});
