import React, { useMemo } from 'react';
import { Network } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { carteiraIdentificacao } from '../carteira/carteiraStyles';
import { useNavigateWithOrigin } from '../../hooks/useDetailOrigin';
import { useEntregasFiscalizacao, useProgramasFiscalizacao } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { NOME_SFC } from '../../utils/fiscalizacao';
import { agrupar, chaveDoBeneficiario, pct, resumir, rotaDoPrograma, type Resumo } from '../../utils/fiscalizacaoResumo';
import { CelulaContratado, CelulaEntregaResumo, CelulaOnde } from './FiscalizacaoCelulas';

interface LinhaPrograma { id: string; nome: string; es: EntregaFiscalizacao[]; r: Resumo }

/**
 * Fiscalização › Programas (migration 265; protótipo aprovado em 11/11/2026): um programa ativo por linha, com o
 * contratado, a entrega e os beneficiários. O cadastro fica em Ajustes › Gestão › Programas; os itens entram pela tela
 * do programa (Incluir itens no programa).
 */
export const FiscalizacaoProgramasPage: React.FC = () => {
  const navigate = useNavigateWithOrigin();
  const programasQ = useProgramasFiscalizacao();
  const entregasQ = useEntregasFiscalizacao(null);
  const linhas = useMemo<LinhaPrograma[]>(() => {
    const porPrograma = agrupar((entregasQ.data ?? []).filter((e) => e.programaId), (e) => e.programaId as string);
    return (programasQ.data ?? [])
      .filter((p) => p.ativo)
      .map((p) => {
        const es = porPrograma.get(p.id) ?? [];
        return { id: p.id, nome: p.nome, es, r: resumir(es) };
      });
  }, [programasQ.data, entregasQ.data]);
  const carregando = programasQ.isLoading || entregasQ.isLoading;
  const falha = programasQ.error ?? entregasQ.error;
  const colunas: Column<LinhaPrograma>[] = [
    { key: 'programa', header: 'Programa', minWidth: '200px', priority: 'primary', sortValue: (l) => l.nome, render: (l) => <span style={carteiraIdentificacao}>{l.nome}</span> },
    { key: 'contratado', header: 'Contratado', minWidth: '240px', sortValue: (l) => l.r.unidades, sortFirstDir: 'desc', render: (l) => <CelulaContratado es={l.es} r={l.r} /> },
    { key: 'entrega', header: 'Entrega', sortValue: (l) => pct(l.r.entregues, l.r.acompanhadas), render: (l) => <CelulaEntregaResumo es={l.es} r={l.r} /> },
    { key: 'beneficiarios', header: 'Beneficiários', sortValue: (l) => new Set(l.es.map(chaveDoBeneficiario)).size, sortFirstDir: 'desc', render: (l) => <CelulaOnde es={l.es} /> }
  ];
  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Programas"
        subtitle="Itens comprados para um programa, em vários contratos: o que já foi entregue e onde."
        hint={`Os programas são cadastrados em Ajustes › Gestão › Programas; os itens entram pela tela do programa (Incluir itens no programa). As unidades fiscalizadas pela área requisitante contam no total, mas ficam fora do percentual, que é sobre o que a ${NOME_SFC} acompanha.`}
        icon={<Network size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => Promise.all([programasQ.refetch(), entregasQ.refetch()])} isRefreshing={programasQ.isFetching || entregasQ.isFetching} lastUpdated={entregasQ.dataUpdatedAt || null} dataTestId="fisc-prog-atualizar" tooltipTitle="Recarregar os programas" />}
      />
      <AdminListShell
        testId="fisc-prog-lista"
        isLoading={carregando}
        isError={Boolean(falha)}
        errorTitle="Não foi possível carregar os programas"
        errorMessage={falha?.message}
        onRetry={() => { void programasQ.refetch(); void entregasQ.refetch(); }}
        isEmpty={!carregando && linhas.length === 0}
        emptyTitle="Nenhum programa ativo."
        emptyDescription="Os programas são cadastrados em Ajustes › Gestão › Programas."
      >
        <DataTable<LinhaPrograma> testId="fisc-prog-tabela" className="data-table-container--flush" data={linhas} keyExtractor={(l) => l.id} columns={colunas} rowOpen={(l) => () => navigate(rotaDoPrograma(l.id))} />
      </AdminListShell>
    </PageContainer>
  );
};
