import React, { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { ContractsPartialNotice } from '../../carteira/ContractsPartialNotice';
import { CarteiraSegmentTabs } from '../../carteira/CarteiraSegmentTabs';
import { PageContainer } from '../../../design-system/components/PageContainer';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../../design-system/components/HeaderRefreshAction';
import { SkeletonLoader } from '../../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../../design-system/components/ErrorState';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { AppButton, NoticeBar } from '../../../design-system';
import { useNavigate } from 'react-router-dom';
import { canAssignManager } from '../../carteira/ManagerAssign';
import { AtribuirGestorModal } from './AtribuirGestorModal';
import { AtasSemGestorFila } from './AtasSemGestorFila';
import { DivergenciasFila } from './DivergenciasFila';
import { AvisosVinculoBanner } from './AvisosVinculoBanner';
import { EquipeFila } from './EquipeFila';
import type { ContratoAVincular } from './contratosSemAta';
import { FILAS, FILA_INICIAL, type Fila } from './filaComum';
import { usePendenciasVinculoAta } from './usePendenciasVinculoAta';
import type { ManagerTarget } from '../../../services/managerAssignmentService';
import { useAuth } from '../../../context/AuthContext';
import { getArpPrazo } from '../../../hooks/useAtasPortfolio';
import { useComplexidadeAjustes } from '../../../hooks/useComplexidadeAjustes';
import { formatContractNumber } from '../../../utils/contractNumber';
import { buildDistribuicaoEquipe } from './distribuicaoEquipe';
import { mesesDeVigencia } from './complexidade';
import { ROTAS_VINCULACAO } from '../../vinculacao/vinculacaoConfig';

const AMBAR = 'var(--color-warning)';
const VERMELHO = 'var(--color-danger)';


/** Categoria do contrato: `categoria` no Contratos.gov.br, `nomeCategoria` no Compras.gov.br. */
function categoriaDoContrato(raw: unknown): string | undefined {
  const r = raw as { categoria?: unknown; nomeCategoria?: unknown } | undefined;
  const c = r?.categoria ?? r?.nomeCategoria;
  return typeof c === 'string' ? c : undefined;
}

/**
 * Central de Distribuição, no padrão das carteiras: atas e contratos para gestores. Filas em abas com contagem
 * (Atas sem gestor, Gestor diferente da ata) e a carga de cada gestor (Equipe). A aba fica na URL. O vínculo de
 * contrato à ata saiu daqui para o menu Vinculação.
 */
export const DistribuicaoEquipePage: React.FC = () => {
  const { atas, contratos, links, pendencias, totalSemVinculo, gestorDoContrato, isBusy, refresh } = usePendenciasVinculoAta();
  // Só quem pode atribuir (admin) vê as ações de transferir; o leitor acompanha.
  const { role } = useAuth();
  const canAssign = canAssignManager(role);
  // Ajuste manual de complexidade: só o coordenador (a RPC também exige admin).
  const canAjustar = role === 'admin';
  const { data: ajustes } = useComplexidadeAjustes();
  const navigate = useNavigate();

  // "Para quem atribuo?" aberto: alvos (carteira inteira de um gestor ou itens marcados), de quem saem e o que fazer ao salvar.
  const [transferencia, setTransferencia] = React.useState<{ targets: ManagerTarget[]; origem: string | null; done?: () => void; provaveis?: number } | null>(null);

  // Fila aberta (?aba=); trocar de fila limpa a busca, os filtros e a ordenação da anterior.
  const [searchParams, setSearchParams] = useSearchParams();
  const abaParam = searchParams.get('aba');
  // "Contratos sem vínculo" e "A vincular" moraram aqui: os endereços antigos levam à fila do menu Vinculação.
  const vaiParaVinculacao = abaParam === 'CONTRATOS' || abaParam === 'A_VINCULAR';
  const abaDaUrl: Fila = abaParam && (FILAS as readonly string[]).includes(abaParam) ? (abaParam as Fila) : FILA_INICIAL;
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

  const aVincularDe = (gestorNome: string): ContratoAVincular[] => pendencias.aVincularPorGestor.get(gestorNome) || [];

  if (vaiParaVinculacao) return <Navigate to={ROTAS_VINCULACAO.contratos} replace />;

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

  const { divergencias, totais } = distribuicao;
  // "Gestor diferente da ata" só aparece quando há caso: o vínculo automático não cria divergência (migration 95).
  const aba: Fila = abaDaUrl === 'DIVERGENCIAS' && divergencias.length === 0 ? FILA_INICIAL : abaDaUrl;
  const totalInstrumentos = totais.atas.vigentes + totais.contratos.vigentes;
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
    ...(divergencias.length > 0
      ? [
          {
            id: 'DIVERGENCIAS' as const,
            label: 'Gestor diferente da ata',
            count: divergencias.length,
            dot: VERMELHO,
            title: 'Contratos vinculados fora da regra'
          }
        ]
      : [])
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

          <AvisosVinculoBanner podeVer={canAssign} gestorDoContrato={gestorDoContrato} gestorDaAta={(ataKey) => atas.gestorByAta[ataKey]} />
          {totalSemVinculo > 0 && (
            <NoticeBar
              tone="info"
              testId="distribuicao-contratos-sem-vinculo"
              action={
                <AppButton variant="outline" size="sm" onClick={() => navigate(ROTAS_VINCULACAO.contratos)}>
                  Abrir Vinculação
                </AppButton>
              }
            >
              <strong>{totalSemVinculo}</strong> {totalSemVinculo === 1 ? 'contrato ainda não tem' : 'contratos ainda não têm'} item de ata vinculado. O vínculo é
              feito no menu Vinculação; quando vinculado, o contrato segue o gestor da ata.
            </NoticeBar>
          )}

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
