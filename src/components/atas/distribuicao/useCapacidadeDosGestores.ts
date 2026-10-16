import React from 'react';
import { useGestorNiveis } from '../../../hooks/useGestorNiveis';
import { useUsers } from '../../../hooks/useUsers';
import { capacidadeDe } from './nivelGestor';
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
      const userId = usuarios?.find((u) => u.nome === gestorNome)?.id ?? null;
      return { userId, registro: (userId && niveis?.[userId]) || null };
    },
    [usuarios, niveis]
  );
  const capacidadeDoGestor = React.useCallback((gestorNome: string) => capacidadeDe(nivelDe(gestorNome).registro?.nivel), [nivelDe]);
  return { nivelDe, capacidadeDoGestor };
}
