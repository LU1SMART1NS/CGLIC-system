import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Network } from 'lucide-react';
import {
  ActionButton,
  AppSelect,
  DataTable,
  NoticeBar,
  PageContainer,
  PageHeader,
  useConfirmDialog,
  useToast,
  type Column
} from '../../design-system';
import { AdminListShell } from '../admin/shared/AdminListShell';
import { CarteiraSegmentTabs, type CarteiraSegment } from '../carteira/CarteiraSegmentTabs';
import { SELECIONADA_BG, SelecaoBar, useSelecaoFila } from '../atas/distribuicao/DistribuicaoSelecao';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { GtiTag } from '../gti/GtiVisual';
import { NomeComSigla } from './emendasPartes';
import { useBeneficiariosEmendas, useDefinirGruposBeneficiarios, useGruposBeneficiarios, usePedidosEmendas, usePodeGerirEmendas } from '../../hooks/useEmendas';
import { GRUPO_GTI_INFO, rotuloDoGrupo } from '../../config/gruposGti';
import {
  GRUPOS_BENEFICIARIO,
  ehGrupoBeneficiario,
  situacaoGrupoBeneficiario,
  sugerirGrupoBeneficiario,
  type GrupoBeneficiario,
  type SituacaoGrupoBeneficiario
} from '../../config/captacaoEmendas';
import { localDoBeneficiario, type BeneficiarioEmenda } from '../../services/emendasService';
import { linhasAtivas } from '../../utils/emendasPedidos';
import { formatDataHoraBR } from '../../utils/format';

type Situacao = SituacaoGrupoBeneficiario | 'TODOS';

interface Linha {
  b: BeneficiarioEmenda;
  grupo: GrupoBeneficiario | null;
  confirmadoPorNome: string | null;
  confirmadoEm: string | null;
  sugestao: GrupoBeneficiario | null;
  situacao: SituacaoGrupoBeneficiario;
  /** Linhas ativas dos pedidos em andamento com este beneficiário. */
  linhas: number;
}

const POR_PAGINA = 25;
const SITUACOES: readonly Situacao[] = ['A_CONFIRMAR', 'SEM_SUGESTAO', 'CONFIRMADOS', 'TODOS'];
const chaveDaLinha = (l: Linha) => l.b.id;
const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)' };
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Ajustes › Grupos dos beneficiários (migration 218): de qual conselho é cada beneficiário das emendas, base da coluna
 * Captação principal. O sistema sugere pelo nome, pela sigla e pela natureza jurídica; o gestor de emendas e o
 * coordenador confirmam ou corrigem. A consulta só lê.
 */
