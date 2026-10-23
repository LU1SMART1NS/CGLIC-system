import React, { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { carteiraSubtitle } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useAutoresEmendas, useBeneficiariosEmendas, useItensCaep, usePedidosEmendas } from '../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../utils/format';
import { identificacaoDoPedido, linhasAtivas, ROTULO_ETAPA, valorDaLinha, valorDoPedido } from '../../utils/emendasPedidos';
import type { AutorEmenda, PedidoEmenda, TipoAutor } from '../../services/emendasService';
import { AutorDoPedido, LinhaDoPedido } from './emendasPartes';

type Segmento = 'todos' | TipoAutor;
interface Linha {
  autorId: string;
  autor: AutorEmenda | undefined;
  pedidos: PedidoEmenda[];
  kits: number;
  valor: number;
  empenhado: number;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O que cada parlamentar ou bancada tem com a CAEP, somando os pedidos não cancelados (migration 157). */
export const EmendasPorAutorPage: React.FC = () => {
  const { data: pedidos = [], isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = usePedidosEmendas();
  const { data: itensLista = [] } = useItensCaep();
  const { data: autores = [] } = useAutoresEmendas();
  const { data: beneficiariosLista = [] } = useBeneficiariosEmendas();
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [uf, setUf] = useState('');
  const [busca, setBusca] = useState('');

  const itens = useMemo(() => new Map(itensLista.map((i) => [i.itemKey, i])), [itensLista]);
  const autorPorId = useMemo(() => new Map(autores.map((a) => [a.id, a])), [autores]);
  const beneficiarios = useMemo(() => new Map(beneficiariosLista.map((b) => [b.id, b])), [beneficiariosLista]);

  const linhas: Linha[] = useMemo(() => {
    const m = new Map<string, Linha>();
    for (const p of pedidos) {
      if (p.etapa === 'CANCELADO') continue;
      const l = m.get(p.autorId) ?? { autorId: p.autorId, autor: autorPorId.get(p.autorId), pedidos: [], kits: 0, valor: 0, empenhado: 0 };
      const v = valorDoPedido(p, itens);
      l.pedidos.push(p);
      l.valor += v;
      if (p.etapa === 'EMPENHADO') l.empenhado += v;
      l.kits += linhasAtivas(p).filter((x) => x.tipo === 'KIT').reduce((s, x) => s + x.quantidade, 0);
      m.set(p.autorId, l);
    }
    return [...m.values()].sort((a, b) => b.valor - a.valor);
  }, [pedidos, autorPorId, itens]);

  const contagem = useMemo(() => {
    const c: Record<Segmento, number> = { todos: linhas.length, DEPUTADO: 0, SENADOR: 0, BANCADA: 0 };
    for (const l of linhas) if (l.autor) c[l.autor.tipo]++;
    return c;
  }, [linhas]);
  const doSegmento = linhas.filter((l) => segmento === 'todos' || l.autor?.tipo === segmento);
  const termo = semAcento(busca.trim());
  const filtradas = doSegmento.filter((l) => (!uf || l.autor?.uf === uf) && (!termo || semAcento(`${l.autor?.nome ?? ''} ${l.autor?.partido ?? ''}`).includes(termo)));
  const ufs = [...new Set(doSegmento.map((l) => l.autor?.uf).filter((x): x is string => Boolean(x)))].sort().map((v) => ({ value: v, label: v, count: doSegmento.filter((l) => l.autor?.uf === v).length }));
  const filtrosAtivos = Boolean(termo || uf);

  const colunas: Column<Linha>[] = [
    { key: 'autor', header: 'Autor', priority: 'primary', minWidth: '220px', render: (l) => <AutorDoPedido autor={l.autor} autorId={l.autorId} /> },
    { key: 'pedidos', header: 'Pedidos', align: 'right', nowrap: true, render: (l) => formatNumber(l.pedidos.length) },
    { key: 'kits', header: 'Kits', align: 'right', nowrap: true, render: (l) => (l.kits ? formatNumber(l.kits) : <span style={carteiraSubtitle}>—</span>) },
    { key: 'valor', header: 'Valor reservado', align: 'right', nowrap: true, render: (l) => <b>{formatCurrency(l.valor)}</b> },
    { key: 'empenhado', header: 'Já empenhado', align: 'right', nowrap: true, render: (l) => (l.empenhado ? formatCurrency(l.empenhado) : <span style={carteiraSubtitle}>—</span>) }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Por autor"
        subtitle="O que cada parlamentar ou bancada tem com a CAEP."
        hint="Soma os pedidos que não foram cancelados, pelo preço das atas. Já empenhado = pedidos que chegaram ao empenho."
        icon={<Users size={26} color="var(--primary)" aria-hidden="true" />}
        actions={<HeaderRefreshAction onRefresh={() => refetch()} isRefreshing={isFetching} lastUpdated={dataUpdatedAt || null} dataTestId="emendas-por-autor-atualizar" tooltipTitle="Recarregar os pedidos" />}
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-por-autor-tipo"
        ariaLabel="Tipo de autor"
        active={segmento}
        onSelect={setSegmento}
        segments={[
          { id: 'DEPUTADO', label: 'Deputados', count: contagem.DEPUTADO },
          { id: 'SENADOR', label: 'Senadores', count: contagem.SENADOR },
          { id: 'BANCADA', label: 'Bancadas', count: contagem.BANCADA },
          { id: 'todos', label: 'Todos', count: contagem.todos }
        ]}
      />

      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pelo nome ou partido..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setUf('');
        }}
        counter={carteiraCounter(filtradas.length, doSegmento.length, filtrosAtivos, 'autor', 'autores')}
        testIdPrefix="emendas-por-autor"
      >
        <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={ufs} onChange={setUf} testId="emendas-por-autor-filtro-uf" />
      </CarteiraFilterBar>

      <AdminListShell
        testId="emendas-por-autor-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os pedidos"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os pedidos.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && filtradas.length === 0}
        emptyTitle={linhas.length === 0 ? 'Nenhum autor com pedido ainda.' : 'Nenhum autor encontrado.'}
        emptyDescription={linhas.length === 0 ? 'Os autores aparecem aqui a partir da primeira reserva.' : 'Ajuste a busca ou os filtros.'}
      >
        <DataTable<Linha>
          testId="emendas-por-autor-tabela"
          className="data-table-container--flush"
          data={filtradas}
          keyExtractor={(l) => l.autorId}
          columns={colunas}
          renderExpanded={(l) => (
            <div style={{ padding: '0.4rem 0' }} data-testid={`emendas-por-autor-detalhe-${l.autorId}`}>
              <DataTable
                testId={`emendas-por-autor-linhas-${l.autorId}`}
                className="emendas-tabela-topo"
                data={l.pedidos.flatMap((p) => linhasAtivas(p).map((x) => ({ p, x })))}
                keyExtractor={(r) => r.x.id}
                columns={[
                  {
                    key: 'pedido',
                    header: 'Reserva / ofício',
                    nowrap: true,
                    render: (r) => (
                      <>
                        <div style={{ fontWeight: 600 }}>{identificacaoDoPedido(r.p)}</div>
                        {r.p.oficioProcessoSei && <div style={carteiraSubtitle}>SEI {r.p.oficioProcessoSei}</div>}
                      </>
                    )
                  },
                  { key: 'linha', header: 'Item ou kit', priority: 'primary', minWidth: '240px', render: (r) => <LinhaDoPedido linha={r.x} itens={itens} /> },
                  {
                    key: 'ben',
                    header: 'Beneficiário',
                    render: (r) => {
                      const b = r.x.beneficiarioId ? beneficiarios.get(r.x.beneficiarioId) : undefined;
                      return b ? `${b.nomeCurto} (${b.entregaUf})` : <StatusBadge label="A informar" variant="warning" size="sm" dot={false} />;
                    }
                  },
                  { key: 'valor', header: 'Valor', align: 'right', nowrap: true, render: (r) => formatCurrency(valorDaLinha(r.x, itens)) },
                  { key: 'etapa', header: 'Etapa', nowrap: true, render: (r) => ROTULO_ETAPA[r.p.etapa] }
                ]}
              />
            </div>
          )}
        />
      </AdminListShell>
    </PageContainer>
  );
};
