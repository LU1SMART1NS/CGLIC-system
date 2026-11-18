import { describe, it, expect, vi } from 'vitest';
import { resolveOwnAppRoleComRepeticao } from '../AuthContext';

describe('leitura do perfil com repetição', () => {
  it('falha momentânea: tenta de novo e devolve o perfil', async () => {
    const ler = vi.fn().mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce('admin');
    await expect(resolveOwnAppRoleComRepeticao('u1', [0, 0], ler)).resolves.toBe('admin');
    expect(ler).toHaveBeenCalledTimes(2);
  });

  it('falha em todas as tentativas (3): devolve o erro, que vira roleStatus "error"', async () => {
    const ler = vi.fn().mockRejectedValue(new Error('500'));
    await expect(resolveOwnAppRoleComRepeticao('u1', [0, 0], ler)).rejects.toThrow('500');
    expect(ler).toHaveBeenCalledTimes(3);
  });

  it('sem perfil (null) não é falha: volta na hora, sem repetir', async () => {
    const ler = vi.fn().mockResolvedValue(null);
    await expect(resolveOwnAppRoleComRepeticao('u1', [0, 0], ler)).resolves.toBeNull();
    expect(ler).toHaveBeenCalledTimes(1);
  });
});
