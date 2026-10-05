import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { ManagerCell, canAssignManager } from '../ManagerAssign';

describe('ManagerCell — coluna Gestor das carteiras', () => {
  it('só o coordenador (admin) atribui gestor', () => {
    expect(canAssignManager('admin')).toBe(true);
    expect(canAssignManager('gestor')).toBe(false);
    expect(canAssignManager('leitor')).toBe(false);
    expect(canAssignManager('gestor_saldos')).toBe(false);
  });

  it('mostra só o nome, sem ação de atribuir, mesmo para o coordenador', () => {
    const html = renderToStaticMarkup(<ManagerCell gestorNome="Maria" canAssign testId="t" />);
    expect(html).toContain('Maria');
    expect(html).not.toContain('<button');
  });

  it('sem gestor: traço para quem não atribui; atalho para a Central para o coordenador', () => {
    expect(renderToStaticMarkup(<ManagerCell canAssign={false} testId="t" />)).toContain('—');
    const coordenador = renderToStaticMarkup(<ManagerCell canAssign testId="t" />);
    expect(coordenador).toContain('atribuir na Central');
  });
});
