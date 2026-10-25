import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AppRole } from '../../../types/rbac';
import { AreaTabs } from '../AreaTabs';

const estado: { role: AppRole } = { role: 'admin' };
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
