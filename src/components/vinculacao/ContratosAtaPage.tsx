import React from 'react';
import { Link2 } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { SkeletonLoader } from '../../design-system/components/SkeletonLoader';
import { FontesComFalhaAviso } from '../fonte/FontesComFalhaAviso';
import { naoCarregou, useLeiturasComFalha } from '../fonte/useLeiturasComFalha';
import { ListaNaoCarregou } from '../fonte/ListaNaoCarregou';
import { EmptyState } from '../../design-system/components/EmptyState';
import { ContractsPartialNotice } from '../carteira/ContractsPartialNotice';
import { canAssignManager } from '../carteira/ManagerAssign';
import { useAuth } from '../../context/AuthContext';
import { AtribuirGestorModal } from '../atas/distribuicao/AtribuirGestorModal';
import { ContratosSemVinculoFila } from '../atas/distribuicao/ContratosSemVinculoFila';
import { VinculoAutomaticoSimular } from '../atas/distribuicao/VinculoAutomaticoFaixa';
import { usePendenciasVinculoAta } from '../atas/distribuicao/usePendenciasVinculoAta';
import { buildDistribuicaoEquipe } from '../atas/distribuicao/distribuicaoEquipe';
import { mesesDeVigencia } from '../atas/distribuicao/complexidade';
import { getArpPrazo } from '../../hooks/useAtasPortfolio';
import { useComplexidadeAjustes } from '../../hooks/useComplexidadeAjustes';
import { formatContractNumber } from '../../utils/contractNumber';
import type { ManagerTarget } from '../../services/managerAssignmentService';
import { AvisoCarregando } from '../../design-system';
import { chaveGestaoDaArp } from '../../utils/ataIdentidade';

/**
 * Vínculos → Contratos à ata: contratos sem item de ata vinculado, com a ata provável pela compra e pelo
 * fornecedor. O coordenador e o gestor vinculam (o gestor só os próprios contratos); descartar ata, marcar "não
 * pertence" e atribuir gestor continuam só do coordenador. Era a aba "Contratos sem vínculo" da Central.
 */
export const ContratosAtaPage: React.FC = () => {
  const { role } = useAuth();
  const podeVincular = role === 'admin' || role === 'gestor';
  const podeDecidir = canAssignManager(role);
  const { atas, contratos, links, confirmacoesSemAta, motivosManual, motivosEstado, relerMotivos, pendencias, totalSemVinculo, ataDe, itensDaAta, atasFila, isBusy, refresh, leituras: leiturasDaFila, filaIndisponivel } =
    usePendenciasVinculoAta();
  const ajustesQuery = useComplexidadeAjustes();
  const { data: ajustes } = ajustesQuery;
  // Uma fonte que falha não some calada: a fila mostra o que carregou e a faixa diz o que ficou de fora.
  const leituras = useLeiturasComFalha([...leiturasDaFila, { rotulo: 'ajustes de complexidade (carga dos gestores)', query: ajustesQuery }]);
  // Contratos de alguma UASG (ou, no perfil gestor, o recorte dele) não carregaram: "todos têm ata" não vale.
  const contratosNaoCarregaram = (contratos.leiturasDosContratos ?? []).some((l) => naoCarregou(l.query));

  // "Para quem atribuo?" (depois de marcar "não pertence a ata"): precisa da carga de cada gestor.
  const [transferencia, setTransferencia] = React.useState<{ targets: ManagerTarget[]; origem: string | null; done?: () => void } | null>(null);
  const distribuicao = React.useMemo(
    () =>
      transferencia
        ? buildDistribuicaoEquipe({
            atas: atas.scopedArps.map((arp) => ({
              numeroAta: arp.numeroAtaRegistroPreco,
              uasg: arp.codigoUnidadeGerenciadora,
              objeto: arp.objeto,
              dias: getArpPrazo(arp).dias,
              faixa: getArpPrazo(arp).faixa,
              valor: Number(arp.valorTotal) || 0,
              gestorNome: atas.gestorByAta[chaveGestaoDaArp(arp)],
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
              mesesVigencia: mesesDeVigencia(row.contract.dataVigenciaInicio, row.contract.dataVigenciaFim)
            })),
            links,
            attentionItems: contratos.attentionItems,
            ajustes
          })
        : null,
    [transferencia, atas.scopedArps, atas.gestorByAta, atas.itemsByAta, contratos.rows, contratos.attentionItems, links, ajustes]
  );

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Contratos a vincular à ata"
        subtitle="Contratos sem item de ata vinculado, com a ata provável pela compra e pelo fornecedor. Vinculado, o contrato segue o gestor da ata."
        hint={'Contratos vigentes ainda sem vínculo com ata. Clique no nome da ata para conferir e vincular; os que a API confirma podem ser vinculados vários de uma vez. Se a ata certa não foi sugerida, use "Escolher ata". Se o contrato não veio de ata, marque "Não pertence a nenhuma ata" e escolha o gestor.'}
        badge={role === 'admin' ? <VinculoAutomaticoSimular /> : undefined}
        icon={<Link2 size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <HeaderRefreshAction
            onRefresh={contratos.podeForcarAtualizacao ? refresh : undefined}
            isRefreshing={contratos.isFetching}
            lastUpdated={contratos.dataUpdatedAt}
            dataTestId="vinculacao-contratos-refresh-btn"
            tooltipTitle="Recarregar atas, contratos e vínculos"
          />
        }
      />

      <FontesComFalhaAviso falhas={leituras.falhas} onTentar={() => void leituras.tentarDeNovo()} tentando={leituras.tentando} onde="da fila" testIdPrefix="vinculacao-contratos-fontes" />

      {isBusy ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true" aria-label="Carregando contratos...">
          <AvisoCarregando label="Carregando contratos" />
          <SkeletonLoader variant="rectangular" height="46px" count={1} />
          <SkeletonLoader variant="rectangular" height="300px" count={1} />
        </div>
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

          {filaIndisponivel ? (
            <ListaNaoCarregou titulo="A fila não carregou: sem os vínculos com as atas, todo contrato pareceria sem ata." testId="vinculacao-contratos-nao-carregou" />
          ) : totalSemVinculo === 0 && pendencias.naoPertencem.length === 0 && contratosNaoCarregaram ? (
            <ListaNaoCarregou titulo="Os contratos não carregaram." testId="vinculacao-contratos-nao-carregou" />
          ) : totalSemVinculo === 0 && pendencias.naoPertencem.length === 0 ? (
            <EmptyState
              title="Todos os contratos da sua carteira têm ata vinculada."
              description="Quando um contrato novo chegar sem ata, ele aparece aqui com a ata provável."
              testId="vinculacao-contratos-vazio"
            />
          ) : (
            <ContratosSemVinculoFila
              motivos={motivosManual}
              motivosEstado={motivosEstado}
              onRelerMotivos={relerMotivos}
              pendencias={pendencias}
              confirmacoes={confirmacoesSemAta}
              podeAgir={podeVincular}
              podeDecidir={podeDecidir}
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

          {transferencia && distribuicao && (
            <AtribuirGestorModal
              targets={transferencia.targets}
              origem={transferencia.origem}
              linhas={distribuicao.linhas}
              links={links}
              contractsByKey={contratos.contractsByKey}
              onDone={transferencia.done}
              onClose={() => setTransferencia(null)}
            />
          )}
        </>
      )}
    </PageContainer>
  );
};
