import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PainelBotoesGavetas } from '../PainelGavetas';
import { GavetaDistribuicao } from '../GavetaDistribuicao';

describe('PainelBotoesGavetas — áreas da Visão Geral', () => {
  it('cada botão diz como está a área e marca a gaveta aberta', () => {
    const html = renderToStaticMarkup(
      <PainelBotoesGavetas
        botoes={[{ id: 'situacao', resumo: '17 contratos vencem em 90 dias', atencao: true }, { id: 'distribuicao', resumo: '9 atas sem gestor' }]}
        aberta="distribuicao"
        onToggle={() => {}}
      />
    );
    expect(html).toContain('17 contratos vencem em 90 dias');
    expect(html).toContain('pn-gaveta-resumo--atencao');
    expect(html).toMatch(/aria-expanded="true"[^>]*painel-gaveta-btn-distribuicao/);
  });
});

describe('GavetaDistribuicao — cartões por gestor', () => {
  const linhas = [
    { gestor: { userId: 'ana', nome: 'Ana' }, atas: { total: 8, vencem90: 2, criticas: 1 }, contratos: { total: 32, vencem90: 0, criticas: 0 } },
    { atas: { total: 0, vencem90: 0, criticas: 0 }, contratos: { total: 0, vencem90: 0, criticas: 0 } }
  ];
  it('mostra atas antes de contratos, com vencimentos e críticas, e esconde "sem gestor" vazio', () => {
    const html = renderToStaticMarkup(<GavetaDistribuicao linhas={linhas} isLoading={false} onEscolherGestor={() => {}} onDistribuir={() => {}} />);
    expect(html.indexOf('Atas')).toBeLessThan(html.indexOf('Contratos'));
    expect(html).toContain('2 vencem');
    expect(html).toContain('1 crítica');
    expect(html).not.toContain('painel-distribuicao-sem-gestor');
  });
});
