import React from 'react';
import { useQueries } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { UASGS_CGLIC } from '../../config/unidadesGestoras';
import { getAtaSourceQueryOptions } from '../../hooks/useAta';
import { getContractsDashboardQueryOptions } from '../../hooks/useContractsDashboard';
import { useAtasPortfolio } from '../../hooks/useAtasPortfolio';
import { useCarteiraItens } from '../../hooks/useCarteiraItens';
import { usePendenciasVinculoAta } from '../atas/distribuicao/usePendenciasVinculoAta';
import { contarItensAAlocar, definirContagemExtra } from './contagemExtras';

/** Calcula os contratos sem ata (os mesmos da fila) e entrega o número ao menu. */
const CalculoContratosAta: React.FC = () => {
  const { totalSemVinculo, isBusy } = usePendenciasVinculoAta();
  React.useEffect(() => {
    definirContagemExtra('contratosAta', isBusy ? null : totalSemVinculo);
  }, [isBusy, totalSemVinculo]);
  React.useEffect(() => () => definirContagemExtra('contratosAta', null), []);
  return null;
};

/** Calcula os itens a alocar (os mesmos da página Alocação) e entrega o número ao menu. */
const CalculoItensAAlocar: React.FC = () => {
  const { scopedArps, isLoading, scopeLoading, itemsByAta, gestorByAta } = useAtasPortfolio();
  const { rows, isLoading: carregando } = useCarteiraItens({ arps: scopedArps, itemsByAta, gestorByAta });
  const pronto = !isLoading && !scopeLoading && !carregando;
  const total = React.useMemo(() => (pronto ? contarItensAAlocar(rows) : null), [pronto, rows]);
  React.useEffect(() => {
    definirContagemExtra('itensAAlocar', total);
  }, [total]);
  React.useEffect(() => () => definirContagemExtra('itensAAlocar', null), []);
  return null;
};

/**
 * Invisível. Espia o cache (sem buscar nada) para saber se as atas e os contratos já foram carregados no navegador;
 * só então monta os cálculos pesados, que passam a ler o cache. Assim o menu não dispara a carga da carteira em toda
 * tela: o número aparece depois que o usuário abre a Carteira, o Painel ou uma página de Vinculação ou Alocação.
 */
export const ContagensDaCarteira: React.FC = () => {
  const { role } = useAuth();
  const contaContratos = role === 'admin' || role === 'gestor';
  const contaItens = role === 'admin' || role === 'gestor_saldos';

  const atas = useQueries({ queries: UASGS_CGLIC.map((uasg) => ({ ...getAtaSourceQueryOptions(uasg), enabled: false })) });
  const contratos = useQueries({ queries: UASGS_CGLIC.map((uasg) => ({ ...getContractsDashboardQueryOptions(uasg), enabled: false })) });
  const atasNoCache = atas.every((q) => q.data !== undefined);
  const contratosNoCache = contratos.every((q) => q.data !== undefined);

  return (
    <>
      {contaContratos && atasNoCache && contratosNoCache && <CalculoContratosAta />}
      {contaItens && atasNoCache && <CalculoItensAAlocar />}
    </>
  );
};
