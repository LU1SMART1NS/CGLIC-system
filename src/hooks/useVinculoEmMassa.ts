import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { executarVinculos, type PlanoVinculo, type ResultadoVinculo } from '../services/vinculoEmMassaService';
import { invalidateManagerQueries } from './useAssignManager';

export interface EstadoVinculoEmMassa {
  rodando: boolean;
  /** Contratos já concluídos / total do lote. */
  feitos: number;
  total: number;
  /** Contrato em andamento (número). */
  atual?: string;
  resultados: ResultadoVinculo[];
}

const INICIAL: EstadoVinculoEmMassa = { rodando: false, feitos: 0, total: 0, resultados: [] };

/**
 * Executa o vínculo em massa e, ao terminar, atualiza as telas que dependem dele: lista geral de vínculos
 * (Central, escopo do perfil gestor), vínculos por item e por ata, saldos, empenhos e os gestores (o vínculo
 * leva o gestor da ata para o contrato, ou o do contrato para a ata, no banco).
 */
export function useVinculoEmMassa() {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<EstadoVinculoEmMassa>(INICIAL);
  const pararRef = useRef(false);
  const rodandoRef = useRef(false);

  const executar = useCallback(
    async (planos: PlanoVinculo[]): Promise<ResultadoVinculo[]> => {
      if (rodandoRef.current || planos.length === 0) return [];
      rodandoRef.current = true;
      pararRef.current = false;
      setEstado({ rodando: true, feitos: 0, total: planos.length, resultados: [] });
      let resultados: ResultadoVinculo[] = [];
      try {
        resultados = await executarVinculos(planos, {
          parar: () => pararRef.current,
          onProgresso: (feitos, total, atual) => setEstado((e) => ({ ...e, feitos, total, atual: atual.numero }))
        });
      } finally {
        rodandoRef.current = false;
        setEstado({ rodando: false, feitos: resultados.length, total: planos.length, resultados });
        queryClient.invalidateQueries({ queryKey: ['all-arp-item-contract-links'] });
        queryClient.invalidateQueries({ queryKey: ['item-contract-links'] });
        queryClient.invalidateQueries({ queryKey: ['ata-linked-contracts'] });
        queryClient.invalidateQueries({ queryKey: ['ata-item-saldos'] });
        queryClient.invalidateQueries({ queryKey: ['management-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['contratos-sem-ata'] });
        queryClient.invalidateQueries({ queryKey: ['distribuicao-avisos'] });
        invalidateManagerQueries(queryClient);
      }
      return resultados;
    },
    [queryClient]
  );

  const parar = useCallback(() => {
    pararRef.current = true;
  }, []);
  const limpar = useCallback(() => setEstado(INICIAL), []);

  return { estado, executar, parar, limpar };
}
