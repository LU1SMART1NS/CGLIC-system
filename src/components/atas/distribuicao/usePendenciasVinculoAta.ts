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

/**
 * Atas, contratos e vínculos da carteira, cruzados para dizer quais contratos ainda não têm ata (e qual é a ata
 * provável). Serve à fila "Contratos à ata" do menu Vinculação e à Central de Distribuição (atas sem gestor e carga
 * por gestor usam as mesmas pendências).
 */
export function usePendenciasVinculoAta() {
  const atas = useAtasPortfolio();
  const contratos = useContractsPortfolio();
  const { data: links = [], isLoading: linksLoading } = useArpItemContractLinks();
  const { data: confirmacoesSemAta = {}, isLoading: semAtaLoading } = useContratosSemAta();
  const { data: descartesAta = {} } = useDescartesAtaContrato();
  const { data: motivosManual } = useMotivosVinculoManual();

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

  return {
    atas,
    contratos,
    links,
    confirmacoesSemAta,
    motivosManual,
    atasFila,
    contratosFila,
    pendencias,
    totalSemVinculo,
    ataDe,
    itensDaAta,
    gestorDoContrato,
    refresh,
    isBusy
  };
}
