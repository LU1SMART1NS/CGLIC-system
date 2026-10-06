import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { ContractsPartialNotice } from '../../carteira/ContractsPartialNotice';
import { CarteiraSegmentTabs } from '../../carteira/CarteiraSegmentTabs';
import { PageContainer } from '../../../design-system/components/PageContainer';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../../design-system/components/HeaderRefreshAction';
import { SkeletonLoader } from '../../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../../design-system/components/ErrorState';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { canAssignManager } from '../../carteira/ManagerAssign';
import { AtribuirGestorModal } from './AtribuirGestorModal';
import { AtasSemGestorFila } from './AtasSemGestorFila';
import { ContratosSemVinculoFila } from './ContratosSemVinculoFila';
import type { ItemDaAta } from './vinculoEmMassa';
import { DivergenciasFila } from './DivergenciasFila';
import { AvisosVinculoBanner } from './AvisosVinculoBanner';
import { EquipeFila } from './EquipeFila';
import { buildPendenciasDistribuicao, type ContratoAVincular, type FilaAta } from './contratosSemAta';
import { FILAS, FILA_INICIAL, type Fila } from './filaComum';
import { useContratosSemAta } from '../../../hooks/useContratosSemAta';
import { useDescartesAtaContrato } from '../../../hooks/useDescartesAtaContrato';
import type { ManagerTarget } from '../../../services/managerAssignmentService';
import { useAuth } from '../../../context/AuthContext';
import { useAtasPortfolio, getArpPrazo } from '../../../hooks/useAtasPortfolio';
import { useContractsPortfolio } from '../../../hooks/useContractsPortfolio';
import { useArpItemContractLinks } from '../../../hooks/useAtaManagers';
import { useComplexidadeAjustes } from '../../../hooks/useComplexidadeAjustes';
import { formatContractNumber } from '../../../utils/contractNumber';
import { buildDistribuicaoEquipe } from './distribuicaoEquipe';
import { mesesDeVigencia } from './complexidade';

const AMBAR = 'var(--color-warning)';
const VERMELHO = 'var(--color-danger)';


/** Categoria do contrato: `categoria` no Contratos.gov.br, `nomeCategoria` no Compras.gov.br. */
function categoriaDoContrato(raw: unknown): string | undefined {
  const r = raw as { categoria?: unknown; nomeCategoria?: unknown } | undefined;
  const c = r?.categoria ?? r?.nomeCategoria;
  return typeof c === 'string' ? c : undefined;
}

/**
 * Central de Distribuição, no padrão das carteiras: filas de trabalho em abas com contagem (Atas sem gestor,
 * Contratos sem ata, A vincular, Gestor diferente da ata) e a carga de cada gestor (Equipe). A aba fica na URL.
 */
