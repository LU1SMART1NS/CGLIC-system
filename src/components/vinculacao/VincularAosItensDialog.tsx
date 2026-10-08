import React from 'react';
import { DistribuirEmpenhoModal } from '../contracts/DistribuirEmpenhoModal';
import { useItensDoContrato } from '../../hooks/useItensDoContrato';
import { useAcoesDistribuicaoEmpenho, useDistribuicoesEmpenhoContrato } from '../../hooks/useDistribuicaoEmpenhos';
import { empenhadoPorItem, itensNumerados } from '../../utils/distribuicaoEmpenho';
import type { DistribuicaoDoEmpenho, ParcelaDoItem } from '../../services/distribuicaoEmpenhoService';
import { useToast } from '../../design-system';

interface VincularAosItensDialogProps {
  /** Nota a vincular; nula fecha a janela. */
  nota: DistribuicaoDoEmpenho | null;
  numeroContrato: string;
  onFechar: () => void;
  /** Depois de gravar (a fila é relida pelo cache). */
  onVinculada?: (nota: DistribuicaoDoEmpenho) => void;
}

/**
 * A janela "Vincular aos itens" fora do Contrato 360: carrega os itens do contrato e as outras notas dele quando a
 * nota é escolhida na fila, e grava pela mesma RPC.
 */
export const VincularAosItensDialog: React.FC<VincularAosItensDialogProps> = ({ nota, numeroContrato, onFechar, onVinculada }) => {
  const contractKey = nota?.contractKey ?? '';
  const { data: itensDoContrato } = useItensDoContrato(contractKey, Boolean(nota));
  const { data: distribuicoes = [] } = useDistribuicoesEmpenhoContrato(contractKey);
  const acoes = useAcoesDistribuicaoEmpenho(contractKey);
  const toast = useToast();
  const itens = React.useMemo(() => itensNumerados(itensDoContrato?.itens ?? []), [itensDoContrato]);

  React.useEffect(() => {
    if (nota) acoes.distribuir.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota?.contratoEmpenhoId]);

  if (!nota) return null;

  const salvar = (parcelas: ParcelaDoItem[], observacao: string) =>
    acoes.distribuir.mutate(
      { contratoEmpenhoId: nota.contratoEmpenhoId, parcelas, valorNota: nota.valorNota, observacao },
      {
        onSuccess: () => {
          toast.success(`${nota.numeroOficial} vinculada a ${parcelas.length === 1 ? '1 item' : `${parcelas.length} itens`} do contrato ${numeroContrato}.`);
          onVinculada?.(nota);
          onFechar();
        }
      }
    );

  return (
    <DistribuirEmpenhoModal
      distribuicao={nota}
      numeroContrato={numeroContrato}
      itens={itens}
      empenhadoOutras={empenhadoPorItem(distribuicoes, nota.contratoEmpenhoId)}
      isLoading={acoes.distribuir.isPending || (Boolean(nota) && !itensDoContrato)}
      erro={acoes.distribuir.error?.message}
      onSalvar={salvar}
      onFechar={onFechar}
    />
  );
};
