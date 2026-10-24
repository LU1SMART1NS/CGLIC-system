import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppButton } from '../../design-system/components/AppButton';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { carteiraDetalhe, carteiraIdentificacao, carteiraNumero, carteiraSubtitle, carteiraValor } from '../carteira/carteiraStyles';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { hojeEmBrasilia, useAutoresEmendas, useItensCaep, useKitsEmendas, usePedidosEmendas, usePodeGerirEmendas } from '../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../utils/format';
import { descricaoItemEmFrase } from '../../utils/textCase';
import { buscarItensCaep, rotuloItemDaAta } from '../../utils/emendasKits';
import { ItemDaAta, ValorPrevisto, VigenciaDaAta } from './emendasPartes';
import { usePrecosParaEmenda } from '../../hooks/useEmendasQuadro';
import { notaDoPreco } from '../../utils/emendasQuadro';
import { DadosItemModal } from './DadosItemModal';
import { AUTOR_A_DEFINIR, identificacaoDoPedido, itensDaLinha, linhasAtivas, precoParaEmenda, ROTULO_ETAPA } from '../../utils/emendasPedidos';
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
/** previsto/hoje: preço unitário para a emenda (o do quadro do parlamentar) e o de hoje; nota: por que mudou. */
type Linha = ItemCaep & { reservado: number; saldo: number; usos: Uso[]; previsto: number; hoje: number; nota: string | null };

// Ordenação pelo cabeçalho, como nas carteiras (?ordem=); sem escolha, pela descrição do item.
const ORDEM: Record<string, CarteiraSortColumn<Linha>> = {
  item: { value: (l) => descricaoItemEmFrase(l.descricao) },
  quadro: { value: (l) => l.nomeCurto },
  vigencia: { value: (l) => l.vigenciaFinal },
  alocado: { value: (l) => l.alocado, firstDir: 'desc' },
  reservado: { value: (l) => l.reservado, firstDir: 'desc' },
  saldo: { value: (l) => l.saldo, firstDir: 'desc' },
  valor: { value: (l) => l.previsto, firstDir: 'desc' }
};

interface Props {
  /** Seletor Por item · Por kit da aba Itens e kits, no cabeçalho. */
  seletor?: React.ReactNode;
  /** Item que já chega aberto (vindo da composição de um kit). */
  abrir?: string | null;
  onAbrirKit?: (kitId: string) => void;
}

/**
 * Itens e kits › Por item (migration 157): todos os itens com alocação para a CAEP, quanto já está reservado nos pedidos
 * (kits abertos) e o saldo a oferecer.
 */
