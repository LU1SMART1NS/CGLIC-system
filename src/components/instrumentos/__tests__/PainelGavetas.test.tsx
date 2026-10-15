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

describe('GavetaDistribuicao — cartões organizados', () => {
  const lado = (total: number, vencem90 = 0, criticas = 0) => ({ total, vencem90, criticas });
  const linhas = [
    { gestor: { userId: 'alan', nome: 'Alan Jonne' }, atas: lado(3), contratos: lado(2) },
    { gestor: { userId: 'borges', nome: 'Borges' }, atas: lado(30, 5, 13), contratos: lado(40, 9, 3) },
    { gestor: { userId: 'daniela', nome: 'Daniela' }, atas: lado(0), contratos: lado(0) },
    { atas: lado(0), contratos: lado(36, 8, 2) }
  ];
  const html = renderToStaticMarkup(<GavetaDistribuicao linhas={linhas} isLoading={false} onEscolherGestor={() => {}} onDistribuir={() => {}} />);

  it('sem gestor primeiro, só com o lado que tem algo', () => {
    expect(html.indexOf('painel-distribuicao-sem-gestor')).toBeLessThan(html.indexOf('painel-distribuicao-gestor'));
    expect(html).toContain('Distribuir');
  });
  it('críticas somadas no cabeçalho e gestor com mais críticas antes', () => {
    expect(html).toContain('16 críticas');
    expect(html.indexOf('Borges')).toBeLessThan(html.indexOf('Alan Jonne'));
  });
  it('sem zeros, com a carga e o gestor sem carteira no rodapé', () => {
    expect(html).not.toContain('0 vencem');
    expect(html).not.toContain('0 críticas');
    expect(html).toContain('70 instrumentos · maior carteira');
    expect(html).toContain('Sem carteira: Daniela');
  });
});
