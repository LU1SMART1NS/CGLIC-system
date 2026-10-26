import React, { useMemo, useState } from 'react';
import { Contact } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { AppButton } from '../../design-system/components/AppButton';
import { CarteiraFilterBar } from '../carteira/CarteiraFilterBar';
import { carteiraDetalhe, carteiraIdentificacao } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useAsparDosOrgaos } from '../../hooks/useEmendas';
import { NOME_ORGAO_ASPAR, ORGAOS_ASPAR } from '../../utils/emendasSemPedido';
import { formatarTelefone, type AsparDoOrgao, type OrgaoAspar } from '../../services/emendasService';
import { AsparModal } from './AsparModal';

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

interface LinhaUf {
  uf: string;
  porOrgao: Partial<Record<OrgaoAspar, AsparDoOrgao>>;
}

/**
 * ASPAR dos órgãos (migration 205): a assessoria parlamentar de cada órgão estadual (PM, BM, PC, PCI, SSP), uma linha
 * por UF. A emenda sem pedido mostra os contatos do estado dela; o que falta aparece como "a cadastrar".
 */
export const EmendasAsparPage: React.FC = () => {
  const { data = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useAsparDosOrgaos();
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<{ uf: string; orgao: OrgaoAspar } | null>(null);
  const porChave = useMemo(() => new Map(data.map((a) => [`${a.uf}:${a.orgao}`, a])), [data]);
  const linhas: LinhaUf[] = useMemo(
    () => UFS.map((uf) => ({ uf, porOrgao: Object.fromEntries(ORGAOS_ASPAR.map((o) => [o, porChave.get(`${uf}:${o}`)]).filter(([, a]) => a)) })),
    [porChave]
  );
  const termo = busca.trim().toUpperCase();
  const filtradas = termo ? linhas.filter((l) => l.uf.includes(termo) || Object.values(l.porOrgao).some((a) => a?.nome.toUpperCase().includes(termo))) : linhas;
  const cadastrados = data.length;

  const colunas: Column<LinhaUf>[] = [
    { key: 'uf', header: 'UF', priority: 'primary', nowrap: true, render: (l) => <span style={carteiraIdentificacao}>{l.uf}</span> },
    ...ORGAOS_ASPAR.map(
      (o): Column<LinhaUf> => ({
        key: o,
        header: o,
        minWidth: '150px',
        render: (l) => {
          const a = l.porOrgao[o];
          return (
            <AppButton
              size="xs"
              variant="link"
              onClick={() => setEditando({ uf: l.uf, orgao: o })}
              title={`${NOME_ORGAO_ASPAR[o]} · ${l.uf}`}
              style={{ textAlign: 'left', whiteSpace: 'normal' }}
              data-testid={`emendas-aspar-${l.uf}-${o}`}
            >
              {a ? (
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>{a.nome}</span>
                  {a.telefone && <span style={carteiraDetalhe}>{formatarTelefone(a.telefone)}</span>}
                </span>
              ) : (
                <span style={carteiraDetalhe}>a cadastrar</span>
              )}
            </AppButton>
          );
        }
      })
    )
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="ASPAR dos órgãos"
        subtitle="Assessoria parlamentar das polícias, dos bombeiros e da segurança pública de cada estado."
        hint="A emenda vista no SIOP e ainda sem pedido mostra estes contatos, do estado do beneficiário ou do parlamentar, para a CAEP combinar o pedido. Só a CAEP e o coordenador veem e alteram."
        icon={<Contact size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-aspar-atualizar" tooltipTitle="Recarregar os contatos" />}
      />
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pela UF ou pelo nome..."
        onChangeBusca={setBusca}
        hasActiveFilters={Boolean(termo)}
        onResetFilters={() => setBusca('')}
        counter={`${cadastrados} de ${UFS.length * ORGAOS_ASPAR.length} contatos cadastrados`}
        testIdPrefix="emendas-aspar"
      />
      <AdminListShell
        testId="emendas-aspar-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os contatos"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar as ASPAR.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && filtradas.length === 0}
        emptyTitle="Nenhum estado encontrado."
        emptyDescription="Ajuste a busca."
      >
        <DataTable<LinhaUf> testId="emendas-aspar-tabela" className="data-table-container--flush" data={filtradas} keyExtractor={(l) => l.uf} columns={colunas} />
      </AdminListShell>
      {editando && <AsparModal uf={editando.uf} orgao={editando.orgao} atual={porChave.get(`${editando.uf}:${editando.orgao}`) ?? null} onClose={() => setEditando(null)} />}
    </PageContainer>
  );
};
