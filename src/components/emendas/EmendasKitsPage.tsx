import React, { useMemo, useState } from 'react';
import { PackageOpen } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { ActionButton } from '../../design-system/components/ActionButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { carteiraIdentificacao, carteiraSubtitle } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useToast } from '../../design-system/components/Toast';
import { hojeEmBrasilia, useItensCaep, useKitsEmendas, usePodeGerirEmendas, useReservadoPorItem, useSalvarKit } from '../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../utils/format';
import { AVISO_VENCIMENTO_DIAS, calcularKit, ROTULO_SITUACAO_KIT, type CalculoDoKit, type ComponenteDoKit, type SituacaoKit } from '../../utils/emendasKits';
import type { KitEmenda } from '../../services/emendasService';
import { KitModal } from './KitModal';
import { ItemDaAta, VigenciaDaAta } from './emendasPartes';

type Segmento = 'todos' | SituacaoKit;
type Linha = KitEmenda & { calculo: CalculoDoKit };

const VARIANTE: Record<SituacaoKit, StatusBadgeVariant> = { disponivel: 'success', vence: 'warning', indisponivel: 'danger', desativado: 'neutral' };
const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)' };
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Composição do kit aberta na linha. */
const ComposicaoDoKit: React.FC<{ linha: Linha }> = ({ linha }) => {
  const hoje = hojeEmBrasilia();
  const colunas: Column<ComponenteDoKit>[] = [
    {
      key: 'item',
      header: 'Item',
      priority: 'primary',
      minWidth: '260px',
      render: (c) => <ItemDaAta item={c.item} semItem={`${c.itemKey} · sem alocação da CAEP`} />
    },
    {
      key: 'vigencia',
      header: 'Vigência',
      nowrap: true,
      render: (c) => <VigenciaDaAta item={c.item} hoje={hoje} />
    },
    { key: 'qtd', header: 'Por kit', align: 'right', nowrap: true, render: (c) => <b>{formatNumber(c.quantidade)}</b> },
    { key: 'saldo', header: 'Saldo da CAEP', align: 'right', nowrap: true, render: (c) => (c.item ? formatNumber(c.saldo) : '—') },
    { key: 'kits', header: 'Dá para', align: 'right', nowrap: true, render: (c) => (c.item && !c.item.ataEncerrada ? `${formatNumber(c.kits)} kits` : '—') }
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.4rem 0' }} data-testid={`emendas-kit-detalhe-${linha.id}`}>
      <DataTable<ComponenteDoKit> testId={`emendas-kit-composicao-${linha.id}`} data={linha.calculo.componentes} keyExtractor={(c) => c.itemKey} columns={colunas} />
      {linha.calculo.motivo && <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{linha.calculo.motivo}</div>}
      <div style={pequeno}>
        Mudar a composição cria uma nova versão; os pedidos já feitos guardam a composição do dia.
        {linha.atualizadoPorNome ? ` Última alteração: ${linha.atualizadoPorNome}${linha.atualizadoEm ? ` em ${new Date(linha.atualizadoEm).toLocaleDateString('pt-BR')}` : ''}.` : ''}
      </div>
    </div>
  );
};

/**
 * Kits das emendas (migration 155): conjunto de itens montado pela CAEP com o que ela tem alocado. A situação é
 * calculada todo dia pelas atas e pelo saldo; quem desativa é só a CAEP.
 */
