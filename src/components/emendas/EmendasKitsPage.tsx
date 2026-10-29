import React, { useEffect, useMemo, useState } from 'react';
import { PackageOpen } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge, type StatusBadgeVariant } from '../../design-system/components/StatusBadge';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { carteiraDetalhe, carteiraIdentificacao, carteiraNumero, carteiraSubtitle, carteiraValor } from '../carteira/carteiraStyles';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useToast } from '../../design-system/components/Toast';
import { useConfirmDialog } from '../../design-system';
import { hojeEmBrasilia, useItensCaep, useKitsEmendas, usePodeGerirEmendas, useExcluirKit, useReservadoPorItem, useSalvarKit } from '../../hooks/useEmendas';
import { formatNumber } from '../../utils/format';
import { avisoIndicacaoDias, corteIndicacaoDias, ROTULO_SITUACAO_KIT, type ComponenteDoKit, type SituacaoKit } from '../../utils/emendasKits';
import type { KitEmenda } from '../../services/emendasService';
import { KitModal } from './KitModal';
import { montarLinhasKitsCaep, saldoDoItemParaKits, type LinhaKitCaep } from '../../utils/emendasItensSaldo';
import { ItemDaAta, PrecoDaEmenda, VigenciaDaAta } from './emendasPartes';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';

type Segmento = 'todos' | SituacaoKit;
type Linha = LinhaKitCaep;

