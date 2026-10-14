import React from 'react';
import { Users } from 'lucide-react';
import {
  AppButton,
  DataTable,
  EmptyState,
  ErrorState,
  MetricStrip,
  NoticeBar,
  RowActionsMenu,
  SectionHeader,
  StatusBadge,
  useConfirmDialog,
  useToast,
  type Column,
  type MetricStripItem,
  type RowAction
} from '../../design-system';
import { formatNumber } from './itemBalanceUtils';
import { formatDataHoraBR } from '../../utils/format';
import { useAcoesQuantitativos } from '../../hooks/useQuantitativosDoItem';
import type { OrgaoQuantitativo, QuantitativosDoItem, SituacaoOrgao } from '../../services/quantitativosService';
import {
  contratadoDoOrgao,
  extratoDaCotaPropria,
  mudaramNoMesmoSegundo,
  SITUACOES_COM_ACAO,
  textoDaSituacao,
  type EstadoContratado
} from '../../utils/quantitativos';
import { isUasgCglic } from '../../config/unidadesGestoras';
import type { UnidadeItemRecord } from '../../types';
import type { OrigemUnidadesItem } from '../../hooks/useItemUnidades';
import { InformarAtaAssinadaModal } from './InformarAtaAssinadaModal';
import { useCadastroUasgs } from '../../hooks/useCadastroUasgs';
import { localDaUasg } from '../../services/cadastroUasgsSyncService';
import { ConfirmarRemanejamentoModal, ContinuaDoOrgaoModal } from './RemanejamentoModals';
import { useOrgaosRecolhidos } from './useOrgaosRecolhidos';

export interface QuantitativosTabProps {
  itemKey: string;
  tituloItem: string;
  /** Ata gerenciada pela SENASP (só nelas a ata assinada pode ser informada). */
  ataDaCglic: boolean;
  homologado: number;
  /** Órgãos do item lidos agora (ou da cópia), já com a gerenciadora marcada. */
  unidades: UnidadeItemRecord[];
  loading: boolean;
  error: string | null;
  origem: OrigemUnidadesItem;
  copiadoEm: string | null;
  /** Registrado da SENASP no Compras.gov.br. */
  registradoSenasp: number;
  /** Base do saldo: cota própria com a ata assinada informada; senão o registrado da SENASP. */
  baseSaldo: number;
  contratadoSenasp: number;
  quantitativos: QuantitativosDoItem;
  podeInformar: boolean;
  podeRemanejar: boolean;
  alocado: number;
  totalUnidadesInternas: number;
  /** Alocação às unidades internas: aparece ao abrir a linha da SENASP. */
  unidadesInternas: React.ReactNode;
}

interface Linha {
  uasg: string;
  /** Nome do cadastro de UASGs; sem cadastro, o nome que veio com a ata. */
  nome: string;
  /** Nome que veio com a ata (a fonte corta em 45 letras). */
  nomeNaAta: string;
  /** "Boa Vista/RR", do cadastro de UASGs. */
  local: string | null;
  ehSenasp: boolean;
  gerenciadora: boolean;
  registrado: number | null;
  orgao: OrgaoQuantitativo | null;
}

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const ORDEM: Record<SituacaoOrgao, number> = {
  SENASP: -1, FORA_DA_ATA: 0, REMANEJADO_A_MENOS: 1, GERENCIADO: 2, REMANEJADO_A_MAIS: 3, ACIMA_DA_ATA: 3, REMANEJAMENTO_CONFIRMADO: 4, IGUAL: 5
};
const TOM_BADGE = { neutral: 'neutral', info: 'info', warning: 'warning', danger: 'danger' } as const;
const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)' };
const mono: React.CSSProperties = { fontFamily: 'monospace', fontWeight: 600 };
const painel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.6rem', borderLeft: '3px solid var(--primary)', paddingLeft: '0.75rem', fontSize: '0.84rem', color: 'var(--text-secondary)' };

