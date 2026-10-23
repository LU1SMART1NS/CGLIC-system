import React, { useMemo, useState } from 'react';
import { Boxes } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { carteiraIdentificacao, carteiraSubtitle } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { hojeEmBrasilia, useAutoresEmendas, useItensCaep, useKitsEmendas, usePedidosEmendas } from '../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../utils/format';
import { descricaoItemEmFrase } from '../../utils/textCase';
import { buscarItensCaep } from '../../utils/emendasKits';
import { ItemDaAta, VigenciaDaAta } from './emendasPartes';
import { AUTOR_A_DEFINIR, identificacaoDoPedido, itensDaLinha, linhasAtivas, ROTULO_ETAPA } from '../../utils/emendasPedidos';
import type { EtapaPedido, ItemCaep } from '../../services/emendasService';

type Segmento = 'com' | 'sem' | 'encerrada' | 'todos';
interface Uso {
  pedidoId: string;
  identificacao: string;
  autorId: string | null;
  etapa: EtapaPedido;
  origem: string;
  quantidade: number;
}
type Linha = ItemCaep & { reservado: number; saldo: number; usos: Uso[] };

/**
 * Itens da CAEP (migration 157): todos os itens com alocação para a CAEP, quanto já está reservado nos pedidos (kits
 * abertos) e o saldo a oferecer.
 */
