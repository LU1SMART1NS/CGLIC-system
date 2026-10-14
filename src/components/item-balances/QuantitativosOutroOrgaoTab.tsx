import React from 'react';
import { Users } from 'lucide-react';
import {
  ActionButton,
  AppButton,
  AppInput,
  AppTextarea,
  DataTable,
  EmptyState,
  ErrorState,
  MetricStrip,
  Modal,
  NoticeBar,
  SectionHeader,
  StatusBadge,
  useConfirmDialog,
  useToast,
  type Column,
  type MetricStripItem
} from '../../design-system';
import { formatNumber } from './itemBalanceUtils';
import { useOrgaosRecolhidos } from './useOrgaosRecolhidos';
import { formatDataHoraBR } from '../../utils/format';
import { useAcoesQuantitativos } from '../../hooks/useQuantitativosDoItem';
import type { OrgaoQuantitativo, QuantitativosDoItem } from '../../services/quantitativosService';
import { documentoSeiValido } from '../../utils/quantitativos';
import { adesoesComInformadas, mudaramComASenasp, textoDaSituacaoSenasp, type AdesaoDaSenasp } from '../../utils/quantitativosOutroOrgao';
import { isUasgCglic } from '../../config/unidadesGestoras';
import type { AdesaoItemRecord, UnidadeItemRecord } from '../../types';
import type { OrigemUnidadesItem } from '../../hooks/useItemUnidades';
import { useCadastroUasgs } from '../../hooks/useCadastroUasgs';
import { localDaUasg } from '../../services/cadastroUasgsSyncService';

/**
 * Aba Órgãos e quantitativos nas atas de OUTROS órgãos (migration 114): a SENASP participante ou em adesão.
 * Protótipo aprovado em 13/10/2026: https://claude.ai/artifact/8UXkZrGneHn1dbrPhW1sov
 *
 * - Participante: o gestor da ata informa só a quantidade da SENASP na ata assinada. A base do saldo e o limite da
 *   alocação continuam o registrado da SENASP; o que a ata assinada dá a mais fica com a gerenciadora.
 * - Adesão: nada a informar. A linha da SENASP vem das adesões aprovadas; a adesão sem quantidade na fonte é
 *   informada à mão com o documento SEI da autorização.
 * - Os outros órgãos aparecem só com o registrado: a SENASP não acompanha o consumo deles.
 */
export interface QuantitativosOutroOrgaoTabProps {
  itemKey: string;
  tituloItem: string;
  papel: 'PARTICIPANTE' | 'ADESAO';
  /** UASG da gerenciadora da ata (outro órgão). */
  uasgGerenciadora: string;
  /** UASG da carteira da SENASP (quem participa ou aderiu), para a linha da SENASP quando ela não está na lista. */
  uasgSenasp: string;
  unidades: UnidadeItemRecord[];
  loading: boolean;
  error: string | null;
  origem: OrigemUnidadesItem;
  copiadoEm: string | null;
  /** Participante: registrado da SENASP no Compras.gov.br. Adesão: aprovado nas adesões. É a base do saldo. */
  quantidadeSenasp: number;
  contratadoSenasp: number;
  quantitativos: QuantitativosDoItem;
  /** Adesões do item (consulta 5); a aba fica só com as da SENASP. */
  adesoes: AdesaoItemRecord[];
  podeInformar: boolean;
  podeRemanejar: boolean;
  alocado: number;
  totalUnidadesInternas: number;
  /** Alocação às unidades internas: aparece ao abrir a linha da SENASP. */
  unidadesInternas: React.ReactNode;
}

