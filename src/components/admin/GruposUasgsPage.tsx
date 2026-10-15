import React from 'react';
import { Network } from 'lucide-react';
import {
  ActionButton,
  AppInput,
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

  const visiveis = React.useMemo(() => {
    const q = semAcento(busca.trim());
    return linhas.filter(
      (l) =>
        (situacao === 'TODAS' || l.situacao === situacao) &&
        (!q || l.uasg.includes(q) || semAcento(`${l.nome ?? ''} ${l.nomeNaAta ?? ''} ${l.siglaOrgao ?? ''} ${l.siglaUf ?? ''}`).includes(q))
    );
  }, [linhas, situacao, busca]);

  const comSugestaoVisiveis = visiveis.filter((l) => l.situacao === 'A_CONFIRMAR');

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

  const confirmarSugestoes = async () => {
    const lista = comSugestaoVisiveis.filter((l) => l.sugestao);
    if (lista.length === 0) return;
    const ok = await confirm({
      title: `Confirmar ${lista.length} ${lista.length === 1 ? 'sugestão' : 'sugestões'}?`,
      message: 'Cada UASG desta lista fica com o grupo sugerido pelo sistema. Confira a lista antes: dá para corrigir uma a uma depois.',
      confirmLabel: 'Confirmar sugestões'
    });
    if (!ok) return;
    try {
      const n = await definir.mutateAsync(lista.map((l) => ({ uasg: l.uasg, grupo: l.sugestao })));
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
                {GRUPO_GTI_INFO[g].rotulo} · {GRUPO_GTI_INFO[g].descricao}
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
        hint="O grupo confirmado aqui vale para todas as atas e itens: a carteira de Atas mostra a fatia de cada GTI e filtra pelo interesse de cada um."
      />

      <NoticeBar tone="info" testId="grupos-uasgs-aviso">
        O Compras.gov.br não tem um campo que diga a força de segurança. O sistema sugere o grupo pelo nome da UASG e pela sigla do órgão, e a sugestão pode errar. Nas atas só conta o grupo <b>confirmado</b>; UASG a confirmar aparece em cinza e fica fora do filtro por GTI. Adesões não contam.
        {podeEditar ? '' : ' Quem confirma é o coordenador.'}
      </NoticeBar>

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

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ flex: '1 1 260px', maxWidth: '400px' }}>
              <AppInput
                aria-label="Buscar UASG"
                placeholder="Buscar por UASG, nome, sigla ou UF..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                data-testid="grupos-uasgs-busca"
              />
            </div>
            {podeEditar && situacao === 'A_CONFIRMAR' && comSugestaoVisiveis.length > 0 && (
              <ActionButton
                action="aplicarSugestao"
                size="sm"
                label={`Confirmar ${comSugestaoVisiveis.length === 1 ? 'a sugestão' : `as ${comSugestaoVisiveis.length} sugestões`} da lista`}
                onClick={() => void confirmarSugestoes()}
                isLoading={definir.isPending && salvando === null}
                data-testid="confirmar-sugestoes"
              />
            )}
          </div>

          <AdminListShell
            title="UASGs participantes"
            countLabel={`${visiveis.length} de ${linhas.length}`}
            icon={<Network size={16} />}
            isLoading={consulta.isLoading}
            isError={consulta.isError}
            errorMessage={consulta.error instanceof Error ? consulta.error.message : undefined}
            onRetry={() => void consulta.refetch()}
            isEmpty={!consulta.isLoading && visiveis.length === 0}
            emptyTitle={situacao === 'A_CONFIRMAR' && !busca ? 'Nenhuma UASG com sugestão a confirmar.' : 'Nenhuma UASG nesta lista.'}
            testId="grupos-uasgs-lista"
          >
            <DataTable columns={columns} data={visiveis} keyExtractor={(l) => l.uasg} testId="grupos-uasgs-tabela" />
          </AdminListShell>
        </>
      )}
    </PageContainer>
  );
};
