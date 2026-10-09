import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SeloPapelSenasp } from '../SeloPapelSenasp';

describe('SeloPapelSenasp', () => {
  it('ata da CGLIC não mostra selo', () => {
    expect(renderToStaticMarkup(<SeloPapelSenasp arp={{ codigoUnidadeGerenciadora: '200331', papelSenasp: 'GERENCIADORA' }} />)).toBe('');
  });
  it('participação: rótulo e UASG gerenciadora', () => {
    const html = renderToStaticMarkup(<SeloPapelSenasp arp={{ codigoUnidadeGerenciadora: '200342', papelSenasp: 'PARTICIPANTE' }} />);
    expect(html).toContain('SENASP participante');
    expect(html).toContain('UASG 200342');
    expect(html).toContain('var(--color-info-bg)');
  });
  it('adesão: rótulo próprio, borda tracejada e sem UASG quando pedido', () => {
    const html = renderToStaticMarkup(<SeloPapelSenasp arp={{ codigoUnidadeGerenciadora: '200109', papelSenasp: 'ADESAO' }} comUasg={false} />);
    expect(html).toContain('Adesão da SENASP');
    expect(html).toContain('dashed');
    expect(html).not.toContain('UASG 200109</span>');
  });
});