interface Linha {
  uasg: string;
  nome: string;
  nomeNaAta: string;
  local: string | null;
  ehSenasp: boolean;
  gerenciadora: boolean;
  registrado: number | null;
}

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)' };
const mono: React.CSSProperties = { fontFamily: 'monospace', fontWeight: 600 };
const painel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.6rem', borderLeft: '3px solid var(--primary)', paddingLeft: '0.75rem', fontSize: '0.84rem', color: 'var(--text-secondary)' };
const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 };
const texto: React.CSSProperties = { margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' };
const TOM_BADGE = { neutral: 'neutral', info: 'info', warning: 'warning', danger: 'danger' } as const;
const dataHora = (iso: string) => formatDataHoraBR(iso.length === 19 ? `${iso}-03:00` : iso);

export const QuantitativosOutroOrgaoTab: React.FC<QuantitativosOutroOrgaoTabProps> = (p) => {
  const q = p.quantitativos;
  const toast = useToast();
  const confirm = useConfirmDialog();
  const acoes = useAcoesQuantitativos(p.itemKey);
  const [informando, setInformando] = React.useState(false);
  const [continuando, setContinuando] = React.useState(false);
  const [verRegistros, setVerRegistros] = React.useState(false);
  const [adesaoAInformar, setAdesaoAInformar] = React.useState<AdesaoDaSenasp | null>(null);

  const participante = p.papel === 'PARTICIPANTE';
  const senaspNaLista = p.unidades.find((u) => isUasgCglic(digitos(u.codigoUnidade)) && String(u.tipoUnidade ?? '').toUpperCase() !== 'GERENCIADORA');
  const uasgSenasp = senaspNaLista ? digitos(senaspNaLista.codigoUnidade) : p.uasgSenasp;
  const orgaoSenasp: OrgaoQuantitativo | null = participante && q.informado ? q.orgaos.find((o) => o.ehSenasp) ?? null : null;
  const adesoes = React.useMemo(() => (participante ? [] : adesoesComInformadas(p.adesoes, q.adesoesInformadas)), [participante, p.adesoes, q.adesoesInformadas]);
  const faltamAdesoes = adesoes.filter((a) => a.quantidade == null);
  const continuaSenasp = q.continua.find((c) => c.uasg === uasgSenasp) ?? null;

  const cadastro = useCadastroUasgs([uasgSenasp, ...p.unidades.map((u) => digitos(u.codigoUnidade))]);
  const linhas: Linha[] = React.useMemo(() => {
    const identidade = (uasg: string, nomeNaAta: string) => {
      const c = cadastro.get(uasg);
      return { nome: c?.nome ?? nomeNaAta, nomeNaAta, local: c ? localDaUasg(c) : null };
    };
    const outros = p.unidades
      .filter((u) => !(isUasgCglic(digitos(u.codigoUnidade)) && String(u.tipoUnidade ?? '').toUpperCase() !== 'GERENCIADORA'))
      .map((u) => {
        const uasg = digitos(u.codigoUnidade);
        return { uasg, ...identidade(uasg, u.nomeUnidade), ehSenasp: false, gerenciadora: String(u.tipoUnidade ?? '').toUpperCase() === 'GERENCIADORA', registrado: Number(u.quantidadeRegistrada) || 0 };
      })
      .sort((a, b) => Number(b.gerenciadora) - Number(a.gerenciadora) || (b.registrado ?? 0) - (a.registrado ?? 0));
    const senasp: Linha = {
      uasg: uasgSenasp,
      ...identidade(uasgSenasp, senaspNaLista?.nomeUnidade ?? 'SECRETARIA NACIONAL DE SEGURANCA PUBLICA - SENASP'),
      ehSenasp: true,
      gerenciadora: false,
      registrado: p.quantidadeSenasp
    };
    return [senasp, ...outros];
  }, [p.unidades, p.quantidadeSenasp, uasgSenasp, senaspNaLista?.nomeUnidade, cadastro]);
  const nomeDe = (uasg: string) => linhas.find((l) => l.uasg === uasg)?.nome ?? `UASG ${uasg}`;

  // A linha da SENASP vem aberta ao entrar na aba e ao trocar de item.
  const [abertas, setAbertas] = React.useState<Set<string>>(() => new Set([uasgSenasp]));
  React.useEffect(() => { setAbertas(new Set([uasgSenasp])); }, [p.itemKey, uasgSenasp]);
  const recolhidos = useOrgaosRecolhidos(linhas, p.itemKey);
  const alternar = (uasg: string) => setAbertas((s) => {
    const n = new Set(s);
    if (n.has(uasg)) n.delete(uasg); else n.add(uasg);
    return n;
  });

  const saldo = p.quantidadeSenasp - p.contratadoSenasp;
  const livreParaAlocar = p.quantidadeSenasp - p.alocado;
  const gerenciado = orgaoSenasp?.gerenciado ?? 0;

  if (p.error) return <ErrorState title="Não foi possível carregar os órgãos do item" message={p.error} />;

  // ---------------- Cabeçalho ----------------
  let cabecalho: React.ReactNode = null;
  if (participante && !q.informado) {
    cabecalho = (
      <NoticeBar
        tone="warning"
        testId="ata-assinada-nao-informada"
        action={p.podeInformar ? <AppButton variant="primary" size="sm" onClick={() => setInformando(true)} data-testid="informar-ata-assinada">Informar qtd. da ata assinada</AppButton> : undefined}
      >
        <StatusBadge label="Não informado" variant="neutral" size="sm" dot={false} />{' '}
        A SENASP é participante desta ata da gerenciadora UASG {p.uasgGerenciadora}. Informe a quantidade da SENASP na ata assinada para saber se a gerenciadora ainda gerencia quantidade para ela.
        {p.podeInformar ? '' : ' Quem informa é o gestor da ata.'}
      </NoticeBar>
    );
  } else if (participante) {
    cabecalho = (
      <NoticeBar
        tone="info"
        testId="ata-assinada-informada"
        action={p.podeInformar ? <AppButton variant="outline" size="sm" onClick={() => setInformando(true)} data-testid="corrigir-ata-assinada">Corrigir qtd. da ata assinada</AppButton> : undefined}
      >
        <StatusBadge label="Informado" variant="success" size="sm" dot={false} />{' '}
        Quantidade da SENASP na ata assinada informada por <b>{q.informadoPorNome}</b> em {q.informadoEm ? formatDataHoraBR(q.informadoEm) : '—'}. Documento SEI nº <b>{q.documentoSei}</b>.{' '}
        <AppButton variant="ghost" size="xs" onClick={() => setVerRegistros((v) => !v)} data-testid="ver-alteracoes-ata-assinada">
          {verRegistros ? 'Fechar alterações' : `Ver alterações (${q.registros.length})`}
        </AppButton>
      </NoticeBar>
    );
  } else if (faltamAdesoes.length > 0) {
    cabecalho = (
      <NoticeBar
        tone="warning"
        testId="adesao-sem-quantidade"
        action={p.podeInformar ? <AppButton variant="primary" size="sm" onClick={() => setAdesaoAInformar(faltamAdesoes[0])} data-testid="informar-adesao">Informar qtd. aprovada da adesão</AppButton> : undefined}
      >
        <StatusBadge label="Quantidade não informada" variant="neutral" size="sm" dot={false} />{' '}
        O Compras.gov.br não trouxe a quantidade aprovada de {faltamAdesoes.length === 1 ? 'uma adesão' : `${faltamAdesoes.length} adesões`} da SENASP. Até ser informada, essa adesão conta 0 no saldo e na alocação.
        {p.podeInformar ? '' : ' Quem informa é o gestor da ata.'}
      </NoticeBar>
    );
  } else {
    cabecalho = (
      <NoticeBar tone="info" testId="adesao-da-senasp">
        A SENASP entrou nesta ata por adesão. A quantidade da SENASP é a aprovada pela gerenciadora no Compras.gov.br. Não há ata assinada a informar.
      </NoticeBar>
    );
  }

  // ---------------- Cartões ----------------
  const cartaoAlocado: MetricStripItem = {
    label: 'Alocado às unidades',
    value: formatNumber(p.alocado),
    hint: livreParaAlocar >= 0 ? `livre para alocar ${formatNumber(livreParaAlocar)}` : `${formatNumber(-livreParaAlocar)} acima do limite`,
    tone: livreParaAlocar < 0 ? 'danger' : 'default',
    testId: 'metrica-alocado'
  };
  const cartaoContratado: MetricStripItem = { label: 'Contratado', value: formatNumber(p.contratadoSenasp), hint: 'contratos vinculados', testId: 'metrica-contratado' };
  const tomSaldo = saldo <= 0.2 * Math.max(p.quantidadeSenasp, 0) ? 'danger' : 'default';
  const metricas: MetricStripItem[] = participante
    ? q.informado && orgaoSenasp
      ? [
          { label: 'Registrado', value: formatNumber(p.quantidadeSenasp), hint: 'no Compras.gov.br', testId: 'metrica-registrado' },
          { label: 'Na ata assinada', value: formatNumber(orgaoSenasp.quantidadeAssinada), hint: 'informado', testId: 'metrica-assinada' },
          { label: `Gerenciado pela UASG ${p.uasgGerenciadora}`, value: formatNumber(gerenciado), hint: gerenciado > 0 ? 'a SENASP pode pedir o remanejamento' : 'nada a pedir à gerenciadora', tone: gerenciado > 0 ? 'warning' : 'default', testId: 'metrica-gerenciado' },
          cartaoAlocado,
          cartaoContratado,
          { label: 'Saldo', value: formatNumber(saldo), hint: `registrado − contratado${gerenciado > 0 ? ` · + ${formatNumber(gerenciado)} na gerenciadora` : ''}`, tone: tomSaldo, testId: 'metrica-saldo' }
        ]
      : [
          { label: 'Quantidade SENASP', value: formatNumber(p.quantidadeSenasp), hint: 'registrado no Compras.gov.br', testId: 'metrica-cota' },
          cartaoAlocado,
          cartaoContratado,
          { label: 'Saldo', value: formatNumber(saldo), hint: 'registrado − contratado', tone: tomSaldo, testId: 'metrica-saldo' }
        ]
    : [
        {
          label: 'Aprovado na adesão',
          value: formatNumber(p.quantidadeSenasp),
          hint: faltamAdesoes.length > 0 ? `${faltamAdesoes.length} sem quantidade, contam 0` : `${adesoes.length} ${adesoes.length === 1 ? 'adesão aprovada' : 'adesões aprovadas'}`,
          tone: faltamAdesoes.length > 0 ? 'warning' : 'default',
          testId: 'metrica-cota'
        },
        cartaoAlocado,
        cartaoContratado,
        { label: 'Saldo', value: formatNumber(saldo), hint: 'aprovado − contratado', tone: tomSaldo, testId: 'metrica-saldo' }
      ];

  // ---------------- Tabela ----------------
  const situacaoDaSenasp = orgaoSenasp ? textoDaSituacaoSenasp(orgaoSenasp, p.uasgGerenciadora) : null;
  const colunaAssinada = participante && Boolean(orgaoSenasp);
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
            {l.ehSenasp && !participante
              ? <StatusBadge label="Adesão" variant="warning" size="sm" dot={false} />
              : <StatusBadge label={l.gerenciadora ? 'Gerenciadora' : 'Participante'} variant={l.gerenciadora ? 'info' : 'neutral'} size="sm" dot={false} />}
            {l.ehSenasp && <span style={pequeno}>{p.totalUnidadesInternas} {p.totalUnidadesInternas === 1 ? 'unidade interna' : 'unidades internas'}</span>}
          </div>
        </>
      )
    },
    ...(colunaAssinada
      ? [{
          key: 'assinada',
          header: 'Qtd. na ata assinada',
          align: 'right' as const,
          render: (l: Linha) => (l.ehSenasp && orgaoSenasp ? <span style={mono}>{formatNumber(orgaoSenasp.quantidadeAssinada)}</span> : null)
        }]
      : []),
    {
      key: 'registrado',
      header: participante ? 'Registrado' : 'Registrado / aprovado',
      align: 'right',
      render: (l) => (
        <>
          <span style={mono}>{formatNumber(l.registrado ?? 0)}</span>
          {l.ehSenasp && !participante && <div style={pequeno}>aprovado na adesão</div>}
        </>
      )
    },
    ...(colunaAssinada
      ? [{
          key: 'situacao',
          header: 'Situação',
          render: (l: Linha) => (l.ehSenasp && situacaoDaSenasp ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
              <StatusBadge label={situacaoDaSenasp.rotulo} variant={TOM_BADGE[situacaoDaSenasp.tom]} size="sm" dot={false} testId={`situacao-${l.uasg}`} />
              {situacaoDaSenasp.detalhe && <span style={pequeno}>{situacaoDaSenasp.detalhe}</span>}
            </div>
          ) : null)
        }]
      : []),
    {
      key: 'contratado',
      header: 'Contratado',
      align: 'right',
      render: (l) => (l.ehSenasp ? <><span style={mono}>{formatNumber(p.contratadoSenasp)}</span><div style={pequeno}>contratos vinculados</div></> : null)
    },
    {
      key: 'saldo',
      header: 'Saldo',
      align: 'right',
      render: (l) => (l.ehSenasp ? (
        <>
          <span style={{ ...mono, fontWeight: 800, color: saldo < 0 ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>{formatNumber(saldo)}</span>
          <div style={pequeno}>{participante ? 'registrado − contratado' : 'aprovado − contratado'}</div>
          {gerenciado > 0 && <div style={pequeno}>+ {formatNumber(gerenciado)} na gerenciadora</div>}
        </>
      ) : null)
    }
  ];

  // ---------------- Detalhe da linha da SENASP ----------------
  const desfazerContinua = async () => {
    if (!(await confirm({ title: 'Desfazer "continua da SENASP"?', message: 'A redução volta a contar como definitiva.', confirmLabel: 'Desfazer' }))) return;
    try {
      await acoes.desfazerContinua.mutateAsync(uasgSenasp);
      toast.success('Desfeito.');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível desfazer.');
    }
  };

  const textoDoParticipante = (): React.ReactNode[] => {
    const o = orgaoSenasp;
    if (!o) return [];
    const partes: React.ReactNode[] = [];
    const par = mudaramComASenasp(p.unidades);
    const mesmoSegundo = o.mudou && o.mudouEm
      ? <> Última mudança do registrado no Compras.gov.br: {dataHora(o.mudouEm)}.{par.length ? <> No mesmo segundo também mudou: <b>{par.map((u) => nomeDe(digitos(u.codigoUnidade))).join(', ')}</b>.</> : ''}</>
      : null;
    if (o.situacao === 'IGUAL') partes.push(<p key="i" style={{ margin: 0 }}>O registrado da SENASP é igual à ata assinada.</p>);
    if (o.situacao === 'GERENCIADO') {
      partes.push(<p key="g" style={{ margin: 0 }}>A ata assinada dá <b>{formatNumber(o.quantidadeAssinada)}</b> à SENASP e o Compras.gov.br registra <b>{formatNumber(o.quantidadeRegistrada ?? 0)}</b>. Os <b>{formatNumber(o.gerenciado)}</b> restantes estão no registrado da gerenciadora (UASG {p.uasgGerenciadora}), que os gerencia para a SENASP. Para contratar acima do registrado, a SENASP pede o remanejamento à gerenciadora. Quando ela remanejar, o registrado da SENASP sobe e o gerenciado cai sozinho.</p>);
    }
    if (o.situacao === 'REMANEJADO_A_MENOS') {
      partes.push(<p key="r" style={{ margin: 0 }}>O registrado da SENASP foi reduzido depois do registro da ata.{mesmoSegundo} A ata assinada dá <b>{formatNumber(o.quantidadeAssinada)}</b> e o Compras.gov.br registra <b>{formatNumber(o.quantidadeRegistrada ?? 0)}</b>. Pela regra aprovada, a redução de <b>{formatNumber(o.falta)}</b> é definitiva{o.gerenciado > 0 ? <>, menos <b>{formatNumber(o.gerenciado)}</b> marcados como "continua da SENASP"</> : ''}.</p>);
    }
    if (o.situacao === 'REMANEJADO_A_MAIS') {
      partes.push(<p key="m" style={{ margin: 0 }}>O registrado da SENASP mudou depois do registro da ata e está <b>{formatNumber(o.acima)}</b> acima da ata assinada: a SENASP recebeu essa quantidade por remanejamento.{mesmoSegundo}</p>);
    }
    if (o.situacao === 'ACIMA_DA_ATA') {
      partes.push(<p key="a" style={{ margin: 0 }}>O registrado da SENASP está <b>{formatNumber(o.acima)}</b> acima da ata assinada e não mudou desde o registro da ata. Confira o número informado.</p>);
    }
    if (o.situacao === 'FORA_DA_ATA') {
      partes.push(<p key="f" style={{ margin: 0 }}>A SENASP está registrada no Compras.gov.br, mas a quantidade informada da ata assinada é 0. Confira o número informado.</p>);
    }
    if (continuaSenasp) {
      partes.push(<p key="c" style={{ margin: 0 }}><b>{continuaSenasp.marcadoPorNome}</b> marcou em {formatDataHoraBR(continuaSenasp.marcadoEm)} que {formatNumber(continuaSenasp.quantidade)} continuam da SENASP: “{continuaSenasp.justificativa}”</p>);
    }
    if (p.podeRemanejar && o.situacao === 'REMANEJADO_A_MENOS') {
      partes.push(
        <div key="acoes" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {continuaSenasp
            ? <AppButton variant="outline" size="xs" onClick={desfazerContinua} data-testid="desfazer-continua-senasp">Desfazer "continua da SENASP"</AppButton>
            : <AppButton variant="outline" size="xs" onClick={() => setContinuando(true)} data-testid="continua-senasp">Continua da SENASP</AppButton>}
          <span style={pequeno}>Use quando a SENASP não abriu mão da quantidade, por exemplo se a gerenciadora reduziu por engano.</span>
        </div>
      );
    }
    return partes;
  };

  const tabelaDeAdesoes = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }} data-testid="adesoes-da-senasp">
      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Adesões aprovadas da SENASP ({adesoes.length})</div>
      {adesoes.length === 0 ? (
        <span style={pequeno}>Nenhuma adesão da SENASP na lista do Compras.gov.br.</span>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.35rem 0.6rem' }}>Aprovada em</th>
                <th style={{ padding: '0.35rem 0.6rem' }}>UASG</th>
                <th style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>Quantidade</th>
                <th style={{ padding: '0.35rem 0.6rem' }}>Fonte</th>
                {p.podeInformar && <th style={{ padding: '0.35rem 0.6rem' }} aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {adesoes.map((a) => (
                <tr key={`${a.uasg}-${a.aprovadaEm}`} style={{ borderTop: '1px solid var(--border)' }} data-testid={`adesao-${a.aprovadaEm}`}>
                  <td style={{ padding: '0.35rem 0.6rem', ...mono }}>{a.aprovadaEm ? dataHora(a.aprovadaEm) : '—'}</td>
                  <td style={{ padding: '0.35rem 0.6rem' }}>{a.uasg}</td>
                  <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', ...mono }}>{a.quantidade == null ? '—' : formatNumber(a.quantidade)}</td>
                  <td style={{ padding: '0.35rem 0.6rem' }}>
                    {a.quantidadeFonte != null
                      ? 'Compras.gov.br'
                      : a.informada
                        ? <span>Informada por <b>{a.informada.informadoPorNome}</b> em {formatDataHoraBR(a.informada.informadoEm)} · SEI nº {a.informada.documentoSei}</span>
                        : <StatusBadge label="Sem quantidade na fonte" variant="warning" size="sm" dot={false} />}
                  </td>
                  {p.podeInformar && (
                    <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right' }}>
                      {a.quantidadeFonte == null && (
                        <AppButton variant="outline" size="xs" onClick={() => setAdesaoAInformar(a)} data-testid={`informar-adesao-${a.aprovadaEm}`}>
                          {a.informada ? 'Corrigir' : 'Informar'}
                        </AppButton>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border)', fontWeight: 800 }}>
                <td style={{ padding: '0.35rem 0.6rem' }} colSpan={2}>Total</td>
                <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', ...mono }}>{formatNumber(adesoes.reduce((s, a) => s + (a.quantidade ?? 0), 0))}</td>
                <td colSpan={p.podeInformar ? 2 : 1} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <span style={pequeno}>Cada adesão aprovada pela gerenciadora soma na quantidade da SENASP. Na adesão não há remanejamento.</span>
    </div>
  );

  const detalheDaSenasp = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {participante ? (textoDoParticipante().length > 0 && <div style={painel}>{textoDoParticipante()}</div>) : tabelaDeAdesoes()}
      <span style={pequeno}>
        {participante
          ? `Limite da alocação: registrado da SENASP, ${formatNumber(p.quantidadeSenasp)}. A ata assinada não aumenta o limite: só o remanejamento da gerenciadora aumenta.`
          : `Limite da alocação: aprovado nas adesões, ${formatNumber(p.quantidadeSenasp)}.`}
      </span>
      {p.unidadesInternas}
    </div>
  );

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
              <b>{formatDataHoraBR(r.informadoEm)}</b> · {r.informadoPorNome} · documento SEI nº {r.documentoSei} · SENASP {formatNumber(r.total)} · {r.justificativa ? `“${r.justificativa}”` : 'primeiro registro'}
            </div>
          ))}
        </div>
      )}
      <MetricStrip title="SENASP neste item" items={metricas} testId="quantitativos-metricas" />

      <div>
        <SectionHeader
          title="Órgãos e unidades"
          subtitle={`A linha da SENASP abre as unidades internas. ${participante
            ? 'Nesta ata de outro órgão, só a SENASP tem quantidade da ata assinada.'
            : 'Na adesão, a linha da SENASP vem das adesões aprovadas, porque a SENASP não está entre os órgãos da ata.'} Dos outros órgãos, só o registrado: a SENASP não acompanha o consumo deles.`}
          icon={<Users size={16} />}
          countBadge={linhas.length}
        />
        {!p.loading && linhas.length === 1 && p.unidades.length === 0 && (
          <div style={{ marginBottom: '0.5rem' }}>
            <EmptyState title="Os outros órgãos não vieram" description="O Compras.gov.br não devolveu os órgãos deste item e ainda não há cópia guardada." />
          </div>
        )}
        <DataTable
          columns={columns}
          data={recolhidos.visiveis}
          keyExtractor={(l) => l.uasg}
          isLoading={p.loading}
          testId="quantitativos-tabela"
          renderExpanded={() => detalheDaSenasp()}
          canExpand={(l) => l.ehSenasp}
          expandedKeys={abertas}
          onToggleExpand={alternar}
          expandLabel={(l) => l.nome}
        />
        {recolhidos.botao}
      </div>

      {participante && (
        <InformarQtdSenaspModal
          aberto={informando}
          itemKey={p.itemKey}
          tituloItem={p.tituloItem}
          uasgSenasp={uasgSenasp}
          nomeSenasp={senaspNaLista ? null : nomeDe(uasgSenasp)}
          registrado={p.quantidadeSenasp}
          atual={orgaoSenasp?.quantidadeAssinada ?? null}
          corrigir={q.informado}
          documentoSeiAtual={q.documentoSei}
          onFechar={() => setInformando(false)}
        />
      )}
      {participante && orgaoSenasp && (
        <ContinuaDaSenaspModal aberto={continuando} itemKey={p.itemKey} uasgSenasp={uasgSenasp} maximo={orgaoSenasp.resto} onFechar={() => setContinuando(false)} />
      )}
      {!participante && (
        <InformarAdesaoModal itemKey={p.itemKey} adesao={adesaoAInformar} onFechar={() => setAdesaoAInformar(null)} />
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------------------------
// Janelas
// ------------------------------------------------------------------------------------------------

/** Quantidade da SENASP na ata assinada de outro órgão — gestor da ata ou coordenador. */
const InformarQtdSenaspModal: React.FC<{
  aberto: boolean;
  itemKey: string;
  tituloItem: string;
  uasgSenasp: string;
  /** Nome a gravar quando a SENASP não está na lista do Compras.gov.br. */
  nomeSenasp: string | null;
  registrado: number;
  atual: number | null;
  corrigir: boolean;
  documentoSeiAtual: string | null;
  onFechar: () => void;
}> = ({ aberto, itemKey, tituloItem, uasgSenasp, nomeSenasp, registrado, atual, corrigir, documentoSeiAtual, onFechar }) => {
  const toast = useToast();
  const { informar } = useAcoesQuantitativos(itemKey);
  const [quantidade, setQuantidade] = React.useState('');
  const [documento, setDocumento] = React.useState('');
  const [justificativa, setJustificativa] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    setQuantidade(atual != null ? String(atual) : '');
    setDocumento(documentoSeiAtual ?? '');
    setJustificativa('');
    setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const gravar = async () => {
    setErro(null);
    if (!/^\d+$/.test(quantidade)) return setErro('Informe a quantidade da SENASP na ata assinada (número inteiro, 0 se ela não está na ata).');
    if (!documentoSeiValido(documento)) return setErro('O número do documento SEI tem 8 dígitos (ex.: 12345678).');
    if (corrigir && justificativa.trim().length < 15) return setErro('Escreva a justificativa da correção (mínimo de 15 caracteres).');
    try {
      await informar.mutateAsync({ quantidades: [{ uasg: uasgSenasp, quantidade: Number(quantidade), nome: nomeSenasp }], documentoSei: documento, justificativa: corrigir ? justificativa : null });
      toast.success(corrigir ? 'Quantidade da ata assinada corrigida.' : 'Quantidade da ata assinada informada.');
      onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível gravar a quantidade.');
    }
  };

  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      dismissible={!informar.isPending}
      size="md"
      title={corrigir ? 'Corrigir qtd. da ata assinada' : 'Informar qtd. da ata assinada'}
      subtitle={`${tituloItem} · na ata de outro órgão, só a quantidade da SENASP`}
      testId="informar-ata-assinada"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={informar.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={informar.isPending} data-testid="informar-ata-assinada-gravar">
            {informar.isPending ? 'Gravando…' : 'Gravar'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <label style={campo}>
          Qtd. da SENASP na ata assinada
          <AppInput inputMode="numeric" value={quantidade} placeholder={String(registrado)} style={{ width: 150 }}
            onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))} data-testid="informar-qtd-senasp" />
          <span style={{ ...pequeno, fontWeight: 400 }}>Registrado hoje no Compras.gov.br: {formatNumber(registrado)}</span>
        </label>
        <label style={campo}>
          Número do documento SEI da ata assinada (8 dígitos)
          <AppInput inputMode="numeric" maxLength={8} placeholder="12345678" value={documento} style={{ width: 150 }}
            onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))} data-testid="informar-documento-sei" />
        </label>
        {corrigir && (
          <label style={campo}>
            Justificativa da correção (obrigatória)
            <AppTextarea rows={3} placeholder="Por que a quantidade mudou" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} data-testid="informar-justificativa" />
          </label>
        )}
        {erro && <NoticeBar tone="danger" testId="informar-erro">{erro}</NoticeBar>}
      </div>
    </Modal>
  );
};