export const EmendasKitsPage: React.FC = () => {
  const { data: kits = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useKitsEmendas();
  const { data: itens = [], isLoading: carregandoItens, refetch: recarregarItens } = useItensCaep();
  const podeGerir = usePodeGerirEmendas();
  const salvar = useSalvarKit();
  const toast = useToast();
  const hoje = hojeEmBrasilia();
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<KitEmenda | 'novo' | null>(null);

  const porChave = useMemo(() => new Map(itens.map((i) => [i.itemKey, i])), [itens]);
  const { data: reservado } = useReservadoPorItem();
  // Saldo do item para os kits = alocado à CAEP − reservado nos pedidos.
  const saldoDoItem = useMemo(() => (i: { itemKey: string; alocado: number }) => i.alocado - (reservado?.get(i.itemKey) ?? 0), [reservado]);
  const linhas: Linha[] = useMemo(() => kits.map((k) => ({ ...k, calculo: calcularKit(k, porChave, hoje, saldoDoItem) })), [kits, porChave, hoje, saldoDoItem]);

  const contagem = useMemo(() => {
    const c: Record<Segmento, number> = { todos: linhas.length, disponivel: 0, vence: 0, indisponivel: 0, desativado: 0 };
    for (const l of linhas) c[l.calculo.situacao]++;
    return c;
  }, [linhas]);

  const filtradas = useMemo(() => {
    const termo = semAcento(busca.trim());
    return linhas
      .filter((l) => (segmento === 'todos' ? l.calculo.situacao !== 'desativado' : l.calculo.situacao === segmento))
      .filter((l) => !termo || semAcento(`${l.nome} ${l.descricao ?? ''} ${l.calculo.componentes.map((c) => c.item?.descricao ?? '').join(' ')}`).includes(termo));
  }, [linhas, segmento, busca]);

  const filtrosAtivos = Boolean(busca.trim());
  const totalDoSegmento = segmento === 'todos' ? linhas.length - contagem.desativado : contagem[segmento];

  const alternarAtivo = async (k: KitEmenda) => {
    try {
      await salvar.mutateAsync({ id: k.id, versao: k.versao, nome: k.nome, descricao: k.descricao, ativo: !k.ativo, itens: k.itens });
      toast.success(k.ativo ? `${k.nome} desativado: sai da lista dos pedidos.` : `${k.nome} reativado.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const colunas: Column<Linha>[] = [
    {
      key: 'nome',
      header: 'Kit',
      priority: 'primary',
      minWidth: '220px',
      render: (l) => (
        <>
          <div style={carteiraIdentificacao}>{l.nome}</div>
          <div style={carteiraSubtitle}>
            {[`${l.itens.length} ${l.itens.length === 1 ? 'item' : 'itens'}`, l.versao > 1 ? `versão ${l.versao}` : null, l.descricao].filter(Boolean).join(' · ')}
          </div>
        </>
      )
    },
    ...(segmento === 'todos'
      ? [
          {
            key: 'situacao',
            header: 'Situação',
            nowrap: true,
            render: (l: Linha) => <StatusBadge label={ROTULO_SITUACAO_KIT[l.calculo.situacao]} variant={VARIANTE[l.calculo.situacao]} size="sm" dot={false} />
          }
        ]
      : []),
    { key: 'valor', header: 'Valor por kit', align: 'right', nowrap: true, render: (l) => formatCurrency(l.calculo.valorPorKit) },
    { key: 'possiveis', header: 'Kits possíveis', align: 'right', nowrap: true, render: (l) => <b>{formatNumber(l.calculo.kitsPossiveis)}</b> },
    {
      key: 'limite',
      header: 'Item que limita',
      mobileLabel: 'Item que limita',
      minWidth: '220px',
      render: (l) => {
        const c = l.calculo.itemLimitante;
        if (l.calculo.situacao === 'desativado' || !c) return <span style={carteiraSubtitle}>—</span>;
        return <ItemDaAta item={c.item} semItem={`${c.itemKey} · sem alocação da CAEP`} />;
      }
    }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Kits"
        subtitle="Conjuntos de itens que a CAEP oferece aos parlamentares."
        hint={`Só entram itens com alocação para a CAEP (${itens.length} hoje). O kit não guarda quantidade: quando o parlamentar pede N kits, cada item sai do saldo da CAEP N vezes a quantidade por kit. A situação é calculada sozinha: Vence em breve quando alguma ata do kit acaba em até ${AVISO_VENCIMENTO_DIAS} dias; Indisponível com ata encerrada ou sem saldo (volta sozinho se a ata for prorrogada).`}
        icon={<PackageOpen size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <>
            {podeGerir && <ActionButton action="novo" label="Novo kit" onClick={() => setEditando('novo')} disabled={carregandoItens} data-testid="emendas-kits-novo" />}
            <HeaderRefreshAction
              onRefresh={() => Promise.all([refetch(), recarregarItens()])}
              isRefreshing={isFetching}
              lastUpdated={dataUpdatedAt || null}
              dataTestId="emendas-kits-atualizar"
              tooltipTitle="Recarregar os kits e o saldo dos itens da CAEP"
            />
          </>
        }
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-kits-situacao"
        ariaLabel="Situação dos kits"
        active={segmento}
        onSelect={setSegmento}
        segments={[
          { id: 'disponivel', label: 'Disponíveis', count: contagem.disponivel, dot: 'var(--color-success)' },
          { id: 'vence', label: 'Vence em breve', count: contagem.vence, dot: 'var(--color-warning-solid)' },
          { id: 'indisponivel', label: 'Indisponíveis', count: contagem.indisponivel, dot: 'var(--color-danger)' },
          { id: 'todos', label: 'Todos', count: linhas.length - contagem.desativado },
          { id: 'desativado', label: 'Desativados', count: contagem.desativado }
        ]}
      />

      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar kit ou item..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => setBusca('')}
        counter={carteiraCounter(filtradas.length, totalDoSegmento, filtrosAtivos, 'kit', 'kits')}
        testIdPrefix="emendas-kits"
      />

      <AdminListShell
        testId="emendas-kits-lista"
        isLoading={isLoading || carregandoItens}
        isError={isError}
        errorTitle="Não foi possível carregar os kits"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os kits.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && !carregandoItens && filtradas.length === 0}
        emptyTitle={linhas.length === 0 ? 'Nenhum kit montado.' : 'Nenhum kit nesta situação.'}
        emptyDescription={linhas.length === 0 ? (podeGerir ? 'Use "Novo kit" para agrupar itens alocados à CAEP.' : 'A CAEP monta os kits com os itens alocados a ela.') : 'Ajuste a busca ou escolha outra situação.'}
      >
        <DataTable<Linha>
          testId="emendas-kits-tabela"
          className="data-table-container--flush"
          data={filtradas}
          keyExtractor={(l) => l.id}
          rowStyle={(l) => (l.calculo.situacao === 'desativado' ? { opacity: 0.7 } : undefined)}
          columns={colunas}
          renderExpanded={(l) => <ComposicaoDoKit linha={l} />}
          rowActions={
            podeGerir
              ? (l) => (
                  <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    <ActionButton action="editar" iconOnly label={`Alterar ${l.nome}`} onClick={() => setEditando(l)} disabled={salvar.isPending} data-testid={`emendas-kits-editar-${l.id}`} />
                    <ActionButton
                      action={l.ativo ? 'desativarCadastro' : 'reativarCadastro'}
                      iconOnly
                      label={`${l.ativo ? 'Desativar' : 'Reativar'} ${l.nome}`}
                      onClick={() => void alternarAtivo(l)}
                      disabled={salvar.isPending}
                      data-testid={`emendas-kits-ativo-${l.id}`}
                    />
                  </div>
                )
              : undefined
          }
        />
      </AdminListShell>

      {editando && (
        <KitModal
          kit={editando === 'novo' ? null : editando}
          itens={itens}
          nomesExistentes={kits.filter((k) => editando === 'novo' || k.id !== editando.id).map((k) => k.nome)}
          hoje={hoje}
          saldoDoItem={saldoDoItem}
          onClose={() => setEditando(null)}
        />
      )}
    </PageContainer>
  );
};
