import { useMemo } from 'react';
import { getArpVigenciaStatus, type ArpVigenciaStatus } from '../services/temporalEngineService';

/**
 * Adaptador fino de apresentação sobre a regra canônica de vigência de Ata
 * (temporalEngineService.getArpVigenciaStatus — Fase 10-A.2). Este hook NÃO
 * contém nenhuma regra própria: apenas memoiza o resultado da função de
 * domínio para os componentes de UI que hoje reimplementavam a mesma janela
 * de 90 dias com `new Date()` cru (ArpSearch.tsx, AtaCardHeader.tsx,
 * InternalAllocationsDashboard.tsx).
 */
export function useArpVigenciaStatus(
  dataVigenciaFinal: string | undefined | null,
  currentDate?: Date
): ArpVigenciaStatus | null {
  return useMemo(
    () => getArpVigenciaStatus(dataVigenciaFinal, currentDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentDate normalmente é estável (undefined) entre renders; recalcular por identidade de Date evitaria memoização útil.
    [dataVigenciaFinal, currentDate]
  );
}
