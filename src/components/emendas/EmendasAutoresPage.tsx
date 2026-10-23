import React, { useMemo, useState } from 'react';
import { UserSquare } from 'lucide-react';
import { PageContainer } from '../../design-system/components/PageContainer';
import { PageHeader } from '../../design-system/components/PageHeader';
import { DataTable } from '../../design-system/components/DataTable';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { AppSelect } from '../../design-system/components/FormFields';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { CarteiraSegmentTabs } from '../carteira/CarteiraSegmentTabs';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { useAutoresEmendas } from '../../hooks/useEmendas';
import { formatDataHoraBR } from '../../utils/format';
import type { AutorEmenda, TipoAutor } from '../../services/emendasService';

type Segmento = 'todos' | TipoAutor;
type NoCargo = 'todos' | 'sim' | 'nao';

const ROTULO_TIPO: Record<TipoAutor, string> = { DEPUTADO: 'Deputado', SENADOR: 'Senador', BANCADA: 'Bancada' };
const ORIGEM: Record<TipoAutor, string> = { DEPUTADO: 'Câmara', SENADOR: 'Senado', BANCADA: 'Uma por UF' };

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Autores das emendas (migration 155). Deputados e senadores vêm da Câmara e do Senado toda segunda-feira, com a
 * legislatura inteira (quem saiu do cargo continua); bancadas são uma por UF. Ninguém cadastra à mão.
 */
export const EmendasAutoresPage: React.FC = () => {
  const { data: autores = [], isLoading, isError, error, refetch } = useAutoresEmendas();
  const [segmento, setSegmento] = useState<Segmento>('todos');
  const [noCargo, setNoCargo] = useState<NoCargo>('todos');
  const [busca, setBusca] = useState('');

  const contagem = useMemo(() => {
    const c: Record<Segmento, number> = { todos: autores.length, DEPUTADO: 0, SENADOR: 0, BANCADA: 0 };
    for (const a of autores) c[a.tipo]++;
    return c;
  }, [autores]);

  const ultimaLeitura = useMemo(() => autores.reduce<string | null>((m, a) => (a.lidoEm && (!m || a.lidoEm > m) ? a.lidoEm : m), null), [autores]);

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    return autores
      .filter((a) => segmento === 'todos' || a.tipo === segmento)
      .filter((a) => noCargo === 'todos' || a.tipo === 'BANCADA' || (noCargo === 'sim' ? a.emExercicio === true : a.emExercicio === false))
      .filter((a) => !termo || semAcento(`${a.nome} ${a.nomeCivil ?? ''} ${a.partido ?? ''} ${a.uf ?? ''}`).includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [autores, segmento, noCargo, busca]);

  const filtrosAtivos = Boolean(busca) || segmento !== 'todos' || noCargo !== 'todos';

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Autores"
        subtitle={
          ultimaLeitura
            ? `Deputados e senadores lidos da Câmara e do Senado em ${formatDataHoraBR(ultimaLeitura)}; a leitura se repete sozinha toda segunda-feira.`
            : 'Deputados e senadores vêm da Câmara e do Senado toda segunda-feira; bancadas são uma por UF.'
        }
        hint="Entra a legislatura inteira: quem saiu do cargo continua no cadastro, porque os pedidos dele não somem. Kits e órgãos não são autores: ficam em Kits e em Beneficiários."
        icon={<UserSquare size={26} color="var(--primary)" aria-hidden="true" />}
      />

      <CarteiraSegmentTabs<Segmento>
        testIdPrefix="emendas-autores-tipo"
        ariaLabel="Tipo de autor"
        active={segmento}
        onSelect={setSegmento}
        segments={[
          { id: 'todos', label: 'Todos', count: contagem.todos },
          { id: 'DEPUTADO', label: 'Deputados', count: contagem.DEPUTADO },
          { id: 'SENADOR', label: 'Senadores', count: contagem.SENADOR },
          { id: 'BANCADA', label: 'Bancadas', count: contagem.BANCADA }
        ]}
      />

      <CarteiraFilterBar
        busca={busca}
        searchPlaceholder="Buscar por nome, partido ou UF..."
        onChangeBusca={setBusca}
        hasActiveFilters={filtrosAtivos}
        onResetFilters={() => {
          setBusca('');
          setSegmento('todos');
          setNoCargo('todos');
        }}
        counter={carteiraCounter(filtrados.length, autores.length, filtrosAtivos, 'autor', 'autores')}
        testIdPrefix="emendas-autores"
      >
        <AppSelect aria-label="No cargo" value={noCargo} onChange={(e) => setNoCargo(e.target.value as NoCargo)} data-testid="emendas-autores-no-cargo">
          <option value="todos">No cargo: todos</option>
          <option value="sim">Em exercício</option>
          <option value="nao">Fora do cargo</option>
        </AppSelect>
      </CarteiraFilterBar>

      <AdminListShell
        testId="emendas-autores-lista"
        title="Autores das emendas"
        isLoading={isLoading}
        isError={isError}
        errorTitle="Não foi possível carregar os autores"
        errorMessage={(error as Error | null)?.message || 'Falha ao consultar os autores.'}
        onRetry={() => refetch()}
        isEmpty={filtrados.length === 0}
        emptyTitle={autores.length === 0 ? 'Nenhum autor lido ainda.' : 'Nenhum autor encontrado.'}
        emptyDescription={autores.length === 0 ? 'A primeira leitura da Câmara e do Senado acontece na segunda-feira.' : 'Ajuste a busca ou os filtros.'}
      >
        <DataTable<AutorEmenda>
          testId="emendas-autores-tabela"
          className="data-table-container--flush"
          data={filtrados}
          keyExtractor={(a) => a.id}
          rowStyle={(a) => (a.emExercicio === false ? { opacity: 0.75 } : undefined)}
          columns={[
            {
              key: 'nome',
              header: 'Autor',
              priority: 'primary',
              sortValue: (a) => a.nome,
              render: (a) => (
                <div>
                  <div style={{ fontWeight: 700 }}>{a.nome}</div>
                  {a.nomeCivil && a.nomeCivil !== a.nome && <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{a.nomeCivil}</div>}
                </div>
              )
            },
            { key: 'tipo', header: 'Tipo', width: '120px', sortValue: (a) => a.tipo, render: (a) => ROTULO_TIPO[a.tipo] },
            { key: 'partido', header: 'Partido · UF', width: '150px', sortValue: (a) => `${a.uf ?? ''}${a.partido ?? ''}`, render: (a) => [a.partido, a.uf].filter(Boolean).join(' · ') || '—' },
            {
              key: 'cargo',
              header: 'No cargo',
              width: '150px',
              sortValue: (a) => (a.emExercicio ? 1 : 0),
              render: (a) =>
                a.tipo === 'BANCADA' ? (
                  '—'
                ) : (
                  <StatusBadge label={a.emExercicio ? 'Em exercício' : 'Fora do cargo'} variant={a.emExercicio ? 'success' : 'neutral'} size="sm" dot={false} />
                )
            },
            { key: 'origem', header: 'Origem', width: '130px', render: (a) => ORIGEM[a.tipo] }
          ]}
        />
      </AdminListShell>
    </PageContainer>
  );
};
