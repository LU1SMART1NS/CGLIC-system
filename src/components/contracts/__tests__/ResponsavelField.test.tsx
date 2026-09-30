import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResponsavelField } from '../ResponsavelField';

vi.mock('../../../hooks/useUsers', () => ({
  useUsers: () => ({
    data: [
      { id: 'u-1', nome: 'Luis', ativo: true },
      { id: 'u-2', nome: 'Ana Fiscal', ativo: true },
      { id: 'u-3', nome: 'Inativo', ativo: false }
    ]
  })
}));

const render = (nome: string, userId?: string, gestorNome: string | null = 'Luis') =>
  renderToStaticMarkup(
    <ResponsavelField id="r" value={{ nome, userId }} onChange={() => {}} gestorNome={gestorNome ?? undefined} gestorLabel="gestor do contrato" />
  );

describe('ResponsavelField', () => {
  it('sem responsável próprio, seleciona o gestor do contrato', () => {
    const html = render('');
    expect(html).toMatch(/<option value="__herdar__" selected="">Gestor do contrato: Luis<\/option>/);
    expect(html).not.toContain('aria-label="Nome do responsável"');
  });

  it('lista só usuários ativos e oferece "Outro"', () => {
    const html = render('');
    expect(html).toContain('>Ana Fiscal<');
    expect(html).not.toContain('>Inativo<');
    expect(html).toContain('Outro (digitar nome)…');
  });

  it('seleciona o usuário quando o responsável próprio é um usuário do sistema', () => {
    expect(render('Ana Fiscal', 'u-2')).toMatch(/<option value="u-2" selected="">Ana Fiscal<\/option>/);
  });

  it('abre o campo de texto quando o responsável é um nome fora da lista', () => {
    const html = render('Servidor Externo');
    expect(html).toMatch(/<option value="__outro__" selected="">/);
    expect(html).toContain('value="Servidor Externo"');
  });

  it('avisa quando não há gestor definido', () => {
    expect(render('', undefined, null)).toContain('Sem responsável (gestor do contrato não definido)');
  });
});
