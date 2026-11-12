import { useMemo } from 'react';
import { useUsers } from './useUsers';
import type { SystemUser } from '../types/user';

/** Pode ter carteira de atas e contratos: gestor ou coordenador ativo (o coordenador também pode ser gestor). */
export function podeTerCarteira(u: Pick<SystemUser, 'ativo' | 'perfil'>): boolean {
  return u.ativo && (u.perfil === 'gestor' || u.perfil === 'coordenador');
}

/**
 * Ids de quem pode ter carteira de atas e contratos: gestores e coordenadores ativos. Perfil consulta e usuário
 * inativado ficam de fora, mesmo que ainda tenham atribuição antiga em ata_managers/contract_managers. `null` quando a
 * lista de usuários não está disponível (carregando, ou perfil sem acesso a ela): aí as telas mostram a atribuição
 * como está.
 */
export function idsDosGestoresAtivos(usuarios: SystemUser[] | undefined): ReadonlySet<string> | null {
  if (!usuarios) return null;
  return new Set(usuarios.filter(podeTerCarteira).map((u) => u.id));
}

/** Coordenadores ativos (id → "Coordenador"): etiqueta no cartão e fora do rodapé "Sem carteira". */
export function outrosPerfisComCarteira(usuarios: SystemUser[] | undefined): ReadonlyMap<string, string> {
  return new Map((usuarios ?? []).filter((u) => u.ativo && u.perfil === 'coordenador').map((u) => [u.id, 'Coordenador']));
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
