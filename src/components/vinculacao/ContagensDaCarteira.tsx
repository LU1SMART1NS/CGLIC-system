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
import { carregarCarteiraParaOMenu } from './cargaDaCarteiraDoMenu';
import { useTelaCarregada } from '../layout/useTelaCarregada';

/**
 * Calcula os contratos sem ata (os mesmos da fila de Vínculos) e, para o coordenador, as filas da Central de
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
  const { rows, isLoading: carregando, alocacoesComErro } = useCarteiraItens({ arps: scopedArps, itemsByAta, gestorByAta });
  // Sem as alocações, o menu fica sem número em vez de contar todos os itens como a alocar.
  const pronto = !isLoading && !scopeLoading && !carregando && !alocacoesComErro;
  const total = React.useMemo(() => (pronto ? contarItensAAlocar(rows) : null), [pronto, rows]);
  React.useEffect(() => {
    definirContagemExtra('itensAAlocar', total);
  }, [total]);
  React.useEffect(() => () => definirContagemExtra('itensAAlocar', null), []);
  return null;
};

/**
 * Invisível. Espera a tela aberta encher (useTelaCarregada) e espia o cache para saber se as atas e os contratos já
 * estão no navegador; só então monta os cálculos pesados, que passam a ler o cache. Se o usuário entrou por uma tela
 * que não carrega a carteira, ela é carregada uma vez, em segundo plano, depois que a tela encheu; daí os números
 * aparecem em qualquer tela. Antes a carga saía 3 s depois de abrir, no meio da carga do Início.
 */
export const ContagensDaCarteira: React.FC = () => {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const telaCarregada = useTelaCarregada();
  const contaContratos = role === 'admin' || role === 'gestor';
  const contaItens = role === 'admin' || role === 'gestor_saldos';

  React.useEffect(() => {
    if (!telaCarregada || (!contaContratos && !contaItens)) return;
    carregarCarteiraParaOMenu(queryClient, { contratos: contaContratos }).catch(() => {
      // Sem a carteira, o menu mostra só o que as consultas leves já sabem.
    });
  }, [queryClient, telaCarregada, contaContratos, contaItens]);

  const atas = useQueries({ queries: UASGS_CGLIC.map((uasg) => ({ ...getAtaSourceQueryOptions(uasg), enabled: false })) });
  const contratos = useQueries({ queries: UASGS_CGLIC.map((uasg) => ({ ...getContractsDashboardQueryOptions(uasg), enabled: false })) });
  const atasNoCache = atas.every((q) => q.data !== undefined);
  const contratosNoCache = contratos.every((q) => q.data !== undefined);

  // A tela pode pôr atas e contratos no cache cedo (o Início lê os dois); os cálculos, que leem mais umas dez
  // consultas, esperam a tela encher do mesmo jeito.
  if (!telaCarregada) return null;
  return (
    <>
      {contaContratos && atasNoCache && contratosNoCache && <CalculoDaCarteira contaDistribuicao={role === 'admin'} />}
      {contaItens && atasNoCache && <CalculoItensAAlocar />}
    </>
  );
};
