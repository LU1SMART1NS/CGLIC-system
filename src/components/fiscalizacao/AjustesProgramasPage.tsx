import React, { useState } from 'react';
import { Network } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { ActionButton } from '../../design-system/components/ActionButton';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { RowActionsMenu } from '../../design-system/components/RowActionsMenu';
import { useConfirm } from '../../design-system/components/ConfirmDialog';
import { useToast } from '../../design-system/components/Toast';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { carteiraDetalhe, carteiraIdentificacao, carteiraValor } from '../carteira/carteiraStyles';
import { useAuth } from '../../context/AuthContext';
import { useExcluirProgramaFiscalizacao, useProgramasFiscalizacao, useSalvarProgramaFiscalizacao } from '../../hooks/useFiscalizacao';
import type { ProgramaFiscalizacao } from '../../services/fiscalizacaoService';
import { numero, ROTULO_ORIGEM } from '../../utils/fiscalizacaoResumo';
import { ProgramaModal } from './ProgramaModal';

/**
 * Ajustes › Gestão › Programas (migration 265): o cadastro dos programas da Fiscalização. Programa com itens não se exclui,
 * só se inativa (como Usuários e Unidades Internas); os itens entram pela tela do programa.
 */
export const AjustesProgramasPage: React.FC = () => {
  const { role } = useAuth();
  const podeCadastrar = role === 'admin' || role === 'gestor_fiscalizacao';
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const q = useProgramasFiscalizacao();
  const salvar = useSalvarProgramaFiscalizacao();
  const excluir = useExcluirProgramaFiscalizacao();
  const [editando, setEditando] = useState<ProgramaFiscalizacao | 'novo' | null>(null);
  const linhas = q.data ?? [];

  const alternarSituacao = async (p: ProgramaFiscalizacao) => {
    if (p.ativo) {
      const ok = await confirm({
        title: `Inativar ${p.nome}?`,
        message: 'Inativo, o programa sai das listas da Fiscalização e não recebe novos itens. Os itens que já estão nele e o histórico continuam, e você pode ativá-lo quando quiser.',
        confirmLabel: 'Inativar'
      });
      if (!ok) return;
    }
    try {
      await salvar.mutateAsync({ id: p.id, nome: p.nome, unidadeId: p.unidadeId ?? '', origem: p.origemRecurso ?? 'OUTRO', ativo: !p.ativo });
      toast.success(`Programa "${p.nome}" ${p.ativo ? 'inativado' : 'ativado'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível mudar a situação do programa.');
    }
  };

  const apagar = async (p: ProgramaFiscalizacao) => {
    const ok = await confirm({ title: `Excluir ${p.nome}?`, message: 'O programa não tem itens. Ele será apagado do cadastro, e essa ação não pode ser desfeita.', confirmLabel: 'Excluir', tone: 'danger' });
    if (!ok) return;
    try {
      await excluir.mutateAsync(p.id);
      toast.success(`Programa "${p.nome}" excluído.`);
    } catch (err) {
      // Ganhou itens depois que a tela carregou: o banco recusa.
      toast.error(err instanceof Error ? err.message : 'Não foi possível excluir o programa.');
      void q.refetch();
    }
  };

  const colunas: Column<ProgramaFiscalizacao>[] = [
    { key: 'nome', header: 'Programa', minWidth: '220px', priority: 'primary', sortValue: (p) => p.nome, render: (p) => <span style={carteiraIdentificacao}>{p.nome}</span> },
    { key: 'area', header: 'Área responsável', sortValue: (p) => p.unidadeSigla ?? '', render: (p) => <span style={carteiraValor}>{p.unidadeSigla ?? '—'}</span> },
    { key: 'origem', header: 'Origem do recurso', sortValue: (p) => (p.origemRecurso ? ROTULO_ORIGEM[p.origemRecurso] : ''), render: (p) => <span>{p.origemRecurso ? ROTULO_ORIGEM[p.origemRecurso] : '—'}</span> },
    { key: 'itens', header: 'Itens no programa', sortValue: (p) => p.itens, sortFirstDir: 'desc', render: (p) => (p.itens ? <span style={carteiraValor}>{numero(p.itens)} {p.itens === 1 ? 'item' : 'itens'}</span> : <span style={{ ...carteiraDetalhe, marginTop: 0 }}>nenhum item</span>) },
    { key: 'situacao', header: 'Situação', sortValue: (p) => (p.ativo ? 0 : 1), render: (p) => <StatusBadge label={p.ativo ? 'Ativo' : 'Inativo'} variant={p.ativo ? 'success' : 'neutral'} size="sm" dot={false} /> }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Programas"
        subtitle="Cadastro dos programas acompanhados pela Fiscalização."
        hint="Aqui se criam, editam, inativam e excluem os programas. Os itens dos contratos entram pela tela do programa (Fiscalização › Programas › Incluir itens no programa). Programa com itens não se exclui, só se inativa: sai das listas da Fiscalização e o histórico fica, como em Usuários e Unidades Internas."
        icon={<Network size={26} color="var(--primary)" aria-hidden="true" />}
        actions={podeCadastrar ? <ActionButton action="novo" size="sm" label="Novo programa" onClick={() => setEditando('novo')} data-testid="ajustes-programas-novo" /> : undefined}
      />
      <AdminListShell
        testId="ajustes-programas-lista"
        isLoading={q.isLoading}
        isError={q.isError}
        errorTitle="Não foi possível carregar os programas"
        errorMessage={q.error?.message}
        onRetry={() => void q.refetch()}
        isEmpty={!q.isLoading && linhas.length === 0}
        emptyTitle="Nenhum programa cadastrado."
      >
        <DataTable<ProgramaFiscalizacao>
          testId="ajustes-programas-tabela"
          className="data-table-container--flush"
          data={linhas}
          keyExtractor={(p) => p.id}
          rowStyle={(p) => (p.ativo ? undefined : { opacity: 0.6 })}
          columns={colunas}
          rowActions={
            podeCadastrar
              ? (p) => (
                  <RowActionsMenu
                    label={`Ações de ${p.nome}`}
                    testId={`ajustes-programas-acoes-${p.id}`}
                    actions={[
                      { label: 'Editar', onClick: () => setEditando(p) },
                      { label: p.ativo ? 'Inativar' : 'Ativar', onClick: () => void alternarSituacao(p) },
                      // Excluir só sem item ligado; com itens, o menu não oferece.
                      ...(p.itens ? [] : [{ label: 'Excluir', danger: true, onClick: () => void apagar(p) }])
                    ]}
                  />
                )
              : undefined
          }
        />
      </AdminListShell>
      {editando && <ProgramaModal programa={editando === 'novo' ? undefined : editando} onClose={() => setEditando(null)} />}
      {dialog}
    </PageContainer>
  );
};