export const EmendasGruposBeneficiariosPage: React.FC = () => {
  const podeEditar = usePodeGerirEmendas();
  const toast = useToast();
  const confirm = useConfirmDialog();
  const beneficiarios = useBeneficiariosEmendas();
  const grupos = useGruposBeneficiarios();
  const pedidos = usePedidosEmendas();
  const definir = useDefinirGruposBeneficiarios();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramSituacao = searchParams.get('situacao');
  const situacao: Situacao = SITUACOES.find((s) => s === paramSituacao) ?? 'A_CONFIRMAR';
  const setSituacao = (s: Situacao) =>
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        if (s === 'A_CONFIRMAR') proximo.delete('situacao');
        else proximo.set('situacao', s);
        return proximo;
      },
      { replace: true }
    );
  const [busca, setBusca] = React.useState('');
  /** Grupo do filtro: o confirmado ou, sem confirmação, o sugerido. '' = todos. */
  const [filtroGrupo, setFiltroGrupo] = React.useState<string>('');
  const [salvando, setSalvando] = React.useState<string | null>(null);

  const linhasPorBeneficiario = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pedidos.data ?? []) {
      if (p.etapa === 'CANCELADO') continue;
      for (const l of linhasAtivas(p)) if (l.beneficiarioId) m.set(l.beneficiarioId, (m.get(l.beneficiarioId) ?? 0) + 1);
    }
    return m;
  }, [pedidos.data]);

  const linhas: Linha[] = React.useMemo(() => {
    const confirmados = new Map((grupos.data ?? []).map((g) => [g.beneficiarioId, g]));
    return (beneficiarios.data ?? [])
      .filter((b) => b.ativo)
      .map((b) => {
        const c = confirmados.get(b.id);
        const sugestao = sugerirGrupoBeneficiario(b);
        const grupo = c?.grupo ?? null;
        return {
          b,
          grupo,
          confirmadoPorNome: c?.confirmadoPorNome ?? null,
          confirmadoEm: c?.confirmadoEm ?? null,
          sugestao,
          situacao: situacaoGrupoBeneficiario(grupo, sugestao),
          linhas: linhasPorBeneficiario.get(b.id) ?? 0
        };
      })
      .sort((x, y) => y.linhas - x.linhas || x.b.nome.localeCompare(y.b.nome, 'pt-BR'));
  }, [beneficiarios.data, grupos.data, linhasPorBeneficiario]);

  const contagem = React.useMemo(() => {
    const c = { A_CONFIRMAR: 0, SEM_SUGESTAO: 0, CONFIRMADOS: 0, TODOS: linhas.length };
    for (const l of linhas) c[l.situacao]++;
    return c;
  }, [linhas]);

  const grupoParaFiltro = (l: Linha) => l.grupo ?? l.sugestao;
  const contagemPorGrupo = React.useMemo(() => {
    const c: Partial<Record<GrupoBeneficiario, number>> = {};
    for (const l of linhas) {
      const g = grupoParaFiltro(l);
      if (g && (situacao === 'TODOS' || l.situacao === situacao)) c[g] = (c[g] ?? 0) + 1;
    }
    return c;
  }, [linhas, situacao]);

  const totalDaAba = situacao === 'TODOS' ? linhas.length : contagem[situacao];

  const visiveis = React.useMemo(() => {
    const q = semAcento(busca.trim());
    return linhas.filter(
      (l) =>
        (situacao === 'TODOS' || l.situacao === situacao) &&
        (!filtroGrupo || grupoParaFiltro(l) === filtroGrupo) &&
        (!q || semAcento(`${l.b.nome} ${l.b.sigla ?? ''} ${l.b.razaoSocial ?? ''} ${l.b.entregaMunicipio ?? ''} ${l.b.entregaUf ?? ''}`).includes(q))
    );
  }, [linhas, situacao, busca, filtroGrupo]);

  const { currentPage, setPage, pageItems } = useCarteiraPagination(visiveis, chaveDaLinha, POR_PAGINA);

  // Seleção em lote (o mesmo padrão de Grupos das UASGs): só beneficiário com sugestão e ainda sem grupo.
  const selecionavel = (l: Linha) => podeEditar && !l.grupo && l.sugestao !== null;
  const chavesSelecionaveis = React.useMemo(() => visiveis.filter(selecionavel).map((l) => l.b.id), [visiveis, podeEditar]); // eslint-disable-line react-hooks/exhaustive-deps
  const selecao = useSelecaoFila(chavesSelecionaveis);
  const selecionadas = visiveis.filter((l) => selecao.selecionadas.has(l.b.id) && l.sugestao);
  const todasMarcadas = chavesSelecionaveis.length > 0 && chavesSelecionaveis.every((k) => selecao.selecionadas.has(k));
  const marcarTodasRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (marcarTodasRef.current) marcarTodasRef.current.indeterminate = selecao.selecionadas.size > 0 && !todasMarcadas;
  }, [selecao.selecionadas, todasMarcadas]);

  const escolher = async (l: Linha, valor: string) => {
    const grupo = ehGrupoBeneficiario(valor) ? valor : null;
    setSalvando(l.b.id);
    try {
      await definir.mutateAsync([{ beneficiarioId: l.b.id, grupo }]);
      toast.success(grupo ? `${l.b.nome}: ${GRUPO_GTI_INFO[grupo].rotulo} confirmado.` : `${l.b.nome} voltou para "a confirmar".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o grupo.');
    } finally {
      setSalvando(null);
    }
  };

  const confirmarSelecionadas = async () => {
    const lista = selecionadas;
    if (lista.length === 0) return;
    const porGrupo = new Map<GrupoBeneficiario, number>();
    for (const l of lista) if (l.sugestao) porGrupo.set(l.sugestao, (porGrupo.get(l.sugestao) ?? 0) + 1);
    const resumo = GRUPOS_BENEFICIARIO.filter((g) => porGrupo.has(g)).map((g) => `${GRUPO_GTI_INFO[g].rotulo} ${porGrupo.get(g)}`).join(' · ');
    const ok = await confirm({
      title: `Confirmar a sugestão de ${lista.length} ${lista.length === 1 ? 'beneficiário' : 'beneficiários'}?`,
      message: `Cada beneficiário selecionado fica com o grupo sugerido: ${resumo}. Dá para corrigir um a um depois.`,
      confirmLabel: 'Confirmar sugestões'
    });
    if (!ok) return;
    try {
      const n = await definir.mutateAsync(lista.map((l) => ({ beneficiarioId: l.b.id, grupo: l.sugestao })));
      selecao.limpar();
      toast.success(`${n} ${n === 1 ? 'grupo confirmado' : 'grupos confirmados'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível confirmar as sugestões.');
    }
  };

  const segmentos: Array<CarteiraSegment<Situacao>> = [
    { id: 'A_CONFIRMAR', label: 'A confirmar', count: contagem.A_CONFIRMAR, dot: 'var(--color-warning-solid)', title: 'O sistema sugeriu um grupo; falta confirmar' },
    { id: 'SEM_SUGESTAO', label: 'Sem sugestão', count: contagem.SEM_SUGESTAO, dot: 'var(--color-danger)', title: 'Nada no nome, na sigla nem na natureza jurídica indica o grupo' },
    { id: 'CONFIRMADOS', label: 'Confirmados', count: contagem.CONFIRMADOS, dot: 'var(--color-success)' },
    { id: 'TODOS', label: 'Todos', count: contagem.TODOS }
  ];

  const escolhaDoGrupo = (l: Linha) =>
    podeEditar ? (
      <AppSelect
        aria-label={`Grupo de ${l.b.nome}`}
        value={l.grupo ?? ''}
        disabled={salvando === l.b.id}
        onChange={(e) => void escolher(l, e.target.value)}
        data-testid={`grupo-beneficiario-${l.b.id}`}
      >
        {/* A sugestão fica embaixo da escolha (D7): o texto longo na opção alargava a coluna. */}
        <option value="">A confirmar</option>
        {GRUPOS_BENEFICIARIO.map((g) => (
          <option key={g} value={g}>
            {rotuloDoGrupo(g)}
          </option>
        ))}
      </AppSelect>
    ) : (
      <GtiTag grupo={l.grupo ?? 'A_CONFIRMAR'} />
    );

  const columns: Column<Linha>[] = [
    ...(podeEditar
      ? [
          {
            key: 'selecionar',
            header: '',
            width: '36px',
            mobileLabel: 'Selecionar',
            render: (l: Linha) =>
              selecionavel(l) ? (
                <input
                  type="checkbox"
                  checked={selecao.selecionadas.has(l.b.id)}
                  onChange={() => selecao.alternar(l.b.id)}
                  aria-label={`Selecionar ${l.b.nome}`}
                  data-testid={`selecionar-beneficiario-${l.b.id}`}
                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
              ) : null
          } as Column<Linha>
        ]
      : []),
    {
      key: 'beneficiario',
      header: 'Beneficiário',
      priority: 'primary',
      minWidth: '280px',
      render: (l) => (
        <>
          <NomeComSigla b={l.b} />
          <div style={pequeno}>{l.b.razaoSocial ?? 'Sem CNPJ'}</div>
          {/* Entrega embaixo do nome (D7 da revisão das tabelas, 30/10/2026). */}
          {localDoBeneficiario(l.b) && <div style={pequeno}>Entrega em {localDoBeneficiario(l.b)}</div>}
        </>
      )
    },
    {
      key: 'linhas',
      header: 'Itens',
      align: 'right',
      render: (l) => <span style={{ fontVariantNumeric: 'tabular-nums' }} title="Itens dos pedidos em andamento com este beneficiário">{l.linhas}</span>
    },
    {
      // Sugestão e quem confirmou embaixo da escolha do grupo (D7).
      key: 'grupo',
      header: 'Grupo',
      minWidth: '220px',
      render: (l) => (
        <>
          {escolhaDoGrupo(l)}
          <div style={{ ...pequeno, marginTop: '0.25rem' }} data-testid={`grupo-beneficiario-origem-${l.b.id}`}>
            {l.grupo
              ? `confirmado por ${l.confirmadoPorNome ?? '—'}${l.confirmadoEm ? ` em ${formatDataHoraBR(l.confirmadoEm)}` : ''}`
              : l.sugestao
                ? <>sugestão: <GtiTag grupo={l.sugestao} /></>
                : 'sem sugestão'}
          </div>
        </>
      )
    }
  ];

  const carregando = beneficiarios.isLoading || grupos.isLoading;
  const erro = beneficiarios.error ?? grupos.error;

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Grupos dos beneficiários"
        subtitle="De qual conselho é cada beneficiário das emendas: base da coluna Captação principal."
        icon={<Network size={20} />}
        hint="O sistema sugere pelo nome, pela sigla e pela natureza jurídica da Receita. Guardas e secretarias municipais de segurança são do CNGM; PMDF, PCDF e CBMDF ficam no conselho da força; Polícia Penal fica em Outros. Só o grupo confirmado entra na captação."
      />

      {grupos.data === null ? (
        <NoticeBar tone="warning" testId="grupos-beneficiarios-sem-migration">
          O banco ainda não tem os grupos dos beneficiários (migration 218). A tela funciona depois que ela for aplicada.
        </NoticeBar>
      ) : (
        <>
          <CarteiraSegmentTabs
            segments={segmentos}
            active={situacao}
            onSelect={setSituacao}
            testIdPrefix="grupos-beneficiarios"
            ariaLabel="Situação do grupo"
            meta={`${contagem.TODOS} beneficiários ativos`}
          />

          <CarteiraFilterBar
            busca={busca}
            searchPlaceholder="Buscar por nome, sigla, razão social ou cidade..."
            onChangeBusca={setBusca}
            hasActiveFilters={Boolean(busca.trim() || filtroGrupo)}
            onResetFilters={() => {
              setBusca('');
              setFiltroGrupo('');
            }}
            counter={carteiraCounter(visiveis.length, totalDaAba, Boolean(busca.trim() || filtroGrupo), 'beneficiário', 'beneficiários')}
            testIdPrefix="grupos-beneficiarios"
          >
            <CarteiraFilterButton
              label="Grupo"
              value={filtroGrupo}
              emptyValue=""
              options={GRUPOS_BENEFICIARIO.map((g) => ({ value: g, label: rotuloDoGrupo(g), count: contagemPorGrupo[g] ?? 0 }))}
              onChange={setFiltroGrupo}
              testId="grupos-beneficiarios-filtro-grupo"
            />
          </CarteiraFilterBar>

          {selecionadas.length > 0 && (
            <SelecaoBar
              quantidade={selecionadas.length}
              singular="beneficiário"
              plural="beneficiários"
              totalFiltrado={chavesSelecionaveis.length}
              onSelecionarTodas={() => selecao.selecionarTodas(chavesSelecionaveis)}
              onLimpar={selecao.limpar}
              acao={
                <ActionButton
                  action="aplicarSugestao"
                  size="sm"
                  label={`Confirmar ${selecionadas.length === 1 ? 'a sugestão' : 'as sugestões'}`}
                  onClick={() => void confirmarSelecionadas()}
                  isLoading={definir.isPending && salvando === null}
                  data-testid="confirmar-selecionados"
                />
              }
              testIdPrefix="grupos-beneficiarios"
            />
          )}

          <AdminListShell
            stripActions={
              chavesSelecionaveis.length > 0 ? (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
                  <input
                    ref={marcarTodasRef}
                    type="checkbox"
                    checked={todasMarcadas}
                    onChange={() => selecao.alternarVarias(chavesSelecionaveis)}
                    data-testid="marcar-todas-sugestoes"
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }}
                  />
                  Marcar os {chavesSelecionaveis.length} com sugestão
                </label>
              ) : undefined
            }
            isLoading={carregando}
            isError={Boolean(erro)}
            errorMessage={erro instanceof Error ? erro.message : undefined}
            onRetry={() => {
              void beneficiarios.refetch();
              void grupos.refetch();
            }}
            isEmpty={!carregando && visiveis.length === 0}
            emptyTitle={situacao === 'A_CONFIRMAR' && !busca ? 'Nenhum beneficiário com sugestão a confirmar.' : 'Nenhum beneficiário nesta lista.'}
            testId="grupos-beneficiarios-lista"
          >
            <DataTable
              columns={columns}
              data={pageItems}
              keyExtractor={(l) => l.b.id}
              rowStyle={(l) => (selecao.selecionadas.has(l.b.id) ? { background: SELECIONADA_BG } : undefined)}
              testId="grupos-beneficiarios-tabela"
              className="data-table-container--flush"
            />
            <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={visiveis.length} onChange={setPage} testIdPrefix="grupos-beneficiarios" />
          </AdminListShell>
        </>
      )}
    </PageContainer>
  );
};
