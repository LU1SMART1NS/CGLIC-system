import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../../../hooks/useAssignManager', () => ({ useAssignManager: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('../../../hooks/useUsers', () => ({ useUsers: () => ({ data: [] }) }));
vi.mock('../../../hooks/useRoles', () => ({ useRoles: () => ({ data: [] }) }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, role: 'admin' }) }));

import { ManagerCell, canAssignManager } from '../ManagerAssign';

describe('ManagerCell — coluna Gestor das carteiras', () => {
  it('só admin e gestor podem atribuir', () => {
    expect(canAssignManager('admin')).toBe(true);
    expect(canAssignManager('gestor')).toBe(true);
    expect(canAssignManager('leitor')).toBe(false);
    expect(canAssignManager('gestor_saldos')).toBe(false);
  });

  it('sem permissão, mostra apenas o nome (ou traço)', () => {
    const comNome = renderToStaticMarkup(
      <ManagerCell target={{ tipo: 'ATA', ataKey: '1' }} gestorNome="Maria" canAssign={false} testId="t" links={[]} />
    );
    expect(comNome).toContain('Maria');
    expect(comNome).not.toContain('<button');

    const semNome = renderToStaticMarkup(
      <ManagerCell target={{ tipo: 'ATA', ataKey: '1' }} canAssign={false} testId="t" links={[]} />
    );
    expect(semNome).toContain('—');
  });

  it('com permissão, oferece "Atribuir" quando não há gestor e o lápis para alterar quando há', () => {
    const semNome = renderToStaticMarkup(
      <ManagerCell target={{ tipo: 'ATA', ataKey: '1' }} canAssign testId="t" links={[]} />
    );
    expect(semNome).toContain('Atribuir');

    const comNome = renderToStaticMarkup(
      <ManagerCell target={{ tipo: 'CONTRATO', contractKey: 'k' }} gestorNome="Maria" canAssign testId="t" links={[]} />
    );
    expect(comNome).toContain('Alterar gestor (Maria)');
  });
});