export const EmendasPorItemPage: React.FC = () => {
  const { data: itens = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useItensCaep();
  const { data: pedidos = [], refetch: recarregarPedidos } = usePedidosEmendas();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: kits = [] } = useKitsEmendas();
  const hoje = hojeEmBrasilia();
  const [segmento, setSegmento] = useState<Segmento>('com');
  const [busca, setBusca] = useState('');

  const nomeAutor = useMemo(() => new Map(autores.map((a) => [a.id, a.nome])), [autores]);
  const linhas: Linha[] = useMemo(() => {
    const usos = new Map<string, Uso[]>();
    for (const p of pedidos) {
      if (p.etapa === 'CANCELADO') continue;
      for (const l of linhasAtivas(p)) {
        for (const x of itensDaLinha(l)) {
          const lista = usos.get(x.itemKey) ?? [];
          lista.push({ pedidoId: p.id, identificacao: identificacaoDoPedido(p), autorId: p.autorId, etapa: p.etapa, origem: l.tipo === 'KIT' ? `${l.kitNome} × ${l.quantidade}` : 'avulso', quantidade: x.quantidade });
          usos.set(x.itemKey, lista);
        }
      }
    }
    return itens.map((i) => {
      const u = (usos.get(i.itemKey) ?? []).sort((a, b) => b.quantidade - a.quantidade);
      const reservado = u.reduce((s, x) => s + x.quantidade, 0);
      return { ...i, reservado, saldo: i.alocado - reservado, usos: u };
    });
  }, [itens, pedidos]);

  const situacao = (l: Linha): Segmento => (l.ataEncerrada ? 'encerrada' : l.saldo > 0 ? 'com' : 'sem');
  const contagem = useMemo(() => {
    const c: Record<Segmento, number> = { com: 0, sem: 0, encerrada: 0, todos: linhas.length };
    for (const l of linhas) c[situacao(l)]++;
    return c;
  }, [linhas]);

  const doSegmento = linhas.filter((l) => segmento === 'todos' || situacao(l) === segmento);
  const filtradas = (buscarItensCaep(doSegmento, busca) as Linha[]).sort((a, b) => descricaoItemEmFrase(a.descricao).localeCompare(descricaoItemEmFrase(b.descricao), 'pt-BR'));
  const vigentes = linhas.filter((l) => !l.ataEncerrada);
  const valorAlocado = vigentes.reduce((s, l) => s + l.alocado * l.valorUnitario, 0);
  const valorReservado = vigentes.reduce((s, l) => s + Math.min(l.reservado, l.alocado) * l.valorUnitario, 0);
  const kitsDoItem = (k: string) => kits.filter((x) => x.ativo && x.itens.some((i) => i.itemKey === k)).map((x) => x.nome);

  const colunas: Column<Linha>[] = [
    {
      key: 'item',
      header: 'Item',
      priority: 'primary',
      minWidth: '280px',
      render: (l) => <ItemDaAta item={l} />
    },
    {
      key: 'vigencia',
      header: 'Vigência',
      nowrap: true,
      render: (l) => <VigenciaDaAta item={l} hoje={hoje} />
    },
    { key: 'alocado', header: 'Alocado à CAEP', align: 'right', nowrap: true, render: (l) => <b>{formatNumber(l.alocado)}</b> },
    {
      key: 'reservado',
      header: 'Reservado',
      align: 'right',
      nowrap: true,
      render: (l) => (
        <>
          <div>{formatNumber(l.reservado)}</div>
          <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9', marginTop: 4, overflow: 'hidden', minWidth: 80 }} aria-hidden="true">
            <div style={{ height: '100%', width: `${l.alocado > 0 ? Math.min(100, (l.reservado / l.alocado) * 100) : 0}%`, background: 'var(--primary)' }} />
          </div>
        </>
      )
    },
    { key: 'saldo', header: 'Saldo', align: 'right', nowrap: true, render: (l) => <b style={{ color: l.saldo <= 0 ? 'var(--text-muted)' : undefined }}>{formatNumber(l.saldo)}</b> },
    { key: 'valor', header: 'Valor unitário', align: 'right', nowrap: true, render: (l) => formatCurrency(l.valorUnitario) }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Itens da CAEP"
        subtitle="Quanto de cada item alocado à CAEP já foi reservado a parlamentares."
        hint="Reservado soma os pedidos que não foram cancelados, em qualquer etapa, com os kits abertos nos seus itens. Saldo = alocado à CAEP − reservado. Para ter mais de um item, peça a alocação ao gestor de saldo."
        icon={<Boxes size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => Promise.all([refetch(), recarregarPedidos()])} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-itens-atualizar" tooltipTitle="Recarregar os itens e os pedidos" />}
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-itens-situacao"
        ariaLabel="Saldo dos itens"
        active={segmento}
        onSelect={setSegmento}
        meta={valorAlocado > 0 ? `${formatCurrency(valorReservado)} reservados de ${formatCurrency(valorAlocado)} alocados (atas vigentes)` : undefined}
        segments={[
          { id: 'com', label: 'Com saldo', count: contagem.com, dot: 'var(--color-success)' },
          { id: 'sem', label: 'Sem saldo', count: contagem.sem, dot: 'var(--color-warning-solid)' },
          { id: 'todos', label: 'Todos', count: contagem.todos },
          { id: 'encerrada', label: 'Ata encerrada', count: contagem.encerrada }
        ]}
      />

      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pela descrição, ata (ex.: 31/2025) ou item (ex.: item 2)..."
        onChangeBusca={setBusca}
        hasActiveFilters={Boolean(busca.trim())}
        onResetFilters={() => setBusca('')}
        counter={carteiraCounter(filtradas.length, doSegmento.length, Boolean(busca.trim()), 'item', 'itens')}
        testIdPrefix="emendas-itens"
      />

      <AdminListShell
        testId="emendas-itens-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os itens da CAEP"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os itens.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && filtradas.length === 0}
        emptyTitle={itens.length === 0 ? 'A CAEP ainda não tem itens alocados.' : 'Nenhum item nesta situação.'}
        emptyDescription={itens.length === 0 ? 'O gestor de saldo aloca os itens à CAEP em Alocação.' : 'Ajuste a busca ou escolha outra situação.'}
      >
        <DataTable<Linha>
          testId="emendas-itens-tabela"
          className="data-table-container--flush"
          data={filtradas}
          keyExtractor={(l) => l.itemKey}
          rowStyle={(l) => (l.ataEncerrada ? { opacity: 0.7 } : undefined)}
          columns={colunas}
          renderExpanded={(l) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.4rem 0' }} data-testid={`emendas-item-detalhe-${l.itemKey}`}>
              {l.usos.length === 0 ? (
                <div style={carteiraSubtitle}>Ninguém reservou este item ainda.</div>
              ) : (
                <DataTable<Uso>
                  testId={`emendas-item-usos-${l.itemKey}`}
                  data={l.usos}
                  keyExtractor={(u) => `${u.pedidoId}-${u.origem}`}
                  columns={[
                    { key: 'autor', header: 'Autor', priority: 'primary', render: (u) => <span style={carteiraIdentificacao}>{u.autorId ? nomeAutor.get(u.autorId) ?? u.autorId : AUTOR_A_DEFINIR}</span> },
                    { key: 'pedido', header: 'Reserva / ofício', nowrap: true, render: (u) => u.identificacao },
                    { key: 'origem', header: 'Origem', render: (u) => (u.origem === 'avulso' ? 'Avulso' : /^kit\b/i.test(u.origem) ? u.origem : `Kit ${u.origem}`) },
                    { key: 'etapa', header: 'Etapa', nowrap: true, render: (u) => ROTULO_ETAPA[u.etapa] },
                    { key: 'qtd', header: 'Quantidade', align: 'right', nowrap: true, render: (u) => <b>{formatNumber(u.quantidade)}</b> }
                  ]}
                />
              )}
              {kitsDoItem(l.itemKey).length > 0 && <div style={carteiraSubtitle}>Entra nos kits: {kitsDoItem(l.itemKey).join(', ')}.</div>}
            </div>
          )}
        />
      </AdminListShell>
    </PageContainer>
  );
};