const VARIANTE: Record<SituacaoKit, StatusBadgeVariant> = { disponivel: 'success', vence: 'warning', indisponivel: 'danger', desativado: 'neutral' };
const vazio = <span style={{ ...carteiraDetalhe, marginTop: 0 }}>—</span>;
const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)' };
// Ordenação pelo cabeçalho, como nas carteiras (?ordem=).
const ORDEM: Record<string, CarteiraSortColumn<Linha>> = {
  nome: { value: (l) => l.nome },
  valor: { value: (l) => l.calculo.valorPorKit, firstDir: 'desc' },
  possiveis: { value: (l) => l.calculo.kitsPossiveis, firstDir: 'desc' },
  limite: { value: (l) => l.calculo.itemLimitante?.item?.descricao }
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Composição do kit aberta na linha. */
const ComposicaoDoKit: React.FC<{ linha: Linha; onAbrirItem?: (itemKey: string) => void }> = ({ linha, onAbrirItem }) => {
  const hoje = hojeEmBrasilia();
  const colunas: Column<ComponenteDoKit>[] = [
    {
      key: 'item',
      header: 'Item',
      priority: 'primary',
      minWidth: '260px',
      render: (c) => (
        <ItemDaAta
          item={c.item}
          semItem={`${c.itemKey} · sem alocação da CAEP`}
          extra={
            c.item && onAbrirItem ? (
              <AppButton type="button" variant="link" size="sm" onClick={() => onAbrirItem(c.itemKey)} data-testid={`emendas-kit-abrir-item-${c.itemKey}`}>
                Ver o item
              </AppButton>
            ) : undefined
          }
        />
      )
    },
    {
      key: 'vigencia',
      header: 'Vigência',
      nowrap: true,
      render: (c) => <VigenciaDaAta item={c.item} hoje={hoje} />
    },
    { key: 'qtd', header: 'Por kit', align: 'right', nowrap: true, render: (c) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatNumber(c.quantidade)}</span> },
    { key: 'saldo', header: 'Saldo da CAEP', align: 'right', nowrap: true, render: (c) => (c.item ? <span style={carteiraNumero}>{formatNumber(c.saldo)}</span> : vazio) },
    { key: 'kits', header: 'Dá para', align: 'right', nowrap: true, render: (c) => (c.item && !c.item.ataEncerrada ? <span style={carteiraNumero}>{formatNumber(c.kits)} kits</span> : vazio) }
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

interface Props {
  /** Seletor Por item · Por kit da aba Itens de Emendas, no cabeçalho. */
  seletor?: React.ReactNode;
  /** Kit que já chega aberto (vindo de um item). */
  abrir?: string | null;
  onAbrirItem?: (itemKey: string) => void;
  /** Botão Exportar da aba Itens (itens e kits com saldo), ao lado de Atualizar. */
  exportar?: React.ReactNode;
}

/**
 * Emendas › Itens › Por kit (migration 155): conjunto de itens montado pela CAEP com o que ela tem alocado. A situação é
 * calculada todo dia pelas atas e pelo saldo; quem desativa é só a CAEP.
 */
export const EmendasKitsPage: React.FC<Props> = ({ seletor, abrir, onAbrirItem, exportar }) => {
  const { data: kits = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useKitsEmendas();
  const { data: itens = [], isLoading: carregandoItens, refetch: recarregarItens } = useItensCaep();
  const podeGerir = usePodeGerirEmendas();
  const salvar = useSalvarKit();
  const excluir = useExcluirKit();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const hoje = hojeEmBrasilia();
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<KitEmenda | 'novo' | null>(null);
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set(abrir ? [abrir] : []));
  const alternar = (k: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(k)) novo.delete(k);
      else novo.add(k);
      return novo;
    });

  const { data: reservado } = useReservadoPorItem();
  const saldoDoItem = useMemo(() => saldoDoItemParaKits(reservado), [reservado]);
  const { precos } = usePrecosParaEmenda();
  const linhas: Linha[] = useMemo(() => montarLinhasKitsCaep(kits, itens, hoje, reservado, precos), [kits, itens, hoje, reservado, precos]);

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
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ORDEM);

  // Vindo do item: kit desativado só aparece no seu trilho; a linha aberta entra na tela.
  const alvo = abrir ? linhas.find((l) => l.id === abrir) : undefined;
  useEffect(() => {
    if (!alvo) return;
    setSegmento(alvo.calculo.situacao === 'desativado' ? 'desativado' : 'todos');
    requestAnimationFrame(() => document.querySelector(`[data-testid="emendas-kit-detalhe-${CSS.escape(alvo.id)}"]`)?.scrollIntoView({ block: 'center' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo?.id]);

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

  // Só o kit que nenhum pedido usa; o de pedido só se desativa (migration 251).
  const excluirKit = async (k: KitEmenda) => {
    const ok = await confirm({ title: 'Excluir kit', message: `Excluir ${k.nome}? Nenhum pedido usa este kit. A exclusão não pode ser desfeita.`, confirmLabel: 'Excluir', tone: 'danger' });
    if (!ok) return;
    try {
      await excluir.mutateAsync(k);
      toast.success(`${k.nome} excluído.`);
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
      sortValue: ORDEM.nome.value,
      render: (l) => (
        <>
          <div style={carteiraIdentificacao}>{l.nome}</div>
          <div style={{ ...carteiraSubtitle, marginTop: '0.15rem' }}>
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
    { key: 'valor', header: 'Valor por kit', align: 'right', nowrap: true, sortValue: ORDEM.valor.value, sortFirstDir: 'desc', render: (l) => <PrecoDaEmenda valor={l.calculo.valorPorKit} /> },
    {
      key: 'possiveis',
      header: 'Kits possíveis',
      align: 'right',
      nowrap: true,
      sortValue: ORDEM.possiveis.value,
      sortFirstDir: 'desc',
      render: (l) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatNumber(l.calculo.kitsPossiveis)}</span>
    },
    {
      key: 'limite',
      header: 'Item que limita',
      mobileLabel: 'Item que limita',
      minWidth: '220px',
      sortValue: ORDEM.limite.value,
      render: (l) => {
        const c = l.calculo.itemLimitante;
        if (l.calculo.situacao === 'desativado' || !c) return vazio;
        return <ItemDaAta item={c.item} semItem={`${c.itemKey} · sem alocação da CAEP`} />;
      }
    }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Itens"
        subtitle="Conjuntos de itens que a CAEP oferece aos parlamentares, e quantos ainda cabem no saldo."
        hint={`O kit não guarda quantidade: pedir N kits tira de cada item N vezes a quantidade por kit. Vence em breve = alguma ata do kit acaba em até ${avisoIndicacaoDias()} dias; Indisponível = ata encerrada, a menos de ${corteIndicacaoDias()} dias do fim, item perto do reajuste da ata ou sem saldo (prazos em Ajustes › Regras de Alertas).`}
        icon={<PackageOpen size={26} color="var(--primary)" aria-hidden="true" />}
        viewToggle={seletor}
        actions={
          <>
            {exportar}
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
          data={sorted}
          keyExtractor={(l) => l.id}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          rowStyle={(l) => (l.calculo.situacao === 'desativado' ? { opacity: 0.7 } : undefined)}
          columns={colunas}
          expandedKeys={abertos}
          onToggleExpand={alternar}
          renderExpanded={(l) => <ComposicaoDoKit linha={l} onAbrirItem={onAbrirItem} />}
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
                      disabled={salvar.isPending || excluir.isPending}
                      data-testid={`emendas-kits-ativo-${l.id}`}
                    />
                    {l.pedidos === 0 && (
                      <ActionButton action="excluir" iconOnly label={`Excluir ${l.nome}`} onClick={() => void excluirKit(l)} disabled={salvar.isPending || excluir.isPending} data-testid={`emendas-kits-excluir-${l.id}`} />
                    )}
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
