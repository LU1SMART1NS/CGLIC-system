import React, { useMemo, useState } from 'react';
import { Building } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { ActionButton } from '../../design-system/components/ActionButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { carteiraFornecedor, carteiraIdentificacao, carteiraSubtitle } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useToast } from '../../design-system/components/Toast';
import { useBeneficiariosEmendas, usePodeGerirEmendas, useSalvarBeneficiario } from '../../hooks/useEmendas';
import { formatarCep, formatarCnpj, type BeneficiarioEmenda } from '../../services/emendasService';
import { BeneficiarioModal } from './BeneficiarioModal';
import { ContatoDoResponsavel } from './ContatoDoResponsavel';

type Segmento = 'ativos' | 'inativos' | 'todos';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Órgãos que recebem o material das emendas (migration 155). Gestor de emendas e coordenador cadastram. */
export const EmendasBeneficiariosPage: React.FC = () => {
  const { data: lista = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useBeneficiariosEmendas();
  const podeGerir = usePodeGerirEmendas();
  const salvar = useSalvarBeneficiario();
  const toast = useToast();
  const [segmento, setSegmento] = useState<Segmento>('ativos');
  const [uf, setUf] = useState('');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<BeneficiarioEmenda | 'novo' | null>(null);

  const doSegmento = useMemo(() => lista.filter((b) => segmento === 'todos' || (segmento === 'ativos' ? b.ativo : !b.ativo)), [lista, segmento]);

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    const digitos = busca.replace(/\D/g, '');
    return doSegmento
      .filter((b) => !uf || b.entregaUf === uf)
      .filter(
        (b) =>
          !termo ||
          semAcento(`${b.nomeCurto} ${b.razaoSocial} ${b.entregaMunicipio} ${b.responsavelNome}`).includes(termo) ||
          (digitos.length >= 4 && b.cnpj.includes(digitos))
      );
  }, [doSegmento, uf, busca]);

  const ufs = useMemo(() => {
    const c = new Map<string, number>();
    for (const b of doSegmento) c.set(b.entregaUf, (c.get(b.entregaUf) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, label: value, count }));
  }, [doSegmento]);

  const ativos = lista.filter((b) => b.ativo).length;
  const filtrosAtivos = Boolean(busca.trim() || uf);

  const alternarAtivo = async (b: BeneficiarioEmenda) => {
    try {
      await salvar.mutateAsync({ ...b, ativo: !b.ativo });
      toast.success(b.ativo ? `${b.nomeCurto} desativado.` : `${b.nomeCurto} reativado.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Três colunas com três linhas cada, alinhadas pelo topo (className emendas-tabela-topo): quem é, onde entrega, com quem falar.
  const colunas: Column<BeneficiarioEmenda>[] = [
    {
      key: 'nome',
      header: 'Beneficiário',
      priority: 'primary',
      width: '34%',
      render: (b) => (
        <>
          <div style={carteiraIdentificacao}>{b.nomeCurto}</div>
          <div style={carteiraFornecedor}>{b.razaoSocial}</div>
          <div style={{ ...carteiraSubtitle, whiteSpace: 'nowrap' }}>CNPJ {formatarCnpj(b.cnpj)}</div>
        </>
      )
    },
    {
      key: 'entrega',
      header: 'Entrega',
      width: '38%',
      render: (b) => (
        <>
          <div style={{ fontWeight: 600 }}>
            {b.entregaMunicipio}/{b.entregaUf}
          </div>
          <div style={carteiraSubtitle}>{[`${b.entregaLogradouro}, ${b.entregaNumero}`, b.entregaComplemento].filter(Boolean).join(' · ')}</div>
          <div style={carteiraSubtitle}>{[b.entregaBairro, `CEP ${formatarCep(b.entregaCep)}`].filter(Boolean).join(' · ')}</div>
        </>
      )
    },
    {
      key: 'responsavel',
      header: 'Responsável',
      width: '28%',
      render: (b) => (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{b.responsavelNome}</span>
            <ContatoDoResponsavel nome={b.responsavelNome} telefone={b.responsavelTelefone} email={b.responsavelEmail} />
          </div>
          {b.responsavelCargo && <div style={carteiraSubtitle}>{b.responsavelCargo}</div>}
        </>
      )
    },
    ...(segmento === 'todos'
      ? [
          {
            key: 'situacao',
            header: 'Situação',
            nowrap: true,
            render: (b: BeneficiarioEmenda) => <StatusBadge label={b.ativo ? 'Ativo' : 'Desativado'} variant={b.ativo ? 'success' : 'neutral'} size="sm" dot={false} />
          }
        ]
      : [])
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Beneficiários"
        subtitle="Órgãos que recebem o material das emendas."
        hint="O CNPJ é consultado na Receita (nome, natureza jurídica e endereço da sede, só para leitura). O endereço de entrega vem pelo CEP e o responsável pelo recebimento é informado pela CAEP; os dois podem ser atualizados a qualquer momento e cada alteração fica no histórico."
        icon={<Building size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <>
            {podeGerir && <ActionButton action="novo" label="Novo beneficiário" onClick={() => setEditando('novo')} data-testid="emendas-beneficiarios-novo" />}
            <HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-beneficiarios-atualizar" tooltipTitle="Recarregar os beneficiários" />
          </>
        }
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-beneficiarios-situacao"
        ariaLabel="Situação dos beneficiários"
        active={segmento}
        onSelect={setSegmento}
        segments={[
          { id: 'ativos', label: 'Ativos', count: ativos, dot: 'var(--color-success)' },
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
          setUf('');
        }}
        counter={carteiraCounter(filtrados.length, doSegmento.length, filtrosAtivos, 'beneficiário', 'beneficiários')}
        testIdPrefix="emendas-beneficiarios"
      >
        <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={ufs} onChange={setUf} testId="emendas-beneficiarios-filtro-uf" />
      </CarteiraFilterBar>

      <AdminListShell
        testId="emendas-beneficiarios-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os beneficiários"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os beneficiários.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && filtrados.length === 0}
        emptyTitle={lista.length === 0 ? 'Nenhum beneficiário cadastrado.' : 'Nenhum beneficiário encontrado.'}
        emptyDescription={lista.length === 0 ? (podeGerir ? 'Use "Novo beneficiário" e busque o órgão pelo CNPJ.' : 'A CAEP cadastra os órgãos que recebem o material.') : 'Ajuste a busca ou os filtros.'}
      >
        <DataTable<BeneficiarioEmenda>
          testId="emendas-beneficiarios-tabela"
          className="data-table-container--flush emendas-tabela-topo"
          data={filtrados}
          keyExtractor={(b) => b.id}
          rowStyle={(b) => (b.ativo ? undefined : { opacity: 0.7 })}
          columns={colunas}
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

      {editando && <BeneficiarioModal beneficiario={editando === 'novo' ? null : editando} cnpjsExistentes={lista.map((b) => b.cnpj)} onClose={() => setEditando(null)} />}
    </PageContainer>
  );
};
