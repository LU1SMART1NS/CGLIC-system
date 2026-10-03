import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Instrument360Hero } from '../Instrument360Hero';

const render = (props: Partial<React.ComponentProps<typeof Instrument360Hero>> = {}) =>
  renderToStaticMarkup(
    <Instrument360Hero
      backLabel="Voltar"
      onBack={() => undefined}
      title="Contrato nº 00230/2026"
      identifiers={[{ label: 'Processo', value: '08020.001450/2024-79' }]}
      identifiersTestId="ident"
      {...props}
    >
      <div data-testid="indicadores" />
    </Instrument360Hero>
  );

describe('Instrument360Hero', () => {
  it('põe os identificadores DEPOIS dos indicadores, no rodapé', () => {
    const html = render();
    expect(html.indexOf('data-testid="indicadores"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="ident"')).toBeGreaterThan(html.indexOf('data-testid="indicadores"'));
  });

  it('segue a mesma ordem nas três telas: UASG, título, fornecedor, objeto, origem, datas', () => {
    const html = render({
      eyebrow: 'UASG 200331 · SENASP',
      subtitle: 'FORNECEDOR X',
      objeto: 'Texto do objeto',
      origin: { label: 'Ata de origem', value: 'nº 00059/2025' },
      dates: [{ label: 'Assinatura', value: '07/07/2026' }, { label: 'Vigência', value: '07/07/2026 a 07/07/2027', emphasis: true }]
    });
    const ordem = ['UASG 200331', 'Contrato nº 00230/2026', 'FORNECEDOR X', 'Texto do objeto', 'Ata de origem', 'Assinatura', 'Vigência'].map((t) => html.indexOf(t));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
  });

  it('exibe em frase normal o objeto que vem todo em maiúsculas e não mexe no que já tem minúscula', () => {
    expect(render({ objeto: 'AQUISIÇÃO DE TABLETS PARA A SENASP.' })).toContain('Aquisição de tablets para a SENASP.');
    expect(render({ objeto: 'Registro de preços para aquisição de Tablets' })).toContain('Registro de preços para aquisição de Tablets');
  });

  it('gestor, origem e datas ficam na coluna lateral, com a origem na primeira linha', () => {
    const html = render({
      manager: <span>GESTOR</span>,
      origin: { label: 'Ata de origem', value: 'nº 00059/2025' },
      dates: [{ label: 'Assinatura', value: '07/07/2026' }]
    });
    const lateral = html.slice(html.indexOf('data-testid="instrument-360-side"'));
    const ordem = ['GESTOR', 'Ata de origem', 'Assinatura'].map((t) => lateral.indexOf(t));
    expect(ordem.every((i) => i >= 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    // objeto e título ficam fora da coluna lateral
    expect(html.indexOf('Contrato nº 00230/2026')).toBeLessThan(html.indexOf('data-testid="instrument-360-side"'));
  });

  it('sem gestor, origem nem datas, não há coluna lateral', () => {
    expect(render()).not.toContain('instrument-360-side');
  });

  it('o aviso de risco aparece ao lado do valor da data, em vermelho', () => {
    const html = render({ dates: [{ label: 'Garantia', value: 'até 10/10/2026', risk: 'vence antes do fim' }] });
    expect(html).toContain('vence antes do fim');
    expect(html).toContain('i360-dr-risk');
  });

  it('o aviso ao lado da situação é um selo vermelho', () => {
    const html = render({ status: { faixa: 'REGULAR', label: 'Vigente', neutral: true }, statusAlert: 'Ata vence em 8 dias' });
    expect(html).toContain('data-testid="instrument-360-status-alert"');
    expect(html).toContain('Ata vence em 8 dias');
    expect(render()).not.toContain('instrument-360-status-alert');
  });

  it('selo neutro não leva a cor da faixa; o encerrado leva', () => {
    expect(render({ status: { faixa: 'REGULAR', label: 'Vigente', neutral: true } })).toContain('Vigente');
    expect(render({ status: { faixa: 'EXPIRADO', label: 'Encerrada' } })).toContain('Encerrada');
  });

  it('identificador sem valor aparece como "Não informado"', () => {
    expect(render({ identifiers: [{ label: 'Categoria', value: undefined }] })).toContain('Não informado');
  });
});
