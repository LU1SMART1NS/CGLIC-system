import React, { useMemo, useState } from 'react';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { useCarteiraSort, type CarteiraSortColumn } from '../carteira/useCarteiraSort';
import { carteiraDetalhe, carteiraNumero, carteiraValor } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { formatCurrency, formatNumber } from '../../utils/format';
import { AUTOR_A_DEFINIR, jaEmpenhado, linhasAtivas, valorDoPedido } from '../../utils/emendasPedidos';
import type { AutorEmenda, ItemCaep, PedidoEmenda, TipoAutor } from '../../services/emendasService';
import { AutorDoPedido } from './emendasPartes';

/** Chave do filtro de autor para as reservas sem parlamentar (migration 163). */
export const AUTOR_A_DEFINIR_CHAVE = 'a-definir';

interface Linha {
  autorId: string | null;
  autor: AutorEmenda | undefined;
  pedidos: number;
  kits: number;
  valor: number;
  empenhado: number;
}

const TIPOS: Array<{ value: TipoAutor; label: string }> = [
  { value: 'DEPUTADO', label: 'Deputados' },
  { value: 'SENADOR', label: 'Senadores' },
  { value: 'BANCADA', label: 'Bancadas' }
];

const POR_PAGINA = 25;
const chaveDaLinha = (l: Linha) => l.autorId ?? AUTOR_A_DEFINIR_CHAVE;
// Ordenação pelo cabeçalho, como nas carteiras (?ordem=); sem escolha, quem tem mais valor primeiro.
const ORDEM: Record<string, CarteiraSortColumn<Linha>> = {
  autor: { value: (l) => (l.autorId ? l.autor?.nome ?? l.autorId : null) },
  pedidos: { value: (l) => l.pedidos, firstDir: 'desc' },
  kits: { value: (l) => l.kits, firstDir: 'desc' },
  valor: { value: (l) => l.valor, firstDir: 'desc' },
  empenhado: { value: (l) => l.empenhado, firstDir: 'desc' }
};
const vazio = <span style={{ ...carteiraDetalhe, marginTop: 0 }}>—</span>;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Props {
  /** Pedidos da fase escolhida no trilho de Pedidos ("Todos" já vem sem os cancelados). */
  pedidos: PedidoEmenda[];
  /** Etapa escolhida: fora de "Todos" a coluna "Já empenhado" não faz sentido. */
  todasAsEtapas: boolean;
  autores: AutorEmenda[];
  itens: Map<string, ItemCaep>;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  onRetry: () => void;
  /** Clique no autor: a lista Por pedido filtrada por ele. */
  onAbrirAutor: (chave: string) => void;
}

/**
 * Pedidos › Ver por autor: o que cada parlamentar ou bancada tem com a CAEP na fase escolhida (substitui a antiga aba
 * Por autor). O filtro "Mostrar" traz também quem não tem pedido (cadastro da Câmara e do Senado, migration 155).
 */
