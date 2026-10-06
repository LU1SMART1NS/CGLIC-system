import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { abrirAoClicarNaLinha, propsDeLinhaClicavel, SetaDaLinha } from '../CarteiraRowLink';

/** Evento mínimo: `closest` diz se o alvo está dentro de um botão/link da linha. */
const clique = (dentroDeInterativo: boolean) =>
  ({ target: { closest: () => (dentroDeInterativo ? {} : null) } }) as any;

describe('abrirAoClicarNaLinha', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('abre ao clicar numa parte comum da linha', () => {
    vi.stubGlobal('window', { getSelection: () => ({ toString: () => '' }) });
    const abrir = vi.fn();
    abrirAoClicarNaLinha(abrir)(clique(false));
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('não abre ao clicar num botão ou link da linha, nem ao selecionar texto', () => {
    vi.stubGlobal('window', { getSelection: () => ({ toString: () => '' }) });
    const abrir = vi.fn();
    abrirAoClicarNaLinha(abrir)(clique(true));
    vi.stubGlobal('window', { getSelection: () => ({ toString: () => 'texto selecionado' }) });
    abrirAoClicarNaLinha(abrir)(clique(false));
    expect(abrir).not.toHaveBeenCalled();
  });
});

describe('propsDeLinhaClicavel', () => {
  it('sem destino a linha não vira clique', () => {
    expect(propsDeLinhaClicavel(null, 'Abrir')).toEqual({});
    expect(propsDeLinhaClicavel(undefined, 'Abrir')).toEqual({});
  });

  it('padrão: a linha é um botão para o teclado, com dica e rótulo próprios', () => {
    const p = propsDeLinhaClicavel(vi.fn(), 'Ver itens', { rotulo: 'Ver itens: Saldo baixo' });
    expect(p).toMatchObject({ className: 'action-row--go', role: 'button', tabIndex: 0, title: 'Ver itens', 'aria-label': 'Ver itens: Saldo baixo' });
  });

  it('Enter e espaço abrem; outras teclas e teclas vindas de dentro da linha não', () => {
    const abrir = vi.fn();
    const p = propsDeLinhaClicavel(abrir, 'Abrir');
    const linha = {};
    const tecla = (key: string, target = linha) => ({ key, target, currentTarget: linha, preventDefault: vi.fn() }) as any;
    p.onKeyDown!(tecla('Enter'));
    p.onKeyDown!(tecla(' '));
    p.onKeyDown!(tecla('a'));
    p.onKeyDown!(tecla('Enter', {}));
    expect(abrir).toHaveBeenCalledTimes(2);
  });

  it("teclado 'link': só o mouse na linha, sem botão aninhado (o link do número cobre o teclado)", () => {
    const p = propsDeLinhaClicavel(vi.fn(), 'Ver detalhes do contrato', { teclado: 'link' });
    expect(p.className).toBe('action-row--go');
    expect(p.onClick).toBeTypeOf('function');
    expect(p.role).toBeUndefined();
    expect(p.tabIndex).toBeUndefined();
    expect(p.onKeyDown).toBeUndefined();
  });
});

describe('SetaDaLinha', () => {
  it('é só enfeite para o leitor de tela', () => {
    expect(renderToStaticMarkup(<SetaDaLinha />)).toContain('aria-hidden="true"');
  });
});
