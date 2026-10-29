import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AppRole } from '../../../types/rbac';
import { AreaTabs } from '../AreaTabs';

const estado: { role: AppRole } = { role: 'admin' };
vi.mock('../../../hooks/useAtasAMontar', () => ({ useAtasAMontar: () => ({ data: [{}, {}] }) }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ role: estado.role, user: { id: 'u1' } }) }));

const abas = (role: AppRole, rota: string) => {
  estado.role = role;
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={[rota]}>
      <AreaTabs />
    </MemoryRouter>
  );
  const textos = (classe: string) =>
    Array.from(html.matchAll(new RegExp(`class="${classe}"[^>]*>([^<]+)<`, 'g'))).map((m) => m[1]);
  return { grupos: textos('area-tab'), paginas: textos('area-subtab'), html };
};

describe('abas do Início (grupos como em Ajustes)', () => {
  it('coordenador: Atas e Contratos · Emendas, e embaixo Painel · Distribuição', () => {
    expect(abas('admin', '/instrumentos')).toMatchObject({ grupos: ['Atas e Contratos', 'Emendas'], paginas: ['Painel', 'Distribuição'] });
    expect(abas('admin', '/atas/distribuicao')).toMatchObject({ grupos: ['Atas e Contratos', 'Emendas'], paginas: ['Painel', 'Distribuição'] });
  });

  it('em Emendas, que tem uma página só, a segunda linha some', () => {
    expect(abas('admin', '/emendas/inicio')).toMatchObject({ grupos: ['Atas e Contratos', 'Emendas'], paginas: [] });
  });

  it('a consulta vê só a linha dos grupos; o gestor não vê abas', () => {
    expect(abas('leitor', '/instrumentos')).toMatchObject({ grupos: ['Atas e Contratos', 'Emendas'], paginas: [] });
    expect(abas('gestor', '/instrumentos').html).toBe('');
  });
});

describe('abas da Carteira em duas linhas (Atas: Registradas · A montar)', () => {
  it('coordenador e gestor: Atas · Contratos · Itens, e embaixo da aba Atas Registradas · A montar', () => {
    for (const role of ['admin', 'gestor'] as AppRole[]) {
      expect(abas(role, '/atas')).toMatchObject({ grupos: ['Atas', 'Contratos', 'Itens'], paginas: ['Registradas', 'A montar'] });
      expect(abas(role, '/atas/montar')).toMatchObject({ grupos: ['Atas', 'Contratos', 'Itens'], paginas: ['Registradas', 'A montar'] });
    }
    expect(abas('admin', '/atas').html).toContain('A montar<span class="area-tab-count">2</span>');
  });

  it('em Contratos e Itens, que têm uma página só, a segunda linha some', () => {
    expect(abas('admin', '/contratos')).toMatchObject({ grupos: ['Atas', 'Contratos', 'Itens'], paginas: [] });
    expect(abas('admin', '/itens')).toMatchObject({ grupos: ['Atas', 'Contratos', 'Itens'], paginas: [] });
  });

  it('quem não monta ata vê só a primeira linha', () => {
    expect(abas('leitor', '/atas')).toMatchObject({ grupos: ['Atas', 'Contratos', 'Itens'], paginas: [] });
    expect(abas('gestor_saldos', '/atas')).toMatchObject({ grupos: ['Atas', 'Itens'], paginas: [] });
  });

  it('os filtros em comum seguem para Contratos, mas não para A montar', () => {
    const { html } = abas('admin', '/atas?situacao=critico&busca=pneu');
    expect(html).toContain('href="/contratos?situacao=critico&amp;busca=pneu"');
    expect(html).toContain('href="/atas/montar"');
  });
});