export const PedidosPorAutor: React.FC<Props> = ({ pedidos, todasAsEtapas, autores, itens, isLoading, isError, errorMessage, onRetry, onAbrirAutor }) => {
  const [tipo, setTipo] = useState('');
  const [uf, setUf] = useState('');
  const [mostrar, setMostrar] = useState('');
  const [busca, setBusca] = useState('');

  const autorPorId = useMemo(() => new Map(autores.map((a) => [a.id, a])), [autores]);

  const linhas: Linha[] = useMemo(() => {
    const m = new Map<string, Linha>();
    for (const p of pedidos) {
      // Reservas para órgãos (sem parlamentar ainda, migration 163) ficam juntas numa linha "Parlamentar a definir".
      const chave = p.autorId ?? '';
      const l = m.get(chave) ?? { autorId: p.autorId, autor: p.autorId ? autorPorId.get(p.autorId) : undefined, pedidos: 0, kits: 0, valor: 0, empenhado: 0 };
      const v = valorDoPedido(p, itens);
      l.pedidos++;
      l.valor += v;
      if (jaEmpenhado(p.etapa)) l.empenhado += v;
      l.kits += linhasAtivas(p).filter((x) => x.tipo === 'KIT').reduce((s, x) => s + x.quantidade, 0);
      m.set(chave, l);
    }
    if (mostrar === 'todos') {
      for (const a of autores) if (!m.has(a.id)) m.set(a.id, { autorId: a.id, autor: a, pedidos: 0, kits: 0, valor: 0, empenhado: 0 });
    }
    // Sem pedido vem depois, em ordem alfabética.
    return [...m.values()].sort((a, b) => b.valor - a.valor || (a.autor?.nome ?? '').localeCompare(b.autor?.nome ?? '', 'pt-BR'));
  }, [pedidos, autorPorId, itens, autores, mostrar]);
  const semPedido = useMemo(() => {
    const com = new Set(pedidos.map((p) => p.autorId));
    return autores.filter((a) => !com.has(a.id)).length;
  }, [pedidos, autores]);

  const doTipo = linhas.filter((l) => !tipo || l.autor?.tipo === tipo);
  const termo = semAcento(busca.trim());
  const filtradas = doTipo.filter((l) => (!uf || l.autor?.uf === uf) && (!termo || semAcento(`${l.autorId ? l.autor?.nome ?? '' : AUTOR_A_DEFINIR} ${l.autor?.partido ?? ''}`).includes(termo)));
  const ufs = [...new Set(doTipo.map((l) => l.autor?.uf).filter((x): x is string => Boolean(x)))].sort().map((v) => ({ value: v, label: v, count: doTipo.filter((l) => l.autor?.uf === v).length }));
  const filtrosAtivos = Boolean(termo || tipo || uf || mostrar);
  const { sorted, sortKey, sortDir, toggle } = useCarteiraSort(filtradas, ORDEM);
  const { currentPage, setPage, pageItems } = useCarteiraPagination(sorted, chaveDaLinha, POR_PAGINA);

  const colunas: Column<Linha>[] = [
    { key: 'autor', header: 'Autor', priority: 'primary', minWidth: '220px', sortValue: ORDEM.autor.value, render: (l) => <AutorDoPedido autor={l.autor} autorId={l.autorId} destaque /> },
    { key: 'pedidos', header: 'Pedidos', align: 'right', nowrap: true, sortValue: ORDEM.pedidos.value, sortFirstDir: 'desc', render: (l) => <span style={carteiraNumero}>{formatNumber(l.pedidos)}</span> },
    { key: 'kits', header: 'Kits', align: 'right', nowrap: true, sortValue: ORDEM.kits.value, sortFirstDir: 'desc', render: (l) => (l.kits ? <span style={carteiraNumero}>{formatNumber(l.kits)}</span> : vazio) },
    {
      key: 'valor',
      header: todasAsEtapas ? 'Valor reservado' : 'Valor nesta fase',
      align: 'right',
      nowrap: true,
      sortValue: ORDEM.valor.value,
      sortFirstDir: 'desc',
      render: (l) => <span style={{ ...carteiraValor, ...carteiraNumero }}>{formatCurrency(l.valor)}</span>
    },
    ...(todasAsEtapas
      ? [
          {
            key: 'empenhado',
            header: 'Já empenhado',
            align: 'right',
            nowrap: true,
            sortValue: ORDEM.empenhado.value,
            sortFirstDir: 'desc',
            render: (l: Linha) => (l.empenhado ? <span style={carteiraNumero}>{formatCurrency(l.empenhado)}</span> : vazio)
          } satisfies Column<Linha>
        ]
      : [])
  ];

  return (
    <>
      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pelo nome ou partido..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setTipo('');
          setUf('');
          setMostrar('');
        }}
        counter={carteiraCounter(filtradas.length, linhas.length, filtrosAtivos, 'autor', 'autores')}
        testIdPrefix="emendas-por-autor"
      >
        <CarteiraFilterButton
          label="Tipo"
          value={tipo}
          emptyValue=""
          options={TIPOS.map((t) => ({ ...t, count: linhas.filter((l) => l.autor?.tipo === t.value).length }))}
          onChange={setTipo}
          testId="emendas-por-autor-filtro-tipo"
        />
        <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={ufs} onChange={setUf} testId="emendas-por-autor-filtro-uf" />
        <CarteiraFilterButton
          label="Mostrar"
          value={mostrar}
          emptyValue=""
          options={[{ value: 'todos', label: 'Também quem não tem pedido', count: semPedido }]}
          onChange={setMostrar}
          testId="emendas-por-autor-filtro-mostrar"
        />
      </CarteiraFilterBar>

      <AdminListShell
        testId="emendas-por-autor-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os pedidos"
        errorMessage={errorMessage}
        onRetry={onRetry}
        isEmpty={!isLoading && filtradas.length === 0}
        emptyTitle={linhas.length === 0 ? 'Nenhum autor com pedido nesta fase.' : 'Nenhum autor encontrado.'}
        emptyDescription={linhas.length === 0 ? 'Escolha outra fase ou use "Mostrar" para ver também quem não tem pedido.' : 'Ajuste a busca ou os filtros.'}
      >
        <DataTable<Linha>
          testId="emendas-por-autor-tabela"
          className="data-table-container--flush"
          data={pageItems}
          keyExtractor={chaveDaLinha}
          sort={{ key: sortKey, dir: sortDir }}
          onSort={toggle}
          columns={colunas}
          rowOpen={(l) => (l.pedidos > 0 ? () => onAbrirAutor(l.autorId ?? AUTOR_A_DEFINIR_CHAVE) : null)}
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={sorted.length} onChange={setPage} testIdPrefix="emendas-por-autor" />
      </AdminListShell>
    </>
  );
};
