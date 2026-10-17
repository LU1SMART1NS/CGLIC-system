import React, { useMemo } from 'react';
import { useAtasPortfolio, getArpPrazo } from '../../../hooks/useAtasPortfolio';
import { useContractsPortfolio } from '../../../hooks/useContractsPortfolio';
import { useArpItemContractLinks } from '../../../hooks/useAtaManagers';
import { useContratosSemAta } from '../../../hooks/useContratosSemAta';
import { useDescartesAtaContrato } from '../../../hooks/useDescartesAtaContrato';
import { useMotivosVinculoManual } from '../../../hooks/useVinculoAutomatico';
import { useNumerosDosItensDosContratos } from '../../../hooks/useItensDoContrato';
import { formatContractNumber } from '../../../utils/contractNumber';
import { agruparVinculos, buildPendenciasDistribuicao, contratosParaConferirParcial, type FilaAta, type FilaContrato } from './contratosSemAta';
import type { ItemDaAta } from './vinculoEmMassa';
import { chaveGestaoDaArp } from '../../../utils/ataIdentidade';
import type { EstadoMotivos } from '../../../utils/vinculoAutomatico';
import type { ArpItemContractLinkPair } from '../../../services/arpContractLinkService';
import type { ContratoSemAtaConfirmacao } from '../../../services/contratoSemAtaService';
import type { DescarteAtaContrato } from '../../../services/contratoAtaDescarteService';
import { ROTULO_VINCULOS_ITEM_CONTRATO } from '../../../hooks/useAssignedManagementScope';
import { naoCarregou, type LeituraDaTela } from '../../fonte/useLeiturasComFalha';

/**
 * Atas, contratos e vínculos da carteira, cruzados para dizer quais contratos ainda não têm ata (e qual é a ata
 * provável). Serve à fila "Contratos à ata" do menu Vínculos e à Central de Distribuição (atas sem gestor e carga
 * por gestor usam as mesmas pendências).
 */
const SEM_LINKS: ArpItemContractLinkPair[] = [];
const SEM_CONFIRMACOES: Record<string, ContratoSemAtaConfirmacao> = {};
const SEM_DESCARTES: Record<string, DescarteAtaContrato> = {};

/**
 * `pendencias: true` lê também o painel do Início (pendências de cada contrato), que só a carga dos gestores usa: a
 * Central de Distribuição e o "Atribuir gestor" aberto. A fila, os números do menu e a gaveta do Início não precisam.
 */
