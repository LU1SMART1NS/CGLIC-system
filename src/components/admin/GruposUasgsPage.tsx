import React from 'react';
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
import { AdminListShell } from './shared/AdminListShell';
import { CarteiraSegmentTabs, type CarteiraSegment } from '../carteira/CarteiraSegmentTabs';
import { SELECIONADA_BG, SelecaoBar, useSelecaoFila } from '../atas/distribuicao/DistribuicaoSelecao';
import { CarteiraPagination } from '../carteira/CarteiraPagination';
import { CarteiraFilterButton } from '../carteira/CarteiraFilterButton';
import { CarteiraFilterBar, carteiraCounter } from '../carteira/CarteiraFilterBar';
import { useCarteiraPagination } from '../carteira/useCarteiraPagination';
import { GtiTag } from '../gti/GtiVisual';
import { useAuth } from '../../context/AuthContext';
import { useDefinirGruposUasgs, useUasgsParticipantesGti } from '../../hooks/useGruposGti';
import { GRUPO_GTI_INFO, GRUPOS_CONFIRMAVEIS, sugerirGrupoGti, type GrupoConfirmavel } from '../../config/gruposGti';
import { localDaUasg } from '../../services/cadastroUasgsSyncService';
import type { UasgParticipanteGti } from '../../services/gruposGtiService';
import { formatDataHoraBR } from '../../utils/format';

type Situacao = 'A_CONFIRMAR' | 'SEM_SUGESTAO' | 'CONFIRMADAS' | 'TODAS';

interface Linha extends UasgParticipanteGti {
  sugestao: GrupoConfirmavel | null;
  situacao: Exclude<Situacao, 'TODAS'>;
}

const POR_PAGINA = 25;
const chaveDaLinha = (l: { uasg: string }) => l.uasg;
const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)' };
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Ajustes › Grupos das UASGs (migration 139): de qual GTI é cada órgão participante das atas. O sistema sugere
 * pelo nome da UASG e pela sigla do órgão; o coordenador confirma ou corrige. Os outros perfis só consultam.
 */
