import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionButton } from '../components/ActionButton';
import { ACTIONS, type ActionId } from '../actions';

describe('ActionButton e catálogo de ações', () => {
  it('a mesma ação tem sempre a mesma cor, em qualquer tela', () => {
    const a = renderToStaticMarkup(<ActionButton action="naoPertence" size="sm" />);
    const b = renderToStaticMarkup(<ActionButton action="naoPertence" size="sm" data-testid="outra-tela" />);
    expect(a).toContain('ds-btn--ghostDanger');
    expect(b).toContain('ds-btn--ghostDanger');
    expect(a).toContain('Não pertence a nenhuma ata');
  });

  it('não aceita escolher variante no ponto de uso', () => {
    // @ts-expect-error variant não faz parte das props de ActionButton
    renderToStaticMarkup(<ActionButton action="salvar" variant="danger" />);
    expect(renderToStaticMarkup(<ActionButton action="salvar" />)).toContain('ds-btn--primary');
  });

  it('só ícone: ghost, ghostDanger para destrutivas, nome acessível pelo rótulo', () => {
    const editar = renderToStaticMarkup(<ActionButton action="editar" iconOnly label="Editar unidade" />);
    expect(editar).toContain('ds-btn--ghost');
    expect(editar).not.toContain('ds-btn--outline');
    expect(editar).toContain('aria-label="Editar unidade"');
    const excluir = renderToStaticMarkup(<ActionButton action="excluir" iconOnly />);
    expect(excluir).toContain('ds-btn--ghostDanger');
    expect(excluir).toContain('aria-label="Excluir"');
  });

  it('children troca o texto e mantém ícone e cor da ação', () => {
    const html = renderToStaticMarkup(<ActionButton action="naoPertence">3 não pertencem a nenhuma ata</ActionButton>);
    expect(html).toContain('3 não pertencem a nenhuma ata');
    expect(html).toContain('ds-btn--ghostDanger');
  });

  it('hierarquia: destrutivas em vermelho discreto, auxiliares com borda, verde só na sugestão', () => {
    const porVariante = (v: string) => (Object.keys(ACTIONS) as ActionId[]).filter((id) => ACTIONS[id].variant === v);
    expect(porVariante('ghostDanger').sort()).toEqual(['cancelarCiclo', 'desativar', 'desativarCadastro', 'descartar', 'desvincular', 'excluir', 'naoPertence', 'remover']);
    expect(porVariante('success')).toEqual(['aplicarSugestao']);
    expect(porVariante('danger')).toEqual([]);
    expect(porVariante('primary').sort()).toEqual(['indicarFornecedor', 'novo', 'salvar', 'vincular']);
  });
});
