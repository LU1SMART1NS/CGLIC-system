import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check } from 'lucide-react';
import { PainelCartao } from '../PainelCartao';
import { PainelGaveta } from '../PainelGavetas';
import { PAINEL_GAVETA_NOMES } from '../painelGavetasConfig';

describe('PainelCartao — cartão de resumo comum ao Painel e ao Início de Emendas', () => {
  it('mostra rótulo, número com a palavra, linhas rótulo/valor e a borda do cartão escolhido', () => {
    const html = renderToStaticMarkup(
      <PainelCartao
        rotulo="Empenhados"
        icone={<Check size={16} />}
        tom="success"
        valor="96"
        unidade="pedidos"
        ativo
        onClick={() => {}}
        testId="cartao-teste"
        linhas={[
          { rotulo: 'Linhas com nota de empenho', valor: '1.406 de 2.134' },
          { rotulo: 'Em contratação', valor: '12', tom: 'danger' }
        ]}
      />
    );
    expect(html).toContain('data-testid="cartao-teste"');
    expect(html).toContain('Empenhados');
    expect(html).toContain('96');
    expect(html).toContain('pedidos');
    expect(html).toContain('1.406 de 2.134');
    expect(html).toContain('color:var(--color-danger)');
    expect(html).toContain('2px solid var(--primary)');
  });
});

describe('PainelGaveta — nome curto, regra no ⓘ e subtítulo de uma frase', () => {
  it('os nomes das gavetas de Emendas têm no máximo 3 palavras', () => {
    for (const nome of Object.values(PAINEL_GAVETA_NOMES)) expect(nome.split(' ').length).toBeLessThanOrEqual(3);
  });
  it('a regra fica no ⓘ ao lado do nome e o subtítulo diz a ação', () => {
    const html = renderToStaticMarkup(
      <PainelGaveta id="notasSemPedido" subtitulo="Confira o nº da emenda no pedido." hint="Notas da UG 200330 sem pedido." onFechar={() => {}}>
        <div>tabela</div>
      </PainelGaveta>
    );
    expect(html).toContain('Notas sem pedido');
    expect(html).toContain('painel-gaveta-hint-notasSemPedido');
    expect(html).toContain('Confira o nº da emenda no pedido.');
  });
});
