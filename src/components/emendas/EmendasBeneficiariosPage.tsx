import React, { useMemo, useState } from 'react';
import { Building } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { DataTable } from '../../design-system/components/DataTable';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { ActionButton } from '../../design-system/components/ActionButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useToast } from '../../design-system/components/Toast';
import { useBeneficiariosEmendas, usePodeGerirEmendas, useSalvarBeneficiario } from '../../hooks/useEmendas';
import { formatarCnpj, formatarTelefone, type BeneficiarioEmenda } from '../../services/emendasService';
import { enderecoDeEntrega } from '../../utils/emendasBeneficiarios';
import { BeneficiarioModal } from './BeneficiarioModal';

type Segmento = 'ativos' | 'inativos' | 'todos';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Órgãos que recebem o material das emendas (migration 155). Gestor de emendas e coordenador cadastram. */
export const EmendasBeneficiariosPage: React.FC = () => {
  const { data: lista = [], isLoading, isError, error, refetch } = useBeneficiariosEmendas();
  const podeGerir = usePodeGerirEmendas();
  const salvar = useSalvarBeneficiario();
  const toast = useToast();
  const [segmento, setSegmento] = useState<Segmento>('ativos');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<BeneficiarioEmenda | 'novo' | null>(null);

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    const digitos = busca.replace(/\D/g, '');
    return lista
      .filter((b) => segmento === 'todos' || (segmento === 'ativos' ? b.ativo : !b.ativo))
      .filter(
        (b) =>
          !termo ||
          semAcento(`${b.nomeCurto} ${b.razaoSocial} ${b.entregaMunicipio} ${b.entregaUf} ${b.responsavelNome}`).includes(termo) ||
          (digitos.length >= 4 && b.cnpj.includes(digitos))
      );
  }, [lista, segmento, busca]);

  const ativos = lista.filter((b) => b.ativo).length;
  const filtrosAtivos = Boolean(busca) || segmento !== 'ativos';

  const alternarAtivo = async (b: BeneficiarioEmenda) => {
    try {
      await salvar.mutateAsync({ ...b, ativo: !b.ativo });
      toast.success(b.ativo ? `${b.nomeCurto} desativado.` : `${b.nomeCurto} reativado.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Beneficiários"
        subtitle="Órgãos que recebem o material das emendas, com o endereço de entrega e o responsável pelo recebimento."
        hint="O CNPJ é consultado na Receita (nome, natureza jurídica e endereço da sede, só para leitura). O endereço de entrega vem pelo CEP e pode ser corrigido antes de salvar. Cada alteração fica no histórico."
        icon={<Building size={26} color="var(--primary)" aria-hidden="true" />}
        actions={podeGerir ? <ActionButton action="novo" label="Novo beneficiário" onClick={() => setEditando('novo')} data-testid="emendas-beneficiarios-novo" /> : undefined}
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-beneficiarios-situacao"
        ariaLabel="Situação dos beneficiários"
        active={segmento}
        onSelect={setSegmento}
        segments={[
          { id: 'ativos', label: 'Ativos', count: ativos },
          { id: 'inativos', label: 'Desativados', count: lista.length - ativos },
          { id: 'todos', label: 'Todos', count: lista.length }
        ]}
      />

      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar por nome, CNPJ, município ou responsável..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setSegmento('ativos');
        }}
        counter={carteiraCounter(filtrados.length, lista.length, filtrosAtivos, 'beneficiário', 'beneficiários')}
        testIdPrefix="emendas-beneficiarios"
      />

      <AdminListShell
        testId="emendas-beneficiarios-lista"
        title="Beneficiários das emendas"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os beneficiários"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os beneficiários.'}
        onRetry={() => refetch()}
        isEmpty={filtrados.length === 0}
        emptyTitle={lista.length === 0 ? 'Nenhum beneficiário cadastrado.' : 'Nenhum beneficiário encontrado.'}
        emptyDescription={lista.length === 0 ? (podeGerir ? 'Use "Novo beneficiário" e busque o órgão pelo CNPJ.' : 'A CAEP cadastra os órgãos que recebem o material.') : 'Ajuste a busca ou os filtros.'}
      >
        <DataTable<BeneficiarioEmenda>
          testId="emendas-beneficiarios-tabela"
          className="data-table-container--flush"
          data={filtrados}
          keyExtractor={(b) => b.id}
          rowStyle={(b) => (b.ativo ? undefined : { opacity: 0.7 })}
          columns={[
            {
              key: 'nome',
              header: 'Beneficiário',
              priority: 'primary',
              sortValue: (b) => b.nomeCurto,
              render: (b) => (
                <div>
                  <div style={{ fontWeight: 700 }}>{b.nomeCurto}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{b.razaoSocial}</div>
                </div>
              )
            },
            { key: 'cnpj', header: 'CNPJ', width: '170px', sortValue: (b) => b.cnpj, render: (b) => <span style={{ whiteSpace: 'nowrap' }}>{formatarCnpj(b.cnpj)}</span> },
            { key: 'entrega', header: 'Entrega', mobileLabel: 'Entrega', sortValue: (b) => `${b.entregaUf}${b.entregaMunicipio}`, render: (b) => <span style={{ fontSize: '0.82rem' }}>{enderecoDeEntrega(b)}</span> },
            {
              key: 'responsavel',
              header: 'Responsável',
              sortValue: (b) => b.responsavelNome,
              render: (b) => (
                <div style={{ fontSize: '0.82rem' }}>
                  <div style={{ fontWeight: 600 }}>
                    {b.responsavelNome}
                    {b.responsavelCargo ? ` (${b.responsavelCargo})` : ''}
                  </div>
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    {[b.responsavelTelefone ? `${formatarTelefone(b.responsavelTelefone)}${b.responsavelWhatsapp ? ' · WhatsApp' : ''}` : null, b.responsavelEmail].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
              )
            },
            {
              key: 'situacao',
              header: 'Situação',
              width: '120px',
              sortValue: (b) => (b.ativo ? 'Ativo' : 'Desativado'),
              render: (b) => <StatusBadge label={b.ativo ? 'Ativo' : 'Desativado'} variant={b.ativo ? 'success' : 'neutral'} size="sm" dot={false} />
            }
          ]}
          rowActions={
            podeGerir
              ? (b) => (
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <ActionButton action="editar" iconOnly label={`Editar ${b.nomeCurto}`} onClick={() => setEditando(b)} disabled={salvar.isPending} />
                    <ActionButton
                      action={b.ativo ? 'desativarCadastro' : 'reativarCadastro'}
                      iconOnly
                      label={`${b.ativo ? 'Desativar' : 'Reativar'} ${b.nomeCurto}`}
                      onClick={() => void alternarAtivo(b)}
                      disabled={salvar.isPending}
                      data-testid={`emendas-beneficiarios-ativo-${b.cnpj}`}
                    />
                  </div>
                )
              : undefined
          }
        />
      </AdminListShell>

      {editando && (
        <BeneficiarioModal
          beneficiario={editando === 'novo' ? null : editando}
          cnpjsExistentes={lista.map((b) => b.cnpj)}
          onClose={() => setEditando(null)}
        />
      )}
    </PageContainer>
  );
};
