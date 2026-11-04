import { useMemo } from 'react';
import { useUsers } from './useUsers';
import type { SystemUser } from '../types/user';

/**
 * Ids dos gestores de atas e contratos ativos. Coordenador, perfil consulta e usuário inativado ficam de fora, mesmo
 * que ainda tenham atribuição antiga em ata_managers/contract_managers. `null` quando a lista de usuários não está
 * disponível (carregando, ou perfil sem acesso a ela): aí as telas mostram a atribuição como está.
 */
export function idsDosGestoresAtivos(usuarios: SystemUser[] | undefined): ReadonlySet<string> | null {
  if (!usuarios) return null;
  return new Set(usuarios.filter((u) => u.ativo && u.perfil === 'gestor').map((u) => u.id));
}

export function useIdsGestoresAtivos(): ReadonlySet<string> | null {
  const { data: usuarios } = useUsers();
  return useMemo(() => idsDosGestoresAtivos(usuarios), [usuarios]);
}

/**
 * A atribuição conta como gestor da carteira? Sem a lista de usuários, sim; com ela, só se for de um gestor ativo.
 * Atribuição sem usuário ligado (só o nome) continua valendo.
 */
export function atribuicaoValida(gestorUserId: string | null | undefined, idsAtivos: ReadonlySet<string> | null): boolean {
  if (!idsAtivos || !gestorUserId) return true;
  return idsAtivos.has(gestorUserId);
}
