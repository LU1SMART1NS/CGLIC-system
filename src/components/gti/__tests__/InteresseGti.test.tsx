import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EXPLICACAO_GTI, InteresseGtiBotao, InteresseGtiGaveta } from '../InteresseGti';
import type { FatiasDaAta } from '../../../config/gruposGti';

const comPrincipal = {
  total: 1000,
  fatias: [
    { grupo: 'CONSESP', quantidade: 600, orgaos: 10, pct: 60 },
    { grupo: 'LIGABOM', quantidade: 400, orgaos: 5, pct: 40 }
  ],
  principal: { grupo: 'CONSESP', quantidade: 600, orgaos: 10, pct: 60 },
  orgaosAConfirmar: 0
} as unknown as FatiasDaAta;
const soAConfirmar = {
  total: 534,
  fatias: [{ grupo: 'A_CONFIRMAR', quantidade: 534, orgaos: 4, pct: 100 }],
  principal: null,
  orgaosAConfirmar: 4
} as unknown as FatiasDaAta;

describe('Interesse por GTI no topo do item e da ata', () => {
  it('rótulo "Interesse por GTI:" e botão fechado, com a célula GTI das carteiras (principal, segunda fatia e barra)', () => {
    const h = renderToStaticMarkup(<InteresseGtiBotao fatias={comPrincipal} aberto={false} onToggle={() => {}} />);
    expect(h).toContain('Interesse por GTI:');
    expect(h).not.toContain('Ver mais');
    expect(h).toMatch(/aria-expanded="false"[^>]*interesse-gti-btn/);
    expect(h).toContain('interesse-gti-resumo');
    expect(h).toContain('CONSESP 60%');
    expect(h).toContain('Fatia por GTI');
  });

  it('sem grupo confirmado, a célula mostra os órgãos a confirmar', () => {
    const h = renderToStaticMarkup(<InteresseGtiBotao fatias={soAConfirmar} aberto={false} onToggle={() => {}} />);
    expect(h).toContain('interesse-gti-resumo');
  });

  it('sem participantes, nem botão nem gaveta', () => {
    const vazio = { total: 0, fatias: [], principal: null, orgaosAConfirmar: 0 } as unknown as FatiasDaAta;
    expect(renderToStaticMarkup(<InteresseGtiBotao fatias={vazio} aberto={false} onToggle={() => {}} />)).toBe('');
    expect(renderToStaticMarkup(<InteresseGtiGaveta fatias={vazio} onFechar={() => {}} explicacao={EXPLICACAO_GTI.item} />)).toBe('');
  });

  it('gaveta aberta com a explicação em palavras simples e o principal', () => {
    const h = renderToStaticMarkup(<InteresseGtiGaveta fatias={comPrincipal} onFechar={() => {}} explicacao={EXPLICACAO_GTI.item} />);
    expect(h).toContain('Quanto cada grupo pediu neste item');
    expect(h).toContain('Interesse principal:');
    expect(h).toContain('600 un');
  });

  it('na ata, a gaveta mostra o valor em R$ e a explicação da ata', () => {
    const ata = { ...comPrincipal, medida: 'VALOR', fatias: [{ grupo: 'CONSESP', quantidade: 1500000, orgaos: 10, pct: 60 }] } as unknown as FatiasDaAta;
    const h = renderToStaticMarkup(<InteresseGtiGaveta fatias={ata} onFechar={() => {}} explicacao={EXPLICACAO_GTI.ata} />);
    expect(h).toContain('nesta ata, em valor');
    expect(h).toContain('R$');
  });

  it('sem fatias da ata (ainda carregando ou ata de outro órgão), sem botão', () => {
    expect(renderToStaticMarkup(<InteresseGtiBotao fatias={undefined} aberto={false} onToggle={() => {}} />)).toBe('');
  });
});