export const EmendasPorItemPage: React.FC<Props> = ({ seletor, abrir, onAbrirKit }) => {
  const { data: itens = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useItensCaep();
  const { data: pedidos = [], refetch: recarregarPedidos } = usePedidosEmendas();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: kits = [] } = useKitsEmendas();
  const hoje = hojeEmBrasilia();
  const { precos, ipca } = usePrecosParaEmenda();
  const [segmento, setSegmento] = useState<Segmento>('com');
  // Vindo do Início (saldo livre perto do fim): ?busca= já filtra o item.
  const [searchParams] = useSearchParams();
  const [busca, setBusca] = useState(() => searchParams.get('busca') ?? '');
  const podeGerir = usePodeGerirEmendas();
  const [editando, setEditando] = useState<ItemCaep | null>(null);
  const [abertos, setAbertos] = useState<ReadonlySet<string>>(() => new Set(abrir ? [abrir] : []));

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
    const porChave = new Map(itens.map((i) => [i.itemKey, i]));
    return itens.map((i) => {
      const u = (usos.get(i.itemKey) ?? []).sort((a, b) => b.quantidade - a.quantidade);
      const reservado = u.reduce((s, x) => s + x.quantidade, 0);
      const preco = precoParaEmenda(i.itemKey, porChave, precos);
      return { ...i, reservado, saldo: i.alocado - reservado, usos: u, previsto: preco.previsto, hoje: preco.hoje, nota: notaDoPreco(preco.preco, ipca) };
    });
  }, [itens, pedidos, precos, ipca]);

  const situacao = (l: Linha): Segmento => (l.ataEncerrada ? 'encerrada' : l.saldo > 0 ? 'com' : 'sem');
  const contagem = useMemo(() => {
    const c: Record<Segmento, number> = { com: 0, sem: 0, encerrada: 0, todos: linhas.length };
    for (const l of linhas) c[situacao(l)]++;
    return c;
  }, [linhas]);

  const doSegmento = linhas.filter((l) => segmento === 'todos' || situacao(l) === segmento);
  const filtradas = (buscarItensCaep(doSegmento, busca) as Linha[]).sort((a, b) => descricaoItemEmFrase(a.descricao).localeCompare(descricaoItemEmFrase(b.descricao), 'pt-BR'));
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ORDEM);
  const vigentes = linhas.filter((l) => !l.ataEncerrada);
  // O alocado é o que a CAEP tem hoje (preço de hoje); o reservado vai para as emendas (preço previsto, o do quadro).
  const valorAlocado = vigentes.reduce((s, l) => s + l.alocado * l.hoje, 0);
  const valorReservado = vigentes.reduce((s, l) => s + Math.min(l.reservado, l.alocado) * l.previsto, 0);
  const kitsDoItem = (k: string) => kits.filter((x) => x.ativo && x.itens.some((i) => i.itemKey === k));

  // Vindo do kit: o trilho vai para a situação do item e a linha aberta entra na tela.
  const alvo = abrir ? linhas.find((l) => l.itemKey === abrir) : undefined;
  useEffect(() => {
    if (!alvo) return;
    setSegmento(situacao(alvo));
    requestAnimationFrame(() => document.querySelector(`[data-testid="emendas-item-detalhe-${CSS.escape(alvo.itemKey)}"]`)?.scrollIntoView({ block: 'center' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo?.itemKey]);
  const alternar = (k: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(k)) novo.delete(k);
      else novo.add(k);
      return novo;
    });

  const colunas: Column<Linha>[] = [
    {
      key: 'item',
      header: 'Item',
      priority: 'primary',
      minWidth: '280px',
      sortValue: ORDEM.item.value,
      render: (l) => <ItemDaAta item={l} />
    },
    {
      key: 'quadro',
      header: 'No quadro',
      minWidth: '160px',
      sortValue: ORDEM.quadro.value,
      render: (l) => (
        <>
          {l.nomeCurto ? <div style={carteiraValor}>{l.nomeCurto}</div> : <div style={{ ...carteiraDetalhe, marginTop: 0 }}>sem nome curto</div>}
          <div style={{ marginTop: '0.2rem' }}>
            {l.gnd ? <StatusBadge label={l.gnd === 'GND-4' ? 'GND-4 · Investimento' : 'GND-3 · Custeio'} variant="neutral" size="sm" dot={false} /> : <StatusBadge label="GND a informar" variant="warning" size="sm" dot={false} />}
          </div>
        </>
      )
    },
    {
      key: 'vigencia',
      header: 'Vigência',
      nowrap: true,
      sortValue: ORDEM.vigencia.value,
      render: (l) => <VigenciaDaAta item={l} hoje={hoje} />
    },
    { key: 'alocado', header: 'Alocado à CAEP', align: 'right', nowrap: true, sortValue: ORDEM.alocado.value, sortFirstDir: 'desc', render: (l) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatNumber(l.alocado)}</span> },
    {
      key: 'reservado',
      header: 'Reservado',
      align: 'right',
      nowrap: true,
      sortValue: ORDEM.reservado.value,
      sortFirstDir: 'desc',
      render: (l) => (
        <>
          <div style={carteiraNumero}>{formatNumber(l.reservado)}</div>
          <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9', marginTop: 4, overflow: 'hidden', minWidth: 80 }} aria-hidden="true">
            <div style={{ height: '100%', width: `${l.alocado > 0 ? Math.min(100, (l.reservado / l.alocado) * 100) : 0}%`, background: 'var(--primary)' }} />
          </div>
        </>
      )
    },
    {
      key: 'saldo',
      header: 'Saldo',
      align: 'right',
      nowrap: true,
      sortValue: ORDEM.saldo.value,
      sortFirstDir: 'desc',
      render: (l) => <span style={{ ...carteiraValor, ...carteiraNumero, color: l.saldo <= 0 ? 'var(--text-muted)' : undefined }}>{formatNumber(l.saldo)}</span>
    },
    { key: 'valor', header: 'Valor previsto', align: 'right', nowrap: true, sortValue: ORDEM.valor.value, sortFirstDir: 'desc', render: (l) => <ValorPrevisto previsto={l.previsto} hoje={l.hoje} nota={l.nota} /> }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Itens e kits"
        subtitle="Quanto de cada item alocado à CAEP já foi reservado a parlamentares."
        hint="Reservado soma os pedidos que não foram cancelados, em qualquer etapa, com os kits abertos nos seus itens. Saldo = alocado à CAEP − reservado. O valor unitário é o previsto para a emenda, com o reajuste da ata (o mesmo do quadro do parlamentar); embaixo, o preço de hoje. Para ter mais de um item, peça a alocação ao gestor de saldo. Clique na linha para ver quem reservou e em quais kits o item entra."
        icon={<Boxes size={26} color="var(--primary)" aria-hidden="true" />}
        viewToggle={seletor}
        actions={<HeaderRefreshAction onRefresh={() => Promise.all([refetch(), recarregarPedidos()])} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-itens-atualizar" tooltipTitle="Recarregar os itens e os pedidos" />}
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-itens-situacao"
        ariaLabel="Saldo dos itens"
        active={segmento}
        onSelect={setSegmento}
        meta={valorAlocado > 0 ? `${formatCurrency(valorReservado)} reservados pelo preço previsto · ${formatCurrency(valorAlocado)} alocados pelo preço de hoje (atas vigentes)` : undefined}
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
          data={sorted}
          keyExtractor={(l) => l.itemKey}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          rowStyle={(l) => (l.ataEncerrada ? { opacity: 0.7 } : undefined)}
          columns={colunas}
          expandedKeys={abertos}
          onToggleExpand={alternar}
          rowActions={
            podeGerir
              ? (l) => <ActionButton action="editar" iconOnly label={`Nome curto e GND de ${l.nomeCurto ?? rotuloItemDaAta(l)}`} onClick={() => setEditando(l)} data-testid={`emendas-itens-dados-${l.itemKey}`} />
              : undefined
          }
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
                    { key: 'qtd', header: 'Quantidade', align: 'right', nowrap: true, render: (u) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatNumber(u.quantidade)}</span> }
                  ]}
                />
              )}
              {kitsDoItem(l.itemKey).length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={carteiraSubtitle}>Entra nos kits:</span>
                  {kitsDoItem(l.itemKey).map((k) =>
                    onAbrirKit ? (
                      <AppButton key={k.id} type="button" variant="link" size="sm" onClick={() => onAbrirKit(k.id)} data-testid={`emendas-item-abrir-kit-${k.id}`}>
                        {k.nome}
                      </AppButton>
                    ) : (
                      <span key={k.id} style={carteiraValor}>
                        {k.nome}
                      </span>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        />
      </AdminListShell>

      {editando && <DadosItemModal item={editando} onClose={() => setEditando(null)} />}
    </PageContainer>
  );
};
