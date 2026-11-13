import React from 'react';
import { useGestorNiveis } from '../../../hooks/useGestorNiveis';
import { useUsers } from '../../../hooks/useUsers';
import { CAPACIDADE_COORDENADOR, capacidadeDe } from './nivelGestor';
import type { NivelDoGestor } from './EquipeFila';

/**
 * Nível de cada gestor (migration 140), pelo nome da carteira → conta → nível gravado, e a capacidade que ele dá.
 * Serve à Central de Distribuição e aos cartões do Início (a mesma conta nos dois lugares).
 */
export function useCapacidadeDosGestores() {
  const { data: niveis } = useGestorNiveis();
  const { data: usuarios } = useUsers();
  const nivelDe = React.useCallback(
    (gestorNome: string): NivelDoGestor => {
      const u = usuarios?.find((x) => x.nome === gestorNome);
      const userId = u?.id ?? null;
      const coordenador = Boolean(u?.ativo && u.perfil === 'coordenador');
      return { userId, registro: (userId && niveis?.[userId]) || null, ...(coordenador ? { coordenador } : {}) };
    },
    [usuarios, niveis]
  );
  // Coordenador com carteira: capacidade fixa de coordenador, no lugar do nível.
  const capacidadeDoGestor = React.useCallback(
    (gestorNome: string) =>
      nivelDe(gestorNome).coordenador ? CAPACIDADE_COORDENADOR : capacidadeDe(nivelDe(gestorNome).registro?.nivel),
    [nivelDe]
  );
  return { nivelDe, capacidadeDoGestor };
}