/** Parte da redução do registrado da SENASP que ela não cedeu — gestor de saldo ou coordenador. */
const ContinuaDaSenaspModal: React.FC<{ aberto: boolean; itemKey: string; uasgSenasp: string; maximo: number; onFechar: () => void }> = ({ aberto, itemKey, uasgSenasp, maximo, onFechar }) => {
  const toast = useToast();
  const { marcarContinua } = useAcoesQuantitativos(itemKey);
  const [quantidade, setQuantidade] = React.useState('');
  const [justificativa, setJustificativa] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    setQuantidade(String(maximo));
    setJustificativa('');
    setErro(null);
  }, [aberto, maximo]);

  const gravar = async () => {
    setErro(null);
    const n = Number(quantidade);
    if (!/^\d+$/.test(quantidade) || n < 1 || n > maximo) return setErro(`A quantidade vai de 1 a ${formatNumber(maximo)}.`);
    if (justificativa.trim().length < 15) return setErro('Escreva a justificativa (mínimo de 15 caracteres).');
    try {
      await marcarContinua.mutateAsync({ uasg: uasgSenasp, quantidade: n, justificativa });
      toast.success('Marcado que a quantidade continua da SENASP.');
      onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível gravar.');
    }
  };

  return (
    <Modal
      isOpen={aberto}
      onClose={onFechar}
      dismissible={!marcarContinua.isPending}
      size="md"
      title="Continua da SENASP"
      subtitle={`UASG ${uasgSenasp}`}
      testId="continua-senasp-janela"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={marcarContinua.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={marcarContinua.isPending} data-testid="continua-senasp-gravar">
            {marcarContinua.isPending ? 'Gravando…' : 'Gravar'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <p style={texto}>Informe quanto da redução a SENASP não cedeu. Essa parte passa a contar como gerenciada pela gerenciadora para a SENASP; o resto continua como remanejamento definitivo. O limite da alocação não muda.</p>
        <label style={campo}>
          Quantidade que continua da SENASP (até {formatNumber(maximo)})
          <AppInput inputMode="numeric" value={quantidade} style={{ width: 130 }} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))} data-testid="continua-senasp-quantidade" />
        </label>
        <label style={campo}>
          Justificativa (obrigatória)
          <AppTextarea rows={3} placeholder="Ex.: a gerenciadora reduziu por engano; pedido de correção no SEI 12345678" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} data-testid="continua-senasp-justificativa" />
        </label>
        {erro && <NoticeBar tone="danger" testId="continua-senasp-erro">{erro}</NoticeBar>}
      </div>
    </Modal>
  );
};

