import React from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { UASGS_CGLIC } from '../../config/unidadesGestoras';
import { getAtaSourceQueryOptions } from '../../hooks/useAta';
import { getContractsDashboardQueryOptions } from '../../hooks/useContractsDashboard';
import { useAtasPortfolio } from '../../hooks/useAtasPortfolio';
import { useCarteiraItens } from '../../hooks/useCarteiraItens';
import { usePendenciasVinculoAta } from '../atas/distribuicao/usePendenciasVinculoAta';
import { useDistribuicaoDaCarteira } from '../atas/distribuicao/useDistribuicaoDaCarteira';
import { contarItensAAlocar, definirContagemExtra } from './contagemExtras';
import { carregarCarteiraParaOMenu, ESPERA_CARGA_DO_MENU_MS } from './cargaDaCarteiraDoMenu';

/**
 * Calcula os contratos sem ata (os mesmos da fila da Vinculação) e, para o coordenador, as filas da Central de
 * Distribuição (atas sem gestor e gestor diferente da ata), e entrega os números ao menu.
 */
const CalculoDaCarteira: React.FC<{ contaDistribuicao: boolean }> = ({ contaDistribuicao }) => {
  const { atas, contratos, links, pendencias, totalSemVinculo, naoPertencemSemGestor, isBusy } = usePendenciasVinculoAta();
  // Mesmos contratos da lista principal da fila: sem vínculo e "não pertence a ata" ainda sem gestor.
  const contratosAta = totalSemVinculo + naoPertencemSemGestor;
  const { divergencias } = useDistribuicaoDaCarteira({ atas, contratos, links });
  const atasSemGestor = pendencias.atasSemGestor.length;
  React.useEffect(() => {
    definirContagemExtra('contratosAta', isBusy ? null : contratosAta);
    definirContagemExtra('atasSemGestor', isBusy || !contaDistribuicao ? null : atasSemGestor);
    definirContagemExtra('gestorDiferente', isBusy || !contaDistribuicao ? null : divergencias.length);
  }, [isBusy, contratosAta, contaDistribuicao, atasSemGestor, divergencias.length]);
  React.useEffect(
    () => () => {
      definirContagemExtra('contratosAta', null);
      definirContagemExtra('atasSemGestor', null);
      definirContagemExtra('gestorDiferente', null);
    },
    []
  );
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
 * Invisível. Espia o cache para saber se as atas e os contratos já estão no navegador; só então monta os cálculos
 * pesados, que passam a ler o cache. Se o usuário entrou por uma tela que não carrega a carteira (ex.: Visão Geral),
 * ela é carregada uma vez, em segundo plano, alguns segundos depois de abrir o sistema; daí os números aparecem em
 * qualquer tela.
 */
export const ContagensDaCarteira: React.FC = () => {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const contaContratos = role === 'admin' || role === 'gestor';
  const contaItens = role === 'admin' || role === 'gestor_saldos';

  React.useEffect(() => {
    if (!contaContratos && !contaItens) return undefined;
    const t = setTimeout(() => {
      carregarCarteiraParaOMenu(queryClient, { contratos: contaContratos }).catch(() => {
        // Sem a carteira, o menu mostra só o que as consultas leves já sabem.
      });
    }, ESPERA_CARGA_DO_MENU_MS);
    return () => clearTimeout(t);
  }, [queryClient, contaContratos, contaItens]);

  const atas = useQueries({ queries: UASGS_CGLIC.map((uasg) => ({ ...getAtaSourceQueryOptions(uasg), enabled: false })) });
  const contratos = useQueries({ queries: UASGS_CGLIC.map((uasg) => ({ ...getContractsDashboardQueryOptions(uasg), enabled: false })) });
  const atasNoCache = atas.every((q) => q.data !== undefined);
  const contratosNoCache = contratos.every((q) => q.data !== undefined);

  return (
    <>
      {contaContratos && atasNoCache && contratosNoCache && <CalculoDaCarteira contaDistribuicao={role === 'admin'} />}
      {contaItens && atasNoCache && <CalculoItensAAlocar />}
    </>
  );
};