export const GruposUasgsPage: React.FC = () => {
  const { role } = useAuth();
  const podeEditar = role === 'admin';
  const toast = useToast();
  const confirm = useConfirmDialog();
  const consulta = useUasgsParticipantesGti();
  const definir = useDefinirGruposUasgs();
  const [situacao, setSituacao] = React.useState<Situacao>('A_CONFIRMAR');
  const [busca, setBusca] = React.useState('');
  /** GTI do filtro: o grupo confirmado ou, sem confirmação, o sugerido. '' = todos. */
  const [filtroGrupo, setFiltroGrupo] = React.useState<string>('');
  const [salvando, setSalvando] = React.useState<string | null>(null);

  const linhas: Linha[] = React.useMemo(
    () =>
      (consulta.data ?? []).map((u) => {
        const sugestao = sugerirGrupoGti(u.nome ?? u.nomeNaAta, u.siglaOrgao, u.esferaOrgao);
        return { ...u, sugestao, situacao: u.grupo ? 'CONFIRMADAS' : sugestao ? 'A_CONFIRMAR' : 'SEM_SUGESTAO' };
      }),
    [consulta.data]
  );

  const contagem = React.useMemo(() => {
    const c = { A_CONFIRMAR: 0, SEM_SUGESTAO: 0, CONFIRMADAS: 0, TODAS: linhas.length };
    for (const l of linhas) c[l.situacao]++;
    return c;
  }, [linhas]);

  const grupoParaFiltro = (l: Linha) => l.grupo ?? l.sugestao;
  // Quantas UASGs da aba escolhida cada grupo traria (contagem no menu do filtro).
  const contagemPorGrupo = React.useMemo(() => {
    const c: Partial<Record<GrupoConfirmavel, number>> = {};
    for (const l of linhas) {
      const g = grupoParaFiltro(l);
      if (g && (situacao === 'TODAS' || l.situacao === situacao)) c[g] = (c[g] ?? 0) + 1;
    }
    return c;
  }, [linhas, situacao]);

  const totalDaAba = situacao === 'TODAS' ? linhas.length : contagem[situacao];

  const visiveis = React.useMemo(() => {
    const q = semAcento(busca.trim());
    return linhas.filter(
      (l) =>
        (situacao === 'TODAS' || l.situacao === situacao) &&
        (!filtroGrupo || grupoParaFiltro(l) === filtroGrupo) &&
        (!q || l.uasg.includes(q) || semAcento(`${l.nome ?? ''} ${l.nomeNaAta ?? ''} ${l.siglaOrgao ?? ''} ${l.siglaUf ?? ''}`).includes(q))
    );
  }, [linhas, situacao, busca, filtroGrupo]);

  // Paginação das carteiras; a seleção e o "marcar todas" valem para a lista inteira, não só para a página.
  const { currentPage, setPage, pageItems } = useCarteiraPagination(visiveis, chaveDaLinha, POR_PAGINA);

  // Seleção em lote (mesmo padrão da Central de Distribuição): só UASG com sugestão e ainda sem grupo.
  const selecionavel = (l: Linha) => podeEditar && !l.grupo && l.sugestao !== null;
  const chavesSelecionaveis = React.useMemo(() => visiveis.filter(selecionavel).map((l) => l.uasg), [visiveis, podeEditar]); // eslint-disable-line react-hooks/exhaustive-deps
  const selecao = useSelecaoFila(chavesSelecionaveis);
  const selecionadas = visiveis.filter((l) => selecao.selecionadas.has(l.uasg) && l.sugestao);
  const todasMarcadas = chavesSelecionaveis.length > 0 && chavesSelecionaveis.every((k) => selecao.selecionadas.has(k));
  const marcarTodasRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (marcarTodasRef.current) marcarTodasRef.current.indeterminate = selecao.selecionadas.size > 0 && !todasMarcadas;
  }, [selecao.selecionadas, todasMarcadas]);

  const escolher = async (l: Linha, valor: string) => {
    const grupo = (GRUPOS_CONFIRMAVEIS as readonly string[]).includes(valor) ? (valor as GrupoConfirmavel) : null;
    setSalvando(l.uasg);
    try {
      await definir.mutateAsync([{ uasg: l.uasg, grupo }]);
      toast.success(grupo ? `UASG ${l.uasg}: ${GRUPO_GTI_INFO[grupo].rotulo} confirmado.` : `UASG ${l.uasg} voltou para "a confirmar".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível salvar o grupo.');
    } finally {
      setSalvando(null);
    }
  };

  const confirmarSelecionadas = async () => {
    const lista = selecionadas;
    if (lista.length === 0) return;
    const porGrupo = new Map<GrupoConfirmavel, number>();
    for (const l of lista) if (l.sugestao) porGrupo.set(l.sugestao, (porGrupo.get(l.sugestao) ?? 0) + 1);
    const resumo = GRUPOS_CONFIRMAVEIS.filter((g) => porGrupo.has(g)).map((g) => `${GRUPO_GTI_INFO[g].rotulo} ${porGrupo.get(g)}`).join(' · ');
    const ok = await confirm({
      title: `Confirmar a sugestão de ${lista.length} ${lista.length === 1 ? 'UASG' : 'UASGs'}?`,
      message: `Cada UASG selecionada fica com o grupo sugerido: ${resumo}. Dá para corrigir uma a uma depois.`,
      confirmLabel: 'Confirmar sugestões'
    });
    if (!ok) return;
    try {
      const n = await definir.mutateAsync(lista.map((l) => ({ uasg: l.uasg, grupo: l.sugestao })));
      selecao.limpar();
      toast.success(`${n} ${n === 1 ? 'UASG confirmada' : 'UASGs confirmadas'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível confirmar as sugestões.');
    }
  };

  const segmentos: Array<CarteiraSegment<Situacao>> = [
    { id: 'A_CONFIRMAR', label: 'A confirmar', count: contagem.A_CONFIRMAR, dot: 'var(--color-warning-solid)', title: 'O sistema sugeriu um grupo; falta o coordenador confirmar' },
    { id: 'SEM_SUGESTAO', label: 'Sem sugestão', count: contagem.SEM_SUGESTAO, dot: 'var(--color-danger)', title: 'Nada no nome nem na sigla indica o grupo' },
    { id: 'CONFIRMADAS', label: 'Confirmadas', count: contagem.CONFIRMADAS, dot: 'var(--color-success)' },
    { id: 'TODAS', label: 'Todas', count: contagem.TODAS }
  ];

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
                  checked={selecao.selecionadas.has(l.uasg)}
                  onChange={() => selecao.alternar(l.uasg)}
                  aria-label={`Selecionar UASG ${l.uasg}`}
                  data-testid={`selecionar-uasg-${l.uasg}`}
                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
              ) : null
          } as Column<Linha>
        ]
      : []),
    {
      key: 'uasg',
      header: 'UASG',
      nowrap: true,
      render: (l) => <span style={{ fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>{l.uasg}</span>
    },
    {
      key: 'orgao',
      header: 'Órgão',
      priority: 'primary',
      minWidth: '260px',
      render: (l) => {
        const local = localDaUasg({ municipio: l.municipio, siglaUf: l.siglaUf });
        return (
          <>
            <div style={{ fontWeight: 700 }} title={l.nomeNaAta && l.nomeNaAta !== l.nome ? `Nome na ata: ${l.nomeNaAta}` : undefined}>
              {l.nome ?? l.nomeNaAta ?? `UASG ${l.uasg}`}
            </div>
            <div style={pequeno}>
              {[local, l.atas > 0 ? `em ${l.atas} ${l.atas === 1 ? 'ata' : 'atas'}` : 'não aparece mais nos itens'].filter(Boolean).join(' · ')}
            </div>
          </>
        );
      }
    },
    {
      key: 'sigla',
      header: 'Sigla do órgão',
      render: (l) => (l.siglaOrgao ? <span>{l.siglaOrgao}</span> : <span style={pequeno}>ainda não lida</span>)
    },
    {
      key: 'sugestao',
      header: 'Sugestão',
      render: (l) => (l.sugestao ? <GtiTag grupo={l.sugestao} /> : <span style={pequeno}>sem sugestão</span>)
    },
    {
      key: 'grupo',
      header: 'Grupo',
      minWidth: '190px',
      render: (l) =>
        podeEditar ? (
          <AppSelect
            aria-label={`Grupo da UASG ${l.uasg}`}
            value={l.grupo ?? ''}
            disabled={salvando === l.uasg}
            onChange={(e) => void escolher(l, e.target.value)}
            data-testid={`grupo-uasg-${l.uasg}`}
          >
            <option value="">{l.sugestao ? `A confirmar (sugestão: ${GRUPO_GTI_INFO[l.sugestao].rotulo})` : 'A confirmar'}</option>
            {GRUPOS_CONFIRMAVEIS.map((g) => (
              <option key={g} value={g}>
                {g === 'OUTROS' ? GRUPO_GTI_INFO[g].rotulo : `${GRUPO_GTI_INFO[g].rotulo} · ${GRUPO_GTI_INFO[g].descricao}`}
              </option>
            ))}
          </AppSelect>
        ) : l.grupo ? (
          <GtiTag grupo={l.grupo} />
        ) : (
          <GtiTag grupo="A_CONFIRMAR" />
        )
    },
    {
      key: 'confirmado',
      header: 'Confirmado por',
      render: (l) =>
        l.grupo ? (
          <>
            <div style={{ fontWeight: 700 }}>{l.confirmadoPorNome ?? '—'}</div>
            <div style={pequeno}>{l.confirmadoEm ? formatDataHoraBR(l.confirmadoEm) : ''}</div>
          </>
        ) : (
          <span style={pequeno}>—</span>
        )
    }
  ];

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <PageHeader
        title="Grupos das UASGs"
        subtitle="De qual Grupo de Trabalho Integrado (GTI) do ComprasSUSP é cada órgão participante das atas."
        icon={<Network size={20} />}
        hint="O sistema sugere o grupo pelo nome da UASG e pela sigla do órgão; quem confirma é o coordenador. Só o grupo confirmado conta nas atas e itens, e adesões não entram."
      />

      {consulta.data === null ? (
        <NoticeBar tone="warning" testId="grupos-uasgs-sem-migration">
          O banco ainda não tem os grupos das UASGs (migration 139). A tela funciona depois que ela for aplicada.
        </NoticeBar>
      ) : (
        <>
          <CarteiraSegmentTabs
            segments={segmentos}
            active={situacao}
            onSelect={setSituacao}
            testIdPrefix="grupos-uasgs"
            ariaLabel="Situação do grupo"
            meta={`${contagem.TODAS} UASGs participam de atas da carteira`}
          />

          <CarteiraFilterBar
            busca={busca}
            searchPlaceholder="Buscar por UASG, nome, sigla ou UF..."
            onChangeBusca={setBusca}
            hasActiveFilters={Boolean(busca.trim() || filtroGrupo)}
            onResetFilters={() => {
              setBusca('');
              setFiltroGrupo('');
            }}
            counter={carteiraCounter(visiveis.length, totalDaAba, Boolean(busca.trim() || filtroGrupo), 'UASG', 'UASGs')}
            testIdPrefix="grupos-uasgs"
          >
            <CarteiraFilterButton
              label="GTI"
              value={filtroGrupo}
              emptyValue=""
              options={GRUPOS_CONFIRMAVEIS.map((g) => ({
                value: g,
                label: g === 'OUTROS' ? GRUPO_GTI_INFO[g].rotulo : `${GRUPO_GTI_INFO[g].rotulo} · ${GRUPO_GTI_INFO[g].descricao}`,
                count: contagemPorGrupo[g] ?? 0
              }))}
              onChange={setFiltroGrupo}
              testId="grupos-uasgs-filtro-gti"
            />
          </CarteiraFilterBar>

          {selecionadas.length > 0 && (
            <SelecaoBar
              quantidade={selecionadas.length}
              singular="UASG"
              plural="UASGs"
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
                  data-testid="confirmar-selecionadas"
                />
              }
              testIdPrefix="grupos-uasgs"
            />
          )}

          <AdminListShell
            title="UASGs participantes"
            icon={<Network size={16} />}
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
                    Marcar as {chavesSelecionaveis.length} com sugestão
                  </label>
                ) : undefined
              }
            isLoading={consulta.isLoading}
            isError={consulta.isError}
            errorMessage={consulta.error instanceof Error ? consulta.error.message : undefined}
            onRetry={() => void consulta.refetch()}
            isEmpty={!consulta.isLoading && visiveis.length === 0}
            emptyTitle={situacao === 'A_CONFIRMAR' && !busca ? 'Nenhuma UASG com sugestão a confirmar.' : 'Nenhuma UASG nesta lista.'}
            testId="grupos-uasgs-lista"
          >
            <DataTable
              columns={columns}
              data={pageItems}
              keyExtractor={(l) => l.uasg}
              rowStyle={(l) => (selecao.selecionadas.has(l.uasg) ? { background: SELECIONADA_BG } : undefined)}
              testId="grupos-uasgs-tabela"
            />
            <CarteiraPagination page={currentPage} pageSize={POR_PAGINA} total={visiveis.length} onChange={setPage} testIdPrefix="grupos-uasgs" />
          </AdminListShell>
        </>
      )}
    </PageContainer>
  );
};