/** Quantidade aprovada de uma adesão da SENASP sem quantidade no Compras.gov.br — gestor da ata ou coordenador. */
const InformarAdesaoModal: React.FC<{ itemKey: string; adesao: AdesaoDaSenasp | null; onFechar: () => void }> = ({ itemKey, adesao, onFechar }) => {
  const toast = useToast();
  const { informarAdesao } = useAcoesQuantitativos(itemKey);
  const [quantidade, setQuantidade] = React.useState('');
  const [documento, setDocumento] = React.useState('');
  const [justificativa, setJustificativa] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  const corrigir = Boolean(adesao?.informada);

  React.useEffect(() => {
    if (!adesao) return;
    setQuantidade(adesao.informada ? String(adesao.informada.quantidade) : '');
    setDocumento(adesao.informada?.documentoSei ?? '');
    setJustificativa('');
    setErro(null);
  }, [adesao?.uasg, adesao?.aprovadaEm]); // eslint-disable-line react-hooks/exhaustive-deps

  const gravar = async () => {
    if (!adesao) return;
    setErro(null);
    if (!/^\d+$/.test(quantidade) || Number(quantidade) < 1) return setErro('Informe a quantidade aprovada (número inteiro maior que zero).');
    if (!documentoSeiValido(documento)) return setErro('O número do documento SEI tem 8 dígitos (ex.: 12345678).');
    if (corrigir && justificativa.trim().length < 15) return setErro('Escreva a justificativa da correção (mínimo de 15 caracteres).');
    try {
      await informarAdesao.mutateAsync({ uasg: adesao.uasg, aprovadaEm: adesao.aprovadaEm, quantidade: Number(quantidade), documentoSei: documento, justificativa: corrigir ? justificativa : null });
      toast.success('Quantidade aprovada da adesão gravada.');
      onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível gravar a quantidade.');
    }
  };

  return (
    <Modal
      isOpen={Boolean(adesao)}
      onClose={onFechar}
      dismissible={!informarAdesao.isPending}
      size="md"
      title={corrigir ? 'Corrigir qtd. aprovada da adesão' : 'Informar qtd. aprovada da adesão'}
      subtitle={adesao ? `Adesão da UASG ${adesao.uasg} aprovada em ${dataHora(adesao.aprovadaEm)}` : undefined}
      testId="informar-adesao-janela"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={informarAdesao.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={informarAdesao.isPending} data-testid="informar-adesao-gravar">
            {informarAdesao.isPending ? 'Gravando…' : 'Gravar'}
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        <p style={texto}>Só para a adesão que o Compras.gov.br trouxe sem quantidade. Quando a fonte trouxer o número, vale o da fonte.</p>
        <label style={campo}>
          Quantidade aprovada
          <AppInput inputMode="numeric" value={quantidade} style={{ width: 130 }} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))} data-testid="informar-adesao-quantidade" />
        </label>
        <label style={campo}>
          Número do documento SEI da autorização da adesão (8 dígitos)
          <AppInput inputMode="numeric" maxLength={8} placeholder="12345678" value={documento} style={{ width: 150 }}
            onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ''))} data-testid="informar-adesao-documento" />
        </label>
        {corrigir && (
          <label style={campo}>
            Justificativa da correção (obrigatória)
            <AppTextarea rows={3} placeholder="Por que a quantidade mudou" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} data-testid="informar-adesao-justificativa" />
          </label>
        )}
        {erro && <NoticeBar tone="danger" testId="informar-adesao-erro">{erro}</NoticeBar>}
      </div>
    </Modal>
  );
};
