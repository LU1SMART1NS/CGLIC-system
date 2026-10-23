import React, { useMemo, useState } from 'react';
import { UserSquare } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { HeaderRefreshAction } from '../../design-system/components/HeaderRefreshAction';
import { DataTable, type Column } from '../../design-system/components/DataTable';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { carteiraIdentificacao, carteiraSubtitle } from '../carteira/carteiraStyles';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useAutoresEmendas } from '../../hooks/useEmendas';
import type { AutorEmenda, TipoAutor } from '../../services/emendasService';

type Segmento = 'todos' | TipoAutor;

const POR_PAGINA = 50;
const ROTULO_TIPO: Record<TipoAutor, string> = { DEPUTADO: 'Deputado', SENADOR: 'Senador', BANCADA: 'Bancada' };
const chaveDaLinha = (a: AutorEmenda) => a.id;
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Opções de um filtro com a contagem de cada valor, em ordem alfabética. */
function opcoesContadas(valores: Array<string | null>): Array<{ value: string; label: string; count: number }> {
  const c = new Map<string, number>();
  for (const v of valores) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([value, count]) => ({ value, label: value, count }));
}

/**
 * Autores das emendas (migration 155). Deputados e senadores vêm da Câmara e do Senado toda segunda-feira, com a
 * legislatura inteira (quem saiu do cargo continua); bancadas são uma por UF. Ninguém cadastra à mão.
 */