export const QuantitativosTab: React.FC<QuantitativosTabProps> = (p) => {
  const q = p.quantitativos;
  const toast = useToast();
  const confirm = useConfirmDialog();
  const acoes = useAcoesQuantitativos(p.itemKey);
  const [informando, setInformando] = React.useState(false);
  const [verRegistros, setVerRegistros] = React.useState(false);
  const [confirmando, setConfirmando] = React.useState<OrgaoQuantitativo | null>(null);
  const [continuando, setContinuando] = React.useState<OrgaoQuantitativo | null>(null);

  const nomesVivos = React.useMemo(() => new Map(p.unidades.map((u) => [digitos(u.codigoUnidade), u.nomeUnidade])), [p.unidades]);
  const cadastro = useCadastroUasgs([...q.orgaos.map((o) => o.uasg), ...p.unidades.map((u) => digitos(u.codigoUnidade))]);
  const linhas: Linha[] = React.useMemo(() => {
    const identidade = (uasg: string, nomeNaAta: string) => {
      const c = cadastro.get(uasg);
      return { nome: c?.nome ?? nomeNaAta, nomeNaAta, local: c ? localDaUasg(c) : null };
    };
    const base: Linha[] = q.informado
      ? q.orgaos.map((o) => ({
          uasg: o.uasg,
          ...identidade(o.uasg, nomesVivos.get(o.uasg) ?? o.nomeOrgao ?? `UASG ${o.uasg}`),
          ehSenasp: o.ehSenasp,
          gerenciadora: o.ehSenasp && p.ataDaCglic,
          registrado: o.quantidadeRegistrada,
          orgao: o
        }))
      : p.unidades.map((u) => {
          const uasg = digitos(u.codigoUnidade);
          return { uasg, ...identidade(uasg, u.nomeUnidade), ehSenasp: isUasgCglic(uasg), gerenciadora: u.tipoUnidade === 'GERENCIADORA', registrado: Number(u.quantidadeRegistrada) || 0, orgao: null };
        });
    return base.sort((a, b) =>
      Number(b.ehSenasp) - Number(a.ehSenasp)
      || Number(b.gerenciadora) - Number(a.gerenciadora)
      || (a.orgao && b.orgao ? ORDEM[a.orgao.situacao] - ORDEM[b.orgao.situacao] : 0)
      || (b.registrado ?? -1) - (a.registrado ?? -1));
  }, [q.informado, q.orgaos, p.unidades, p.ataDaCglic, nomesVivos, cadastro]);
  const nomeDe = React.useCallback((uasg: string) => linhas.find((l) => l.uasg === uasg)?.nome ?? (isUasgCglic(uasg) ? 'SENASP' : `UASG ${uasg}`), [linhas]);
  const linhaSenasp = linhas.find((l) => l.ehSenasp);

  // A linha da SENASP vem aberta ao entrar na aba e ao trocar de item.
  const [abertas, setAbertas] = React.useState<Set<string>>(() => new Set(linhaSenasp ? [linhaSenasp.uasg] : []));
  React.useEffect(() => {
    setAbertas(linhaSenasp ? new Set([linhaSenasp.uasg]) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.itemKey, linhaSenasp?.uasg]);
  const alternar = (uasg: string) => setAbertas((s) => {
    const n = new Set(s);
    if (n.has(uasg)) n.delete(uasg); else n.add(uasg);
    return n;
  });

  const recolhidos = useOrgaosRecolhidos(linhas, p.itemKey);

  const estado = (l: Linha): EstadoContratado => contratadoDoOrgao(l.uasg, l.ehSenasp, q, p.contratadoSenasp);
  const extrato = q.informado ? extratoDaCotaPropria(q) : null;
  const saldoSenasp = p.baseSaldo - p.contratadoSenasp;
  const livreParaAlocar = p.baseSaldo - p.alocado;
  const contratouAcima = linhas.filter((l) => !l.ehSenasp && l.registrado != null && estado(l).tipo === 'CONTRATOS' && (estado(l) as any).quantidade > l.registrado).length;

  const desfazer = async (rotulo: string, acao: () => Promise<unknown>, ok: string) => {
    if (!(await confirm({ title: rotulo, message: 'A situação do órgão e a cota própria são recalculadas.', confirmLabel: 'Desfazer' }))) return;
    try {
      await acao();
      toast.success(ok);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível desfazer.');
    }
  };

  const acoesDaLinha = (l: Linha): RowAction[] => {
    const o = l.orgao;
    if (!o || !p.podeRemanejar || l.ehSenasp) return [];
    const lista: RowAction[] = [];
    if (SITUACOES_COM_ACAO.has(o.situacao)) {
      lista.push({ label: o.situacao === 'REMANEJADO_A_MENOS' ? 'Informar destino do remanejamento' : 'Confirmar remanejamento', onClick: () => setConfirmando(o), testId: `acao-remanejar-${o.uasg}` });
      if (o.continuaDoOrgao == null) lista.push({ label: 'Continua do órgão', onClick: () => setContinuando(o), testId: `acao-continua-${o.uasg}` });
    }
    if (o.continuaDoOrgao != null) {
      lista.push({ label: 'Desfazer "continua do órgão"', danger: true, onClick: () => desfazer('Desfazer "continua do órgão"?', () => acoes.desfazerContinua.mutateAsync(o.uasg), 'Desfeito.'), testId: `acao-desfazer-continua-${o.uasg}` });
    }
    if (o.remanejadoConfirmado > 0) {
      lista.push({ label: 'Desfazer remanejamento confirmado', danger: true, onClick: () => desfazer('Desfazer o remanejamento confirmado?', () => acoes.desfazerRemanejamento.mutateAsync(o.uasg), 'Remanejamento desfeito.'), testId: `acao-desfazer-remanejamento-${o.uasg}` });
    }
    return lista;
  };

  const celulaContratado = (l: Linha) => {
    const e = estado(l);
    if (e.tipo === 'SENASP') return <><span style={mono}>{formatNumber(e.quantidade)}</span><div style={pequeno}>contratos vinculados</div></>;
    if (e.tipo === 'CONTRATOS') {
      const notas = e.contratos.every((c) => /empenho/i.test(c.tipo ?? ''));
      const n = e.contratos.length;
      return <><span style={{ ...mono, fontWeight: 800 }}>{formatNumber(e.quantidade)}</span><div style={pequeno}>{n} {notas ? (n > 1 ? 'notas de empenho' : 'nota de empenho') : (n > 1 ? 'contratos' : 'contrato')} no Contratos.gov.br</div></>;
    }
    if (e.tipo === 'NENHUM') return <><span style={mono}>0</span><div style={pequeno}>nenhum contrato desta UASG</div></>;
    return <><span style={{ color: 'var(--text-muted)' }}>—</span><div style={pequeno}>{e.tipo === 'SEM_FONTE' ? 'sem dado' : 'ainda não lido'}</div></>;
  };

  const celulaSaldo = (l: Linha) => {
    if (l.ehSenasp) {
      return <><span style={{ ...mono, fontWeight: 800, color: saldoSenasp < 0 ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>{formatNumber(saldoSenasp)}</span><div style={pequeno}>{q.informado ? 'da cota própria' : 'registrado − contratado'}</div></>;
    }
    const e = estado(l);
    const gerenciado = l.orgao && l.orgao.gerenciado > 0 ? <div style={pequeno}>+ {formatNumber(l.orgao.gerenciado)} gerenciados pela SENASP</div> : null;
    if (l.registrado == null) return <><span style={{ color: 'var(--text-muted)' }}>—</span>{gerenciado}</>;
    if (e.tipo !== 'CONTRATOS' && e.tipo !== 'NENHUM') return <><span style={{ color: 'var(--text-muted)' }}>—</span><div style={pequeno}>sem contratado</div>{gerenciado}</>;
    const v = l.registrado - e.quantidade;
    return (
      <>
        <span style={{ ...mono, fontWeight: 700, color: v < 0 ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>{formatNumber(v)}</span>
        {v < 0 && <div><StatusBadge label="Contratado acima do registrado" variant="danger" size="sm" dot={false} /></div>}
        {gerenciado}
      </>
    );
  };

  const celulaSituacao = (l: Linha) => {
    if (l.ehSenasp) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
          <StatusBadge label={`Gerencia ${formatNumber(q.gerenciadoParticipantes)} para participantes`} variant="info" size="sm" dot={false} />
          <span style={pequeno}>cota própria {formatNumber(p.baseSaldo)}</span>
        </div>
      );
    }
    if (!l.orgao) return null;
    const t = textoDaSituacao(l.orgao, q, nomeDe);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
        <StatusBadge label={t.rotulo} variant={TOM_BADGE[t.tom]} size="sm" dot={false} testId={`situacao-${l.uasg}`} />
        {t.detalhe && <span style={pequeno}>{t.detalhe}</span>}
      </div>
    );
  };

  const columns: Column<Linha>[] = [
    {
      key: 'orgao',
      header: 'Órgão',
      minWidth: '260px',
      render: (l) => (
        <>
          <div style={{ fontWeight: 700 }} title={l.nome !== l.nomeNaAta ? `Nome na ata: ${l.nomeNaAta}` : undefined}>{l.nome}</div>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.15rem', flexWrap: 'wrap' }}>
            <span style={pequeno}>UASG {l.uasg}{l.local ? ` · ${l.local}` : ''}</span>
            <StatusBadge label={l.gerenciadora ? 'Gerenciadora' : 'Participante'} variant={l.gerenciadora ? 'info' : 'neutral'} size="sm" dot={false} />
            {l.ehSenasp && <span style={pequeno}>{p.totalUnidadesInternas} {p.totalUnidadesInternas === 1 ? 'unidade interna' : 'unidades internas'}</span>}
          </div>
        </>
      )
    },
    ...(q.informado ? [{ key: 'assinada', header: 'Qtd. na ata assinada', align: 'right' as const, render: (l: Linha) => <span style={mono}>{formatNumber(l.orgao?.quantidadeAssinada ?? 0)}</span> }] : []),
    {
      key: 'registrado',
      header: 'Registrado',
      align: 'right',
      render: (l) => (l.registrado == null ? <><span style={{ color: 'var(--text-muted)' }}>—</span><div style={pequeno}>sem registro</div></> : <span style={mono}>{formatNumber(l.registrado)}</span>)
    },
    ...(q.informado ? [{ key: 'situacao', header: 'Situação', render: celulaSituacao }] : []),
    { key: 'contratado', header: 'Contratado', align: 'right', render: celulaContratado },
    { key: 'saldo', header: 'Saldo', align: 'right', render: celulaSaldo }
  ];

  const detalheDoParticipante = (l: Linha) => {
    const o = l.orgao;
    const e = estado(l);
    const partes: React.ReactNode[] = [];
    if (o?.situacao === 'GERENCIADO') {
      partes.push(<p key="g" style={{ margin: 0 }}>A ata assinada dá <b>{formatNumber(o.quantidadeAssinada)}</b> ao órgão e o Compras.gov.br registra <b>{formatNumber(o.quantidadeRegistrada ?? 0)}</b>{o.semRegistro ? ' (o órgão não tem registro neste item)' : ''}. Os <b>{formatNumber(o.gerenciado)}</b> restantes estão no registrado da SENASP, que os gerencia para o órgão e não os conta na cota própria. Quando a SENASP remanejar para o órgão, o registrado dele sobe e o gerenciado cai sozinho.</p>);
    }
    if (o?.situacao === 'REMANEJADO_A_MENOS') {
      partes.push(<p key="r" style={{ margin: 0 }}>O registrado do órgão foi reduzido depois do registro da ata: houve remanejamento. A ata assinada dá <b>{formatNumber(o.quantidadeAssinada)}</b> e o Compras.gov.br registra <b>{formatNumber(o.quantidadeRegistrada ?? 0)}</b>. Pela regra aprovada, a redução é definitiva{o.gerenciado > 0 ? <>, menos <b>{formatNumber(o.gerenciado)}</b> marcados como "continua do órgão"</> : ''}.</p>);
    }
    if (o && (o.situacao === 'REMANEJADO_A_MAIS' || o.situacao === 'ACIMA_DA_ATA' || o.situacao === 'FORA_DA_ATA')) {
      partes.push(<p key="a" style={{ margin: 0 }}>{o.situacao === 'FORA_DA_ATA' ? 'O órgão está registrado no Compras.gov.br, mas não tem quantidade na ata assinada: confira os números informados. ' : ''}O que passa da ata assinada sem origem confirmada conta como remanejado da cota própria da SENASP. Se veio de outro órgão, confirme o remanejamento na linha dele escolhendo este órgão como destino.</p>);
    }
    if (o?.mudou && o.mudouEm) {
      const par = mudaramNoMesmoSegundo(q.orgaos, o.uasg);
      partes.push(<p key="m" style={{ margin: 0 }}>Última mudança do registrado no Compras.gov.br: {formatDataHoraBR(o.mudouEm)}. {par.length ? <>No mesmo segundo também mudou: <b>{par.map((x) => nomeDe(x.uasg)).join(', ')}</b>.</> : 'Nenhum outro órgão do item mudou no mesmo segundo.'}</p>);
    }
    const contin = q.continua.find((c) => c.uasg === l.uasg);
    if (contin) partes.push(<p key="c" style={{ margin: 0 }}><b>{contin.marcadoPorNome}</b> marcou em {formatDataHoraBR(contin.marcadoEm)} que {formatNumber(contin.quantidade)} continuam do órgão: “{contin.justificativa}”</p>);
    for (const r of q.remanejamentos.filter((x) => x.uasgOrigem === l.uasg)) {
      partes.push(<p key={r.id} style={{ margin: 0 }}><b>{r.confirmadoPorNome}</b> confirmou em {formatDataHoraBR(r.confirmadoEm)} o remanejamento de {formatNumber(r.quantidade)} {r.uasgDestino ? <>para <b>{nomeDe(r.uasgDestino)}</b></> : 'sem destino informado (conta como devolvido à SENASP)'}: “{r.justificativa}”</p>);
    }
    if (e.tipo === 'CONTRATOS') {
      partes.push(
        <div key="ct" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th>Número</th><th>Tipo</th><th style={{ textAlign: 'right' }}>Qtd. do item</th><th style={{ textAlign: 'right' }}>Preço unitário</th><th>Situação</th><th>Vigência até</th></tr></thead>
            <tbody>
              {e.contratos.map((c) => (
                <tr key={c.contratoId} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={mono}>{c.numero ?? c.contratoId}</td>
                  <td>{/empenho/i.test(c.tipo ?? '') ? 'Nota de empenho' : c.tipo ?? '—'}</td>
                  <td style={{ ...mono, textAlign: 'right' }}>{c.quantidade == null ? '—' : formatNumber(c.quantidade)}</td>
                  <td style={{ textAlign: 'right' }}>{c.valorUnitario == null ? '—' : c.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td>{c.situacao ?? '—'}</td>
                  <td>{c.vigenciaFim ? c.vigenciaFim.split('-').reverse().join('/') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={pequeno}>Lidos do Contratos.gov.br (ativos e encerrados).</div>
        </div>
      );
    } else if (e.tipo === 'NENHUM') {
      partes.push(<p key="n" style={{ margin: 0 }}>O órgão publica contratos no Contratos.gov.br e não tem nenhum nesta compra.</p>);
    } else if (e.tipo === 'SEM_FONTE') {
      partes.push(<p key="s" style={{ margin: 0 }}>O órgão não publica contratos no Contratos.gov.br: o contratado dele não tem fonte.</p>);
    } else if (e.tipo === 'NAO_LIDO') {
      partes.push(<p key="nl" style={{ margin: 0 }}>Os contratos deste órgão ainda não foram lidos pela sincronização.</p>);
    }
    if (o?.situacao === 'IGUAL' && partes.length === 0) partes.push(<p key="i" style={{ margin: 0 }}>O registrado é igual à ata assinada.</p>);
    return <div style={painel}>{partes}</div>;
  };

  const detalheDaSenasp = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {p.unidadesInternas}
      {extrato && (
        <details style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.75rem', background: 'var(--surface)' }} data-testid="extrato-cota-propria">
          <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--primary)', fontSize: '0.85rem' }}>Ver o extrato da cota própria</summary>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', marginTop: '0.5rem' }}>
            <tbody>
              {[
                ['Qtd. na ata assinada da SENASP', extrato.assinadaSenasp, '', ''],
                ['Remanejado pela SENASP para órgãos, acima da ata assinada deles', extrato.cedido.reduce((s, x) => s + x.quantidade, 0), extrato.cedido.map((x) => `${nomeDe(x.uasg)} ${formatNumber(x.quantidade)}`).join(' · ') || 'nenhum', '− '],
                ['Remanejado de órgãos para a SENASP', extrato.recebido.reduce((s, x) => s + x.quantidade, 0), extrato.recebido.map((x) => `${nomeDe(x.de)} ${formatNumber(x.quantidade)}${x.automatico ? ' (redução no Compras.gov.br)' : ' (confirmado)'}`).join(' · ') || 'nenhum', '+ ']
              ].map(([rotulo, valor, det, sinal]) => (
                <tr key={String(rotulo)} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.35rem 0' }}>{rotulo}{det ? <div style={pequeno}>{det}</div> : null}</td>
                  <td style={{ ...mono, textAlign: 'right', whiteSpace: 'nowrap' }}>{sinal}{formatNumber(Number(valor))}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 800 }}>
                <td style={{ padding: '0.35rem 0' }}>Cota própria da SENASP</td>
                <td style={{ ...mono, textAlign: 'right' }}>{formatNumber(extrato.cota)}</td>
              </tr>
            </tbody>
          </table>
          {extrato.entre.length > 0 && (
            <div style={{ ...pequeno, marginTop: '0.35rem' }}>
              Entre participantes, sem efeito na cota: {extrato.entre.map((e) => `${nomeDe(e.de)} para ${nomeDe(e.para ?? '')} ${formatNumber(e.quantidade)}${e.automatico ? ' (mesmo segundo)' : ' (confirmado)'}`).join(' · ')}.
            </div>
          )}
          <div style={{ ...pequeno, marginTop: '0.35rem' }}>
            Conferência pelo Compras.gov.br: registrado da SENASP {formatNumber(p.registradoSenasp)} − gerenciado para participantes {formatNumber(q.gerenciadoParticipantes)} = {formatNumber(p.baseSaldo)}.{' '}
            {extrato.confere ? 'Confere com o extrato.' : 'Não confere com o extrato: a soma da ata assinada ou a do registrado não fecha com o homologado.'}
          </div>
        </details>
      )}
    </div>
  );

  if (p.error) return <ErrorState title="Não foi possível carregar os órgãos do item" message={p.error} />;

  const cabecalho = q.informado ? (
    <NoticeBar
      tone="info"
      testId="ata-assinada-informada"
      action={p.podeInformar ? <AppButton variant="outline" size="sm" onClick={() => setInformando(true)} data-testid="corrigir-ata-assinada">Corrigir qtd. da ata assinada</AppButton> : undefined}
    >
      <StatusBadge label="Informado" variant="success" size="sm" dot={false} />{' '}
      Quantidades da ata assinada informadas por <b>{q.informadoPorNome}</b> em {q.informadoEm ? formatDataHoraBR(q.informadoEm) : '—'}. Documento SEI nº <b>{q.documentoSei}</b>.{' '}
      <AppButton variant="ghost" size="xs" onClick={() => setVerRegistros((v) => !v)} data-testid="ver-alteracoes-ata-assinada">
        {verRegistros ? 'Fechar alterações' : `Ver alterações (${q.registros.length})`}
      </AppButton>
    </NoticeBar>
  ) : p.ataDaCglic ? (
    <NoticeBar
      tone="warning"
      testId="ata-assinada-nao-informada"
      action={p.podeInformar ? <AppButton variant="primary" size="sm" onClick={() => setInformando(true)} data-testid="informar-ata-assinada">Informar qtd. da ata assinada</AppButton> : undefined}
    >
      <StatusBadge label="Não informado" variant="neutral" size="sm" dot={false} />{' '}
      Sem a ata assinada, o limite da alocação é todo o registrado da SENASP, sem separar o que é dos participantes.
      {p.podeInformar ? '' : ' Quem informa é o gestor da ata.'}
    </NoticeBar>
  ) : null;

  const metricas: MetricStripItem[] = q.informado
    ? [
        { label: 'Registrado', value: formatNumber(p.registradoSenasp), hint: `no Compras.gov.br · ata assinada ${formatNumber(q.assinadaSenasp)}`, testId: 'metrica-registrado' },
        { label: 'Gerenciado p/ participantes', value: formatNumber(q.gerenciadoParticipantes), hint: 'dos órgãos, dentro do registrado', tone: 'warning', testId: 'metrica-gerenciado' },
        { label: 'Cota própria', value: formatNumber(p.baseSaldo), hint: 'registrado − gerenciado', tone: p.baseSaldo < 0 ? 'danger' : 'default', testId: 'metrica-cota' },
        { label: 'Alocado às unidades', value: formatNumber(p.alocado), hint: livreParaAlocar >= 0 ? `livre para alocar ${formatNumber(livreParaAlocar)}` : `${formatNumber(-livreParaAlocar)} acima do limite`, tone: livreParaAlocar < 0 ? 'danger' : 'default', testId: 'metrica-alocado' },
        { label: 'Contratado', value: formatNumber(p.contratadoSenasp), hint: 'contratos vinculados', testId: 'metrica-contratado' },
        { label: 'Saldo da cota própria', value: formatNumber(saldoSenasp), hint: `registrado − contratado: ${formatNumber(p.registradoSenasp - p.contratadoSenasp)}`, tone: saldoSenasp <= 0.2 * Math.max(p.baseSaldo, 0) ? 'danger' : 'default', testId: 'metrica-saldo' }
      ]
    : [
        { label: 'Quantidade SENASP', value: formatNumber(p.baseSaldo), hint: p.ataDaCglic ? 'ata assinada não informada' : 'registrado no Compras.gov.br', testId: 'metrica-cota' },
        { label: 'Alocado às unidades', value: formatNumber(p.alocado), hint: livreParaAlocar >= 0 ? `livre para alocar ${formatNumber(livreParaAlocar)}` : `${formatNumber(-livreParaAlocar)} acima do limite`, tone: livreParaAlocar < 0 ? 'danger' : 'default', testId: 'metrica-alocado' },
        { label: 'Contratado', value: formatNumber(p.contratadoSenasp), hint: 'contratos vinculados', testId: 'metrica-contratado' },
        { label: 'Saldo', value: formatNumber(saldoSenasp), hint: 'registrado − contratado', tone: saldoSenasp <= 0.2 * Math.max(p.baseSaldo, 0) ? 'danger' : 'default', testId: 'metrica-saldo' }
      ];

  const semOrgaos = !p.loading && linhas.length === 0;
  const foraDaAta = q.orgaos.filter((o) => o.situacao === 'FORA_DA_ATA').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} data-testid="quantitativos-tab">
      {!p.loading && p.origem === 'COPIA' && p.copiadoEm && (
        <NoticeBar tone="info" testId="unidades-copia">
          O Compras.gov.br não devolveu os órgãos deste item agora. A lista abaixo é a última cópia guardada, lida em {formatDataHoraBR(p.copiadoEm)}.
        </NoticeBar>
      )}
      {cabecalho}
      {verRegistros && q.registros.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem' }} data-testid="alteracoes-ata-assinada">
          {q.registros.map((r) => (
            <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.65rem', background: 'var(--surface)' }}>
              <b>{formatDataHoraBR(r.informadoEm)}</b> · {r.informadoPorNome} · documento SEI nº {r.documentoSei} · total {formatNumber(r.total)} · {r.justificativa ? `“${r.justificativa}”` : 'primeiro registro'}
            </div>
          ))}
        </div>
      )}
      <MetricStrip title="SENASP neste item" items={metricas} testId="quantitativos-metricas" />
      {q.informado && p.baseSaldo < 0 && (
        <NoticeBar tone="danger" testId="cota-negativa">O registrado da SENASP ({formatNumber(p.registradoSenasp)}) é menor do que ela gerencia para os participantes ({formatNumber(q.gerenciadoParticipantes)}). A SENASP remanejou quantidade de órgãos que não abriram mão dela.</NoticeBar>
      )}
      {q.informado && q.totalAssinada !== q.homologado && (
        <NoticeBar tone="danger" testId="soma-assinada-nao-fecha">A soma da ata assinada ({formatNumber(q.totalAssinada)}) é diferente do homologado do item ({formatNumber(q.homologado)}). Confira as quantidades informadas.</NoticeBar>
      )}
      {q.informado && q.totalRegistrado !== q.homologado && (
        <NoticeBar tone="danger" testId="soma-registrado-nao-fecha">A soma do registrado no Compras.gov.br ({formatNumber(q.totalRegistrado)}) é diferente do homologado do item ({formatNumber(q.homologado)}). Pode ser cancelamento ou supressão de parte do item.</NoticeBar>
      )}
      {foraDaAta > 0 && <NoticeBar tone="warning" testId="orgaos-fora-da-ata">{foraDaAta} {foraDaAta > 1 ? 'órgãos registrados' : 'órgão registrado'} sem quantidade na ata assinada. Confira os números informados.</NoticeBar>}
      {contratouAcima > 0 && <NoticeBar tone="warning" testId="contratado-acima-do-registrado">{contratouAcima} {contratouAcima > 1 ? 'órgãos contrataram' : 'órgão contratou'} mais do que o registrado no Compras.gov.br. Confira os contratos do órgão.</NoticeBar>}

      <div>
        <SectionHeader
          title="Órgãos e unidades"
          subtitle={semOrgaos ? undefined : `A linha da SENASP abre as unidades internas.${q.informado ? ' Nas linhas dos participantes, compare a ata assinada com o registrado no Compras.gov.br.' : ''}`}
          icon={<Users size={16} />}
          countBadge={semOrgaos ? undefined : linhas.length}
        />
        {semOrgaos ? (
          <>
            <EmptyState title="Nenhum órgão para mostrar" description="O Compras.gov.br não devolveu os órgãos deste item e ainda não há cópia guardada." />
            <div style={{ marginTop: '0.75rem' }}>{p.unidadesInternas}</div>
          </>
        ) : (
          <>
          <DataTable
            columns={columns}
            data={recolhidos.visiveis}
            keyExtractor={(l) => l.uasg}
            isLoading={p.loading}
            testId="quantitativos-tabela"
            renderExpanded={(l) => (l.ehSenasp ? detalheDaSenasp() : detalheDoParticipante(l))}
            expandedKeys={abertas}
            onToggleExpand={alternar}
            expandLabel={(l) => l.nome}
            rowActions={q.informado && p.podeRemanejar ? (l) => <RowActionsMenu label={`Ações de ${l.nome}`} actions={acoesDaLinha(l)} testId={`acoes-${l.uasg}`} /> : undefined}
          />
          {recolhidos.botao}
          </>
        )}
      </div>

      <InformarAtaAssinadaModal
        aberto={informando}
        itemKey={p.itemKey}
        tituloItem={p.tituloItem}
        homologado={p.homologado}
        corrigir={q.informado}
        documentoSeiAtual={q.documentoSei}
        versao={q.versaoAssinada}
        orgaos={linhas.map((l) => ({ uasg: l.uasg, nome: l.nome, nomeNaAta: l.nomeNaAta, local: l.local, registrado: l.registrado, assinada: l.orgao ? l.orgao.quantidadeAssinada : null, ehSenasp: l.ehSenasp }))}
        onFechar={() => setInformando(false)}
      />
      <ConfirmarRemanejamentoModal itemKey={p.itemKey} orgao={confirmando} quantitativos={q} nomeDe={nomeDe} onFechar={() => setConfirmando(null)} />
      <ContinuaDoOrgaoModal itemKey={p.itemKey} orgao={continuando} quantitativos={q} nomeDe={nomeDe} onFechar={() => setContinuando(null)} />
    </div>
  );
};
