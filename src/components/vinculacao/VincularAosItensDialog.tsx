import React from 'react';
import { DistribuirEmpenhoModal } from '../contracts/DistribuirEmpenhoModal';
import { useItensDoContrato } from '../../hooks/useItensDoContrato';
import { useAcoesDistribuicaoEmpenho, useDistribuicoesEmpenhoContrato } from '../../hooks/useDistribuicaoEmpenhos';
import { empenhadoPorItem, itensNumerados } from '../../utils/distribuicaoEmpenho';
import type { DistribuicaoDoEmpenho, QuantidadeNoItem } from '../../services/distribuicaoEmpenhoService';
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
    if (nota) acoes.vincular.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nota?.contratoEmpenhoId]);

  if (!nota) return null;

  const salvar = (quantidades: QuantidadeNoItem[], observacao: string) =>
    acoes.vincular.mutate(
      { contratoEmpenhoId: nota.contratoEmpenhoId, itens: quantidades, observacao },
      {
        onSuccess: () => {
          toast.success(`${nota.numeroOficial} vinculada a ${quantidades.length === 1 ? '1 item' : `${quantidades.length} itens`} do contrato ${numeroContrato}.`);
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
      empenhadoOutras={empenhadoPorItem(distribuicoes, itens, nota.contratoEmpenhoId)}
      isLoading={acoes.vincular.isPending || (Boolean(nota) && !itensDoContrato)}
      erro={acoes.vincular.error?.message}
      onSalvar={salvar}
      onFechar={onFechar}
    />
  );
};