export function usePendenciasVinculoAta({ pendencias: comPendencias = false }: { pendencias?: boolean } = {}) {
  const atas = useAtasPortfolio();
  const contratos = useContractsPortfolio({ pendencias: comPendencias });
  const linksQuery = useArpItemContractLinks();
  const { data: links = SEM_LINKS, isLoading: linksLoading } = linksQuery;
  const semAtaQuery = useContratosSemAta();
  const { data: confirmacoesSemAta = SEM_CONFIRMACOES, isLoading: semAtaLoading } = semAtaQuery;
  const descartesQuery = useDescartesAtaContrato();
  const { data: descartesAta = SEM_DESCARTES } = descartesQuery;
  const motivosQuery = useMotivosVinculoManual();
  const motivosManual = motivosQuery.data;
  /** Leitura dos motivos (RPC prever_vinculos_automaticos): a fila não promete vínculo automático enquanto carrega ou se falhou. */
  const motivosEstado: EstadoMotivos = motivosQuery.isError ? 'FALHOU' : motivosQuery.data ? 'OK' : 'CARREGANDO';
  const relerMotivos = () => void motivosQuery.refetch();

  const atasFila = useMemo<FilaAta[]>(
    () =>
      atas.arps.map((arp) => {
        const itens = atas.itemsByAta[`${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`] || [];
        const prazo = getArpPrazo(arp);
        return {
          numeroAta: arp.numeroAtaRegistroPreco,
          uasg: arp.codigoUnidadeGerenciadora,
          idCompra: arp.idCompra,
          numeroCompra: arp.numeroCompra,
          anoCompra: arp.anoCompra,
          cnpjs: Array.from(new Set(itens.map((i) => (i.niFornecedor || '').replace(/\D/g, '')).filter(Boolean))),
          fornecedorNomes: Array.from(new Set(itens.map((i) => i.nomeRazaoSocialFornecedor).filter(Boolean))),
          gestorNome: atas.gestorByAta[chaveGestaoDaArp(arp)],
          objeto: arp.objeto,
          fornecedorNome: itens[0]?.nomeRazaoSocialFornecedor,
          faixa: prazo.faixa,
          dias: prazo.dias,
          vigenciaFim: arp.dataVigenciaFinal,
          itens: itens.length,
          numerosItens: itens.map((i) => parseInt(i.numeroItem, 10)).filter((n) => Number.isFinite(n))
        };
      }),
    [atas.arps, atas.itemsByAta, atas.gestorByAta]
  );

  // Atas encerradas entram nas sugestões (o contrato costuma durar mais que a ata de onde veio).
  const contratosFila = useMemo<FilaContrato[]>(
    () =>
      contratos.rows.map((row) => ({
        contractKey: row.contractKey,
        numero: formatContractNumber(row.contract),
        fornecedorNome: row.contract.fornecedorNome,
        fornecedorCnpj: row.contract.fornecedorCnpjCpf,
        idCompra: row.contract.idCompra,
        objeto: row.contract.objeto,
        faixa: row.faixa,
        dias: row.diasRestantes,
        gestorNome: row.gestorNome,
        contract: row.contract
      })),
    [contratos.rows]
  );
  const vinculosDoContrato = useMemo(() => agruparVinculos(links, (n) => atas.gestorByAta[n]), [links, atas.gestorByAta]);
  const descartes = useMemo(() => new Set(Object.keys(descartesAta)), [descartesAta]);
  const gestorPorContrato = useMemo(() => new Map(contratos.rows.map((r) => [r.contractKey, r.gestorNome])), [contratos.rows]);
  const gestorDoContrato = React.useCallback((contractKey: string) => gestorPorContrato.get(contractKey), [gestorPorContrato]);
  // Contrato em mais de uma ata (migration 86): os vinculados com outra ata provável podem estar com item faltando.
  const paraConferirParcial = useMemo(
    () => contratosParaConferirParcial({ contratos: contratosFila, atas: atasFila, vinculosDoContrato, descartes }),
    [contratosFila, atasFila, vinculosDoContrato, descartes]
  );
  const { data: itensDoContrato } = useNumerosDosItensDosContratos(paraConferirParcial);
  const pendencias = useMemo(
    () =>
      buildPendenciasDistribuicao({
        contratos: contratosFila,
        atas: atasFila,
        vinculosDoContrato,
        itensDoContrato,
        naoPertencemAAta: new Set(Object.keys(confirmacoesSemAta)),
        descartes
      }),
    [contratosFila, atasFila, vinculosDoContrato, itensDoContrato, confirmacoesSemAta, descartes]
  );
  const atasPorChave = useMemo(() => new Map(atasFila.map((a) => [`${a.numeroAta}-${a.uasg}`, a])), [atasFila]);
  const ataDe = React.useCallback((numeroAta: string, uasg: string) => atasPorChave.get(`${numeroAta}-${uasg}`), [atasPorChave]);
  /** Itens da ata no banco, para prever os itens do vínculo em massa. */
  const itensDaAta = React.useCallback(
    (numeroAta: string, uasg: string): ItemDaAta[] =>
      (atas.itemsByAta[`${numeroAta}-${uasg}`] || []).map((i) => ({ numeroItem: i.numeroItem, valorUnitario: i.valorUnitario, descricao: i.descricaoItem })),
    [atas.itemsByAta]
  );

  const refresh = () => {
    void contratos.refresh();
    atas.reload();
  };

  // Só mostra números com atas, contratos e vínculos carregados: totais parciais enganariam a leitura.
  const isBusy = atas.isLoading || atas.scopeLoading || contratos.isLoading || contratos.isLoadingScope || linksLoading || semAtaLoading;
  const totalSemVinculo = pendencias.aVincular.length + pendencias.precisamDecisao.length;
  // Marcados "não pertence a ata" e ainda sem gestor: continuam pendentes na fila de Vínculos.
  const naoPertencemSemGestor = pendencias.naoPertencem.filter((i) => !i.gestorNome).length;

  /** Leituras da fila, para a faixa "não carregou". */
  const leituras: LeituraDaTela[] = [
    ...(atas.leiturasDasAtas ?? []),
    ...(contratos.leiturasDosContratos ?? []),
    { rotulo: ROTULO_VINCULOS_ITEM_CONTRATO, query: linksQuery },
    { rotulo: 'contratos marcados "não pertence a ata"', query: semAtaQuery },
    { rotulo: 'atas descartadas', query: descartesQuery }
  ];
  /**
   * Sem os vínculos, todo contrato pareceria sem ata; sem as marcas "não pertence", eles voltariam à fila. A fila e o
   * número do menu esperam essas duas leituras em vez de mostrar uma pendência que não existe.
   */
  const filaIndisponivel = naoCarregou(linksQuery) || naoCarregou(semAtaQuery);

  return {
    atas,
    contratos,
    links,
    leituras,
    filaIndisponivel,
    confirmacoesSemAta,
    motivosManual,
    motivosEstado,
    relerMotivos,
    atasFila,
    contratosFila,
    pendencias,
    totalSemVinculo,
    naoPertencemSemGestor,
    ataDe,
    itensDaAta,
    gestorDoContrato,
    refresh,
    isBusy
  };
}