export const EmendasAutoresPage: React.FC = () => {
  const { data: autores = [], isLoading, isFetching, isError, error, refetch } = useAutoresEmendas();
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [noCargo, setNoCargo] = useState('');
  const [uf, setUf] = useState('');
  const [partido, setPartido] = useState('');
  const [busca, setBusca] = useState('');

  const contagem = useMemo(() => {
    const c: Record<Segmento, number> = { todos: autores.length, DEPUTADO: 0, SENADOR: 0, BANCADA: 0 };
    for (const a of autores) c[a.tipo]++;
    return c;
  }, [autores]);

  const ultimaLeitura = useMemo(() => autores.reduce<string | null>((m, a) => (a.lidoEm && (!m || a.lidoEm > m) ? a.lidoEm : m), null), [autores]);
  const doSegmento = useMemo(() => autores.filter((a) => segmento === 'todos' || a.tipo === segmento), [autores, segmento]);
  const soBancadas = segmento === 'BANCADA';

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    return doSegmento
      .filter((a) => !noCargo || a.tipo === 'BANCADA' || (noCargo === 'sim' ? a.emExercicio === true : a.emExercicio === false))
      .filter((a) => !uf || a.uf === uf)
      .filter((a) => !partido || a.partido === partido)
      .filter((a) => !termo || semAcento(`${a.nome} ${a.nomeCivil ?? ''}`).includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [doSegmento, noCargo, uf, partido, busca]);

  const { currentPage, setPage, pageItems } = useCarteiraPagination(filtrados, chaveDaLinha, POR_PAGINA);
  const filtrosAtivos = Boolean(busca.trim() || noCargo || uf || partido);

  const colunas: Column<AutorEmenda>[] = [
    {
      key: 'nome',
      header: 'Autor',
      priority: 'primary',
      minWidth: '240px',
      // Só o nome parlamentar: a Câmara não manda o nome completo na lista (o Senado manda), então ele fica no título
      // e na busca, para todas as linhas lerem igual.
      render: (a) => (
        <span style={carteiraIdentificacao} title={a.nomeCivil && a.nomeCivil !== a.nome ? `Nome completo: ${a.nomeCivil}` : undefined}>
          {a.nome}
        </span>
      )
    },
    ...(segmento === 'todos' ? [{ key: 'tipo', header: 'Tipo', nowrap: true, render: (a: AutorEmenda) => ROTULO_TIPO[a.tipo] }] : []),
    ...(!soBancadas ? [{ key: 'partido', header: 'Partido', nowrap: true, render: (a: AutorEmenda) => a.partido ?? '—' }] : []),
    { key: 'uf', header: 'UF', nowrap: true, render: (a) => a.uf ?? '—' },
    ...(!soBancadas
      ? [
          {
            key: 'cargo',
            header: 'No cargo',
            nowrap: true,
            render: (a: AutorEmenda) =>
              a.tipo === 'BANCADA' ? (
                <span style={carteiraSubtitle}>—</span>
              ) : (
                <StatusBadge label={a.emExercicio ? 'Em exercício' : 'Fora do cargo'} variant={a.emExercicio ? 'success' : 'neutral'} size="sm" dot={false} />
              )
          }
        ]
      : [])
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Autores"
        subtitle="Deputados, senadores e bancadas que indicam emendas."
        hint="Deputados e senadores vêm da Câmara e do Senado toda segunda-feira, com a legislatura inteira: quem saiu do cargo continua no cadastro, porque os pedidos dele não somem. Bancadas são uma por UF. Kits ficam em Kits e órgãos que recebem o material em Beneficiários."
        icon={<UserSquare size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <HeaderRefreshAction
            onRefresh={() => refetch()}
            isRefreshing={isFetching}
            lastUpdated={ultimaLeitura}
            dataTestId="emendas-autores-atualizar"
            tooltipTitle="Recarregar a lista. A leitura da Câmara e do Senado é feita pelo servidor toda segunda-feira."
          />
        }
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-autores-tipo"
        ariaLabel="Tipo de autor"
        active={segmento}
        onSelect={(s) => {
          setSegmento(s);
          if (s === 'BANCADA') {
            setNoCargo('');
            setPartido('');
          }
        }}
        segments={[
          { id: 'DEPUTADO', label: 'Deputados', count: contagem.DEPUTADO },
          { id: 'SENADOR', label: 'Senadores', count: contagem.SENADOR },
          { id: 'BANCADA', label: 'Bancadas', count: contagem.BANCADA },
          { id: 'todos', label: 'Todos', count: contagem.todos }
        ]}
      />

      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar pelo nome parlamentar ou completo..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setNoCargo('');
          setUf('');
          setPartido('');
        }}
        counter={carteiraCounter(filtrados.length, doSegmento.length, filtrosAtivos, 'autor', 'autores')}
        testIdPrefix="emendas-autores"
      >
        {!soBancadas && (
          <CarteiraFilterButton
            label="No cargo"
            value={noCargo}
            emptyValue=""
            options={[
              { value: 'sim', label: 'Em exercício', count: doSegmento.filter((a) => a.emExercicio === true).length },
              { value: 'nao', label: 'Fora do cargo', count: doSegmento.filter((a) => a.emExercicio === false).length }
            ]}
            onChange={setNoCargo}
            testId="emendas-autores-filtro-cargo"
          />
        )}
        <CarteiraFilterButton label="UF" value={uf} emptyValue="" options={opcoesContadas(doSegmento.map((a) => a.uf))} onChange={setUf} testId="emendas-autores-filtro-uf" />
        {!soBancadas && (
          <CarteiraFilterButton label="Partido" value={partido} emptyValue="" options={opcoesContadas(doSegmento.map((a) => a.partido))} onChange={setPartido} testId="emendas-autores-filtro-partido" />
        )}
      </CarteiraFilterBar>

      <AdminListShell
        testId="emendas-autores-lista"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os autores"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os autores.'}
        onRetry={() => refetch()}
        isEmpty={!isLoading && filtrados.length === 0}
        emptyTitle={autores.length === 0 ? 'Nenhum autor lido ainda.' : 'Nenhum autor encontrado.'}
        emptyDescription={autores.length === 0 ? 'A primeira leitura da Câmara e do Senado acontece na segunda-feira.' : 'Ajuste a busca ou os filtros.'}
      >
        <DataTable<AutorEmenda>
          testId="emendas-autores-tabela"
          className="data-table-container--flush"
          data={pageItems}
          keyExtractor={chaveDaLinha}
          rowStyle={(a) => (a.emExercicio === false ? { opacity: 0.7 } : undefined)}
          columns={colunas}
        />
        <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={filtrados.length} onChange={setPage} testIdPrefix="emendas-autores" />
      </AdminListShell>
    </PageContainer>
  );
};