export const DistribuicaoEquipePage: React.FC = () => {
  const atas = useAtasPortfolio();
  const contratos = useContractsPortfolio();
  const { data: links = [], isLoading: linksLoading } = useArpItemContractLinks();
  // Só quem pode atribuir (admin) vê as ações de transferir; o leitor acompanha.
  const { role } = useAuth();
  const canAssign = canAssignManager(role);
  // Ajuste manual de complexidade: só o coordenador (a RPC também exige admin).
  const canAjustar = role === 'admin';
  const { data: ajustes } = useComplexidadeAjustes();
  const { data: confirmacoesSemAta = {}, isLoading: semAtaLoading } = useContratosSemAta();
  const { data: descartesAta = {} } = useDescartesAtaContrato();

  // "Para quem atribuo?" aberto: alvos (carteira inteira de um gestor ou itens marcados), de quem saem e o que fazer ao salvar.
  const [transferencia, setTransferencia] = React.useState<{ targets: ManagerTarget[]; origem: string | null; done?: () => void; provaveis?: number } | null>(null);

  // Fila aberta (?aba=); trocar de fila limpa a busca, os filtros e a ordenação da anterior.
  const [searchParams, setSearchParams] = useSearchParams();
  const abaParam = searchParams.get('aba') as Fila | null;
  // "A vincular" virou parte de "Contratos sem vínculo": endereços antigos caem na fila unificada.
  const abaPedida = (abaParam as string) === 'A_VINCULAR' ? 'CONTRATOS' : abaParam;
  const aba: Fila = abaPedida && (FILAS as readonly string[]).includes(abaPedida) ? (abaPedida as Fila) : FILA_INICIAL;
  const trocarAba = (nova: Fila) => setSearchParams(nova === FILA_INICIAL ? {} : { aba: nova }, { replace: true });

  const distribuicao = useMemo(
    () =>
      buildDistribuicaoEquipe({
        atas: atas.scopedArps.map((arp) => ({
          numeroAta: arp.numeroAtaRegistroPreco,
          uasg: arp.codigoUnidadeGerenciadora,
          objeto: arp.objeto,
          dias: getArpPrazo(arp).dias,
          faixa: getArpPrazo(arp).faixa,
          valor: Number(arp.valorTotal) || 0,
          gestorNome: atas.gestorByAta[arp.numeroAtaRegistroPreco],
          itens: (atas.itemsByAta[`${arp.numeroAtaRegistroPreco}-${arp.codigoUnidadeGerenciadora}`] || []).length
        })),
        contratos: contratos.rows.map((row) => ({
          contractKey: row.contractKey,
          numero: formatContractNumber(row.contract),
          objeto: row.contract.objeto,
          dias: row.diasRestantes,
          faixa: row.faixa,
          valor: row.contract.valorGlobal || row.contract.valorInicial || 0,
          gestorNome: row.gestorNome,
          categoria: categoriaDoContrato(row.contract.raw),
          mesesVigencia: mesesDeVigencia(row.contract.dataVigenciaInicio, row.contract.dataVigenciaFim)
        })),
        links,
        attentionItems: contratos.attentionItems,
        ajustes
      }),
    [atas.scopedArps, atas.gestorByAta, atas.itemsByAta, contratos.rows, contratos.attentionItems, links, ajustes]
  );

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
          gestorNome: atas.gestorByAta[arp.numeroAtaRegistroPreco],
          objeto: arp.objeto,
          fornecedorNome: itens[0]?.nomeRazaoSocialFornecedor,
          faixa: prazo.faixa,
          dias: prazo.dias,
          vigenciaFim: arp.dataVigenciaFinal,
          itens: itens.length
        };
      }),
    [atas.arps, atas.itemsByAta, atas.gestorByAta]
  );

  // Pendências de distribuição: atas sem gestor, contratos sem gestor e sem ata e contratos a vincular por
  // gestor. Atas encerradas entram nas sugestões (o contrato costuma durar mais que a ata de onde veio).
  const pendencias = useMemo(() => {
    const ataDoContrato = new Map(links.map((l) => [l.contractKey, l.ataKey]));
    return buildPendenciasDistribuicao({
      contratos: contratos.rows.map((row) => ({
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
      atas: atasFila,
      ataDoContrato,
      naoPertencemAAta: new Set(Object.keys(confirmacoesSemAta)),
      descartes: new Set(Object.keys(descartesAta))
    });
  }, [contratos.rows, atasFila, links, confirmacoesSemAta, descartesAta]);
  const atasPorChave = useMemo(() => new Map(atasFila.map((a) => [`${a.numeroAta}-${a.uasg}`, a])), [atasFila]);
  const ataDe = React.useCallback((numeroAta: string, uasg: string) => atasPorChave.get(`${numeroAta}-${uasg}`), [atasPorChave]);
  const aVincularDe = (gestorNome: string): ContratoAVincular[] => pendencias.aVincularPorGestor.get(gestorNome) || [];
  /** Itens da ata no banco, para a Central prever os itens do vínculo em massa. */
  const itensDaAta = React.useCallback(
    (numeroAta: string, uasg: string): ItemDaAta[] =>
      (atas.itemsByAta[`${numeroAta}-${uasg}`] || []).map((i) => ({ numeroItem: i.numeroItem, valorUnitario: i.valorUnitario, descricao: i.descricaoItem })),
    [atas.itemsByAta]
  );

  const refresh = () => {
    void contratos.refresh();
    atas.reload();
  };

  if (contratos.error && !contratos.hasAnyData && atas.arps.length === 0) {
    return (
      <PageContainer style={{ padding: '2rem 0' }}>
        <ErrorState
          title="Erro ao carregar a central de distribuição"
          message={contratos.error.message || 'Não foi possível carregar atas e contratos.'}
          onRetry={refresh}
        />
      </PageContainer>
    );
  }

  // Só mostra números com atas, contratos e vínculos carregados: totais parciais enganariam a leitura da carga.
  const isBusy = atas.isLoading || atas.scopeLoading || contratos.isLoading || contratos.isLoadingScope || linksLoading || semAtaLoading;
  const { divergencias, totais } = distribuicao;
  const totalInstrumentos = totais.atas.vigentes + totais.contratos.vigentes;
  const totalSemVinculo = pendencias.aVincular.length + pendencias.precisamDecisao.length;
  // A carteira sem gestor fica nas filas; a Equipe mostra só quem tem carteira.
  const linhasEquipe = distribuicao.linhas.filter((l) => l.gestorNome !== null);

  const segmentos = [
    { id: 'EQUIPE' as const, label: 'Equipe', count: totais.gestores, title: 'Carga de cada gestor' },
    {
      id: 'ATAS' as const,
      label: 'Atas sem gestor',
      count: pendencias.atasSemGestor.length,
      dot: pendencias.atasSemGestor.length ? AMBAR : undefined,
      title: 'Vigentes e encerradas que ainda têm contratos'
    },
    {
      id: 'CONTRATOS' as const,
      label: 'Contratos sem vínculo',
      count: totalSemVinculo,
      dot: totalSemVinculo ? AMBAR : undefined,
      title: 'Vincule à ata provável (vários de uma vez quando a API confirma) ou marque que não pertencem a nenhuma ata'
    },
    {
      id: 'DIVERGENCIAS' as const,
      label: 'Gestor diferente da ata',
      count: divergencias.length,
      dot: divergencias.length ? VERMELHO : undefined,
      title: 'Contratos vinculados fora da regra'
    }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Central de Distribuição"
        subtitle="Quem cuida de cada ata e contrato vigente. Contratos vinculados a uma ata seguem o gestor da ata."
        icon={<Users size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <HeaderRefreshAction
            onRefresh={contratos.podeForcarAtualizacao ? refresh : undefined}
            isRefreshing={contratos.isFetching}
            lastUpdated={contratos.dataUpdatedAt}
            dataTestId="distribuicao-refresh-btn"
            tooltipTitle="Recarregar atas, contratos e gestores"
          />
        }
      />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando distribuição...">
          <SkeletonLoader variant="rectangular" height="40px" count={1} />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
      ) : totalInstrumentos === 0 && pendencias.atasSemGestor.length === 0 && totalSemVinculo === 0 ? (
        <EmptyState
          title="Nenhuma ata ou contrato vigente."
          description="Não há instrumentos vigentes nas unidades consolidadas para distribuir."
        />
      ) : (
        <>
          {contratos.isPartial && (
            <ContractsPartialNotice
              fontesComFalha={contratos.fontesComFalha}
              ultimoSucessoEm={typeof contratos.dataUpdatedAt === 'string' ? contratos.dataUpdatedAt : null}
              onRetry={contratos.podeForcarAtualizacao ? () => void contratos.refresh() : undefined}
              isRetrying={contratos.isFetching}
            />
          )}

          <AvisosVinculoBanner podeVer={canAssign} />

          <CarteiraSegmentTabs segments={segmentos} active={aba} onSelect={trocarAba} testIdPrefix="distribuicao-aba" ariaLabel="Filas de distribuição" />

          {aba === 'EQUIPE' && (
            <EquipeFila
              linhas={linhasEquipe}
              mediaEquivalente={totais.mediaEquivalente}
              canAssign={canAssign}
              canAjustar={canAjustar}
              aVincularDe={aVincularDe}
              onTransfer={(targets, origem, done) => setTransferencia({ targets, origem, done })}
            />
          )}

          {aba === 'ATAS' && (
            <AtasSemGestorFila
              atas={pendencias.atasSemGestor}
              podeAtribuir={canAssign}
              onAtribuir={(lista, done) =>
                setTransferencia({
                  targets: lista.map((ata) => ({ tipo: 'ATA' as const, ataKey: ata.numeroAta })),
                  origem: null,
                  done,
                  provaveis: lista.reduce((n, ata) => n + ata.provaveis.length, 0)
                })
              }
            />
          )}

          {aba === 'CONTRATOS' && (
            <ContratosSemVinculoFila
              pendencias={pendencias}
              confirmacoes={confirmacoesSemAta}
              podeAgir={canAssign}
              ataDe={ataDe}
              atas={atasFila}
              itensDaAta={itensDaAta}
              onAtribuir={(lista, done) =>
                setTransferencia({
                  targets: lista.map((item) => ({ tipo: 'CONTRATO' as const, contractKey: item.contractKey })),
                  // Lote com gestores diferentes ("não pertence" já atribuídos) sai como "Atribuir gestor".
                  origem: lista.length === 1 ? lista[0].gestorNome ?? null : null,
                  done
                })
              }
            />
          )}

          {aba === 'DIVERGENCIAS' && (
            <DivergenciasFila
              divergencias={divergencias}
              podeAlinhar={canAssign}
              onAlinhar={(d) => setTransferencia({ targets: [{ tipo: 'ATA', ataKey: d.numeroAta }], origem: d.gestorAta ?? null })}
            />
          )}

          {transferencia && (
            <AtribuirGestorModal
              targets={transferencia.targets}
              origem={transferencia.origem}
              linhas={distribuicao.linhas}
              links={links}
              contractsByKey={contratos.contractsByKey}
              onDone={transferencia.done}
              provaveis={transferencia.provaveis}
              onClose={() => setTransferencia(null)}
            />
          )}
        </>
      )}
    </PageContainer>
  );
};
