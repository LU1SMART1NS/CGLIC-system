import React from 'react';
import { ActionButton, AppButton, AppInput, AppTextarea, Modal, NoticeBar, useToast } from '../../design-system';
import { useAcoesQuantitativos } from '../../hooks/useQuantitativosDoItem';
import { useCadastroUasgs } from '../../hooks/useCadastroUasgs';
import { useReservadoDoItem } from '../../hooks/useEmendas';
import type { OrgaoQuantitativo, QuantitativosDoItem, RemanejamentoNaoParticipante } from '../../services/quantitativosService';
import type { AdesaoItemRecord } from '../../types';
import { documentoSeiValido } from '../../utils/quantitativos';
import { toSentenceCaseIfAllCaps } from '../../utils/textCase';
import { folgaDasUnidades, ROTULO_MOTIVO_DO_MINIMO } from '../../utils/alocacaoEdicao';
import { adesoesNoLimite, livreNaOrigem, regrasDoRemanejamento, uasgDaAdesao, usadoNoLimite, type RegraDoLimite } from '../../utils/remanejamentoNaoParticipante';
import type { AllocationRow } from './AllocationsTab';
import { DESTINO_VAZIO, EscolherOrgaoDestino, type DestinoEscolhido, type OrgaoSugerido } from './EscolherOrgaoDestino';
import { QuantidadeComMaximo } from './QuantidadeComMaximo';
import { formatNumber } from './itemBalanceUtils';

export interface OrigemDoRemanejamento {
  uasg: string;
  nome: string;
  orgao: OrgaoQuantitativo;
  /** Contratado do participante no Contratos.gov.br (0 sem fonte). */
  contratado: number;
}

interface Props {
  itemKey: string;
  origem: OrigemDoRemanejamento | null;
  quantitativos: QuantitativosDoItem;
  adesoes: AdesaoItemRecord[];
  homologado: number;
  limiteAdesao: number;
  /** Base do saldo da SENASP (cota própria) e o alocado às unidades internas. */
  baseSaldo: number;
  alocado: number;
  /** Unidades internas do item com contratado e empenhado: "Onde dá para diminuir" na cota SENASP. */
  unidadesAlocadas?: AllocationRow[];
  /** UASGs do item (gerenciadora e participantes): não podem ser destino. */
  participantes: Set<string>;
  onFechar: () => void;
}

const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 };
const texto: React.CSSProperties = { fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 };
const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 };
const mono: React.CSSProperties = { fontFamily: 'monospace', fontWeight: 600 };
const th: React.CSSProperties = { textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', padding: '0.3rem 0.5rem', borderBottom: '1px solid var(--border)' };
const td: React.CSSProperties = { padding: '0.4rem 0.5rem', borderBottom: '1px solid var(--border)', fontSize: '0.84rem' };
const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

/** Nome curto de cada regra, na lista com ✓ e ✕. */
const NOME_DA_REGRA: Record<RegraDoLimite['chave'], (senasp: boolean) => string> = {
  ORIGEM: (senasp) => (senasp ? 'Livre na cota da SENASP' : 'Livre no órgão que cede'),
  POR_ORGAO: () => 'Este órgão ainda pode receber (até 50% do item)',
  TOTAL: () => 'Ainda cabe no limite de adesão do item'
};

/** Por que o máximo é esse, numa frase, para a regra que limita. */
function motivoDaRegra(r: RegraDoLimite, p: { senasp: boolean; homologado: number; usadoUasg: number; limiteAdesao: number }): string {
  if (r.chave === 'ORIGEM') {
    return p.senasp
      ? `A cota da SENASP só tem ${formatNumber(r.livre)} livres. O resto está alocado às unidades internas.`
      : `O órgão que cede só tem ${formatNumber(r.livre)} livres.`;
  }
  if (r.chave === 'POR_ORGAO') {
    return r.livre === 0
      ? 'Este órgão já chegou a 50% do item e não pode receber mais.'
      : `Cada órgão pode receber até 50% do item (${formatNumber(p.homologado / 2)}). Este já tem ${formatNumber(p.usadoUasg)}.`;
  }
  return `O item só aceita mais ${formatNumber(r.livre)} em adesões e remanejamentos (limite de ${formatNumber(p.limiteAdesao)}).`;
}

/**
 * Remanejar para órgão não participante (migration 219): gestor de saldo ou coordenador. A quantidade sai da ata
 * e conta no limite de adesão; da SENASP, diminui a cota própria e o limite da alocação.
 */
export const RemanejarNaoParticipanteModal: React.FC<Props> = (p) => {
  const toast = useToast();
  const { remanejarNaoParticipante: remanejar } = useAcoesQuantitativos(p.itemKey);
  const q = p.quantitativos;
  const o = p.origem?.orgao ?? null;
  const senasp = Boolean(o?.ehSenasp);
  const [destino, setDestino] = React.useState<DestinoEscolhido>(DESTINO_VAZIO);
  const [nomeDigitado, setNomeDigitado] = React.useState('');
  const [quantidade, setQuantidade] = React.useState('');
  const [documento, setDocumento] = React.useState('');
  const [justificativa, setJustificativa] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDestino(DESTINO_VAZIO); setNomeDigitado(''); setQuantidade(''); setDocumento(''); setJustificativa(''); setErro(null);
  }, [p.origem?.uasg]);

  const cadastroOrigem = useCadastroUasgs(p.origem ? [p.origem.uasg] : []).get(p.origem?.uasg ?? '');
  const reservado = useReservadoDoItem(p.itemKey, { enabled: Boolean(p.origem) && senasp });
  const uasg = destino.uasg;
  const participante = /^\d{6}$/.test(uasg) && (p.participantes.has(uasg) || uasg === p.origem?.uasg);
  const destinoValido = /^\d{6}$/.test(uasg) && !participante && destino.busca !== 'buscando';
  const precisaDoNome = destinoValido && (destino.busca === 'nao-encontrada' || destino.busca === 'falhou');
  const nomeDestino = precisaDoNome ? nomeDigitado.trim() : destino.nome;

  const mudarDestino = (d: DestinoEscolhido) => { setDestino(d); setNomeDigitado(''); setErro(null); };

  const adesoes = React.useMemo(() => adesoesNoLimite(p.adesoes, q.remanejamentosNaoParticipante, q.adesoesConferidas), [p.adesoes, q.remanejamentosNaoParticipante, q.adesoesConferidas]);
  // Órgãos que já receberam adesão ou remanejamento neste item: aparecem primeiro na busca.
  const sugeridos = React.useMemo<OrgaoSugerido[]>(() => {
    const mapa = new Map<string, OrgaoSugerido>();
    for (const r of q.remanejamentosNaoParticipante) {
      const atual = mapa.get(r.uasgDestino);
      mapa.set(r.uasgDestino, { uasg: r.uasgDestino, nome: atual?.nome ?? r.nomeDestino, detalhe: `${atual ? `${atual.detalhe} · ` : ''}remanejado ${formatNumber(r.quantidade)}` });
    }
    for (const a of p.adesoes) {
      const u = uasgDaAdesao(a);
      if (!u) continue;
      const nome = (a.unidadeNaoParticipante || '').replace(/^\s*\d{6}\s*-\s*/, '').trim() || `UASG ${u}`;
      const atual = mapa.get(u);
      mapa.set(u, { uasg: u, nome: atual?.nome ?? toSentenceCaseIfAllCaps(nome), detalhe: `${atual ? `${atual.detalhe} · ` : ''}adesão ${formatNumber(Number(a.quantidadeAprovadaAdesao) || 0)}` });
    }
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [q.remanejamentosNaoParticipante, p.adesoes]);

  const livre = o ? livreNaOrigem({ orgao: o, baseSaldo: p.baseSaldo, alocado: p.alocado, contratado: p.origem?.contratado ?? 0 }) : 0;
  const contaOrigem = !o ? '' : senasp
    ? `cota ${formatNumber(p.baseSaldo)} − alocado às unidades ${formatNumber(p.alocado)}`
    : [
        `registrado ${formatNumber(o.quantidadeRegistrada ?? 0)}`,
        o.resto > 0 ? `+ redução sem destino ${formatNumber(o.resto)}` : '',
        p.origem?.contratado ? `− contratado ${formatNumber(p.origem.contratado)}` : '',
        o.naoParticipanteAguardaFonte > 0 ? `− já remanejado ${formatNumber(o.naoParticipanteAguardaFonte)}` : ''
      ].filter(Boolean).join(' ');
  const regras = regrasDoRemanejamento({
    origem: { livre, conta: contaOrigem },
    destino: destinoValido ? uasg : null,
    homologado: p.homologado,
    limiteAdesao: p.limiteAdesao,
    adesoes,
    remanejamentos: q.remanejamentosNaoParticipante,
    fmt: formatNumber
  });
  const qtd = /^\d+$/.test(quantidade) ? Number(quantidade) : 0;
  const maximo = Math.min(...regras.map((r) => r.livre));
  const limita = regras.find((r) => r.livre === maximo)!;
  const quebradas = qtd > 0 ? regras.filter((r) => qtd > r.livre) : [];
  const usadoUasg = destinoValido ? usadoNoLimite(adesoes, q.remanejamentosNaoParticipante, uasg).total : 0;
  const usadoTotal = usadoNoLimite(adesoes, q.remanejamentosNaoParticipante).total;
  const motivo = motivoDaRegra(limita, { senasp, homologado: p.homologado, usadoUasg, limiteAdesao: p.limiteAdesao });

  // Cota SENASP sem livre para a quantidade: onde dá para diminuir a alocação das unidades (decisão D5).
  const origemQuebrou = senasp && qtd > livre;
  const folgas = React.useMemo(
    () => (origemQuebrou && p.unidadesAlocadas && reservado.data != null ? folgaDasUnidades(p.unidadesAlocadas, reservado.data) : null),
    [origemQuebrou, p.unidadesAlocadas, reservado.data]
  );
  const falta = qtd - livre;
  const podeLiberar = folgas?.reduce((s, f) => s + f.podeDiminuir, 0) ?? 0;

  const irParaAlocacao = () => {
    p.onFechar();
    window.setTimeout(() => document.querySelector('[data-testid="allocations-tab"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const gravar = async () => {
    if (!o || !p.origem) return;
    setErro(null);
    if (!/^\d{6}$/.test(uasg)) return setErro('Escolha o órgão de destino.');
    if (participante) return setErro('Esta UASG é participante do item. Use o remanejamento entre participantes, na linha do órgão.');
    if (destino.busca === 'buscando') return setErro('Aguarde: buscando o nome da UASG no Compras.gov.br.');
    if (!nomeDestino) return setErro('Escreva o nome do órgão (não veio do Compras.gov.br).');
    if (qtd < 1) return setErro('Informe a quantidade.');
    if (quebradas.length > 0) return setErro(maximo === 0 ? 'Não dá para remanejar agora.' : `Você pode remanejar no máximo ${formatNumber(maximo)}.`);
    if (!documentoSeiValido(documento)) return setErro('O número do documento SEI tem 8 dígitos (ex.: 12345678).');
    if (justificativa.trim().length < 15) return setErro('Escreva a justificativa (mínimo de 15 caracteres).');
    try {
      await remanejar.mutateAsync({ uasgOrigem: p.origem.uasg, uasgDestino: uasg, nomeDestino, quantidade: qtd, documentoSei: documento, justificativa });
      toast.success('Remanejamento registrado.');
      p.onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível registrar o remanejamento.');
    }
  };

  return (
    <Modal
      isOpen={Boolean(p.origem)}
      onClose={p.onFechar}
      dismissible={!remanejar.isPending}
      size="md"
      title="Remanejar para órgão não participante"
      subtitle={p.origem ? `De ${p.origem.nome} · UASG ${p.origem.uasg}` : undefined}
      testId="remanejar-nao-participante"
      footer={
        <>
          <ActionButton action="cancelar" onClick={p.onFechar} disabled={remanejar.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={remanejar.isPending} data-testid="remanejar-np-gravar">
            {remanejar.isPending ? 'Gravando…' : 'Remanejar'}
          </AppButton>
        </>
      }
    >
      {o && p.origem && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <EscolherOrgaoDestino
            key={p.origem.uasg}
            destino={destino}
            onMudar={mudarDestino}
            uasgOrigem={p.origem.uasg}
            participantes={p.participantes}
            sugeridos={sugeridos}
            ufInicial={cadastroOrigem?.siglaUf ?? null}
            avisoDoEscolhido={usadoUasg > 0 ? `Já tem ${formatNumber(usadoUasg)} em adesões neste item.` : null}
          />
          {precisaDoNome && (
            <label style={campo}>
              Nome do órgão · UASG {uasg}
              <span style={pequeno}>{destino.busca === 'falhou' ? 'O Compras.gov.br não respondeu agora.' : 'A UASG não foi achada no cadastro do Compras.gov.br. Confira o número.'} Se estiver certo, escreva o nome.</span>
              <AppInput value={nomeDigitado} onChange={(e) => setNomeDigitado(e.target.value)} data-testid="remanejar-np-nome" />
            </label>
          )}
          <QuantidadeComMaximo
            rotulo="Quantidade"
            valor={quantidade}
            onMudar={(v) => { setQuantidade(v); setErro(null); }}
            maximo={maximo}
            verbo="remanejar"
            motivo={motivo}
            testId="remanejar-np-quantidade"
            disabled={remanejar.isPending}
          />
          {folgas && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }} data-testid="remanejar-np-folga">
              <b style={{ fontSize: '0.88rem' }}>Onde dá para diminuir</b>
              <span style={pequeno}>Preso é o maior entre contratado, empenhado e reservado a parlamentares: essa parte não sai da unidade.</span>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr><th style={th}>Unidade</th><th style={{ ...th, ...num }}>Alocado</th><th style={{ ...th, ...num }}>Preso</th><th style={{ ...th, ...num }}>Pode diminuir</th></tr>
                  </thead>
                  <tbody>
                    {folgas.map((f) => (
                      <tr key={f.unitName} data-testid={`folga-${f.unitName}`}>
                        <td style={td}>{f.unitName}</td>
                        <td style={{ ...td, ...num }}>{formatNumber(f.alocado)}</td>
                        <td style={{ ...td, ...num }}>
                          {formatNumber(f.preso)}
                          {f.motivo && <span style={{ ...pequeno, display: 'block' }}>{ROTULO_MOTIVO_DO_MINIMO[f.motivo]}</span>}
                        </td>
                        <td style={{ ...td, ...num, fontWeight: 700, color: f.podeDiminuir > 0 ? 'var(--color-success-text)' : 'var(--text-muted)' }}>{formatNumber(f.podeDiminuir)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {podeLiberar >= falta ? (
                <NoticeBar
                  tone="warning"
                  testId="remanejar-np-folga-da"
                  action={<AppButton variant="secondary" size="sm" onClick={irParaAlocacao}>Ir para a alocação</AppButton>}
                >
                  Para remanejar {formatNumber(qtd)}, diminua {formatNumber(falta)} na alocação das unidades acima. Elas podem liberar até {formatNumber(podeLiberar)}.
                </NoticeBar>
              ) : (
                <NoticeBar tone="danger" testId="remanejar-np-folga-nao-da">
                  Mesmo diminuindo tudo o que está livre nas unidades ({formatNumber(podeLiberar)}), não chega aos {formatNumber(falta)} que faltam. O máximo para remanejar é {formatNumber(livre + podeLiberar)}.
                </NoticeBar>
              )}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }} aria-live="polite" data-testid="remanejar-np-regras">
            {regras.map((r) => {
              const quebrou = qtd > r.livre;
              return (
                <div key={r.chave} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0,1fr) auto', gap: '0.4rem', fontSize: '0.84rem', color: quebrou ? 'var(--color-danger-text)' : undefined }} data-testid={`regra-${r.chave}`}>
                  <span aria-label={quebrou ? 'não passa' : 'passa'} style={{ color: quebrou ? 'var(--color-danger-text)' : 'var(--color-success-text)', fontWeight: 700 }}>{quebrou ? '✕' : '✓'}</span>
                  <span>{NOME_DA_REGRA[r.chave](senasp)}</span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(r.livre)}</b>
                </div>
              );
            })}
            {!destinoValido && <span style={pequeno}>Os limites de 50% por órgão e de adesão aparecem quando você escolher o órgão de destino.</span>}
            <details>
              <summary style={{ ...pequeno, cursor: 'pointer' }}>Ver a conta</summary>
              <div style={{ ...pequeno, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }} data-testid="remanejar-np-contas">
                {regras.map((r) => <span key={r.chave}>{NOME_DA_REGRA[r.chave](senasp)}: {r.conta} = {formatNumber(r.livre)}</span>)}
              </div>
            </details>
          </div>
          <label style={campo}>
            Documento SEI da autorização (8 dígitos)
            <AppInput inputMode="numeric" value={documento} style={{ width: 150 }} placeholder="12345678" onChange={(e) => setDocumento(e.target.value.replace(/\D/g, '').slice(0, 8))} data-testid="remanejar-np-sei" />
            <span style={pequeno}>A autorização da SENASP, com a concordância do órgão que cede.</span>
          </label>
          <label style={campo}>
            Justificativa (obrigatória)
            <AppTextarea rows={3} placeholder="Ex.: ofício do órgão pedindo o remanejamento para a Polícia Penal de SP" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} data-testid="remanejar-np-justificativa" />
          </label>
          {destinoValido && nomeDestino && qtd > 0 && quebradas.length === 0 && (
            <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.84rem' }} data-testid="remanejar-np-resumo">
              <b>O que muda ao gravar</b>
              {senasp ? (
                <>
                  <Linha rotulo="Cota própria da SENASP" valor={`${formatNumber(p.baseSaldo)} → ${formatNumber(p.baseSaldo - qtd)}`} />
                  <Linha rotulo="Livre para alocar" valor={`${formatNumber(p.baseSaldo - p.alocado)} → ${formatNumber(p.baseSaldo - qtd - p.alocado)}`} />
                </>
              ) : (
                <>
                  <Linha rotulo={`Livre em ${p.origem.nome}`} valor={`${formatNumber(livre)} → ${formatNumber(livre - qtd)}`} />
                  <Linha rotulo="Cota própria da SENASP" valor={`não muda (${formatNumber(p.baseSaldo)})`} />
                </>
              )}
              <Linha rotulo="Limite de adesão usado" valor={`${formatNumber(usadoTotal)} → ${formatNumber(usadoTotal + qtd)} de ${formatNumber(p.limiteAdesao)}`} />
              <Linha rotulo={nomeDestino} valor={`${formatNumber(usadoUasg)} → ${formatNumber(usadoUasg + qtd)} (${formatNumber(p.homologado > 0 ? ((usadoUasg + qtd) / p.homologado) * 100 : 0)}% do item)`} />
            </div>
          )}
          <p style={texto}>A quantidade sai da ata e conta no limite de adesão. Dá para desfazer.</p>
          {erro && <NoticeBar tone="danger" testId="remanejar-np-erro">{erro}</NoticeBar>}
        </div>
      )}
    </Modal>
  );
};

const Linha: React.FC<{ rotulo: string; valor: string }> = ({ rotulo, valor }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
    <span>{rotulo}</span>
    <span style={{ ...mono, whiteSpace: 'nowrap' }}>{valor}</span>
  </div>
);

/** Desfazer um remanejamento para não participante: a quantidade volta para quem cedeu e sai do limite de adesão. */
export const DesfazerNaoParticipanteModal: React.FC<{
  itemKey: string;
  remanejamento: RemanejamentoNaoParticipante | null;
  nomeDe: (uasg: string) => string;
  onFechar: () => void;
}> = ({ itemKey, remanejamento: r, nomeDe, onFechar }) => {
  const toast = useToast();
  const { desfazerNaoParticipante: desfazer } = useAcoesQuantitativos(itemKey);
  const [justificativa, setJustificativa] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  React.useEffect(() => { setJustificativa(''); setErro(null); }, [r?.id]);

  const gravar = async () => {
    if (!r) return;
    setErro(null);
    if (justificativa.trim().length < 15) return setErro('Escreva a justificativa (mínimo de 15 caracteres).');
    try {
      await desfazer.mutateAsync({ id: r.id, justificativa });
      toast.success('Remanejamento desfeito.');
      onFechar();
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível desfazer.');
    }
  };

  return (
    <Modal
      isOpen={Boolean(r)}
      onClose={onFechar}
      dismissible={!desfazer.isPending}
      size="sm"
      title="Desfazer remanejamento"
      subtitle={r ? `${formatNumber(r.quantidade)} de ${nomeDe(r.uasgOrigem)} para ${r.nomeDestino}` : undefined}
      testId="desfazer-nao-participante"
      footer={
        <>
          <ActionButton action="cancelar" onClick={onFechar} disabled={desfazer.isPending} />
          <AppButton variant="primary" onClick={gravar} disabled={desfazer.isPending} data-testid="desfazer-np-gravar">
            {desfazer.isPending ? 'Desfazendo…' : 'Desfazer'}
          </AppButton>
        </>
      }
    >
      {r && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <p style={texto}>A quantidade volta para {nomeDe(r.uasgOrigem)} e sai do limite de adesão do item.</p>
          <label style={campo}>
            Justificativa (obrigatória)
            <AppTextarea rows={3} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} data-testid="desfazer-np-justificativa" />
          </label>
          {erro && <NoticeBar tone="danger" testId="desfazer-np-erro">{erro}</NoticeBar>}
        </div>
      )}
    </Modal>
  );
};

/**
 * Adesões que apareceram depois de um remanejamento para a mesma UASG: até o gestor decidir, não contam no limite.
 * Quem não pode decidir só vê o aviso.
 */
export const AdesoesAConferirAviso: React.FC<{
  itemKey: string;
  adesoes: AdesaoItemRecord[];
  quantitativos: QuantitativosDoItem;
  nomeDe: (uasg: string) => string;
  podeDecidir: boolean;
}> = ({ itemKey, adesoes, quantitativos: q, nomeDe, podeDecidir }) => {
  const toast = useToast();
  const { decidirAdesao } = useAcoesQuantitativos(itemKey);
  const pendentes = adesoesNoLimite(adesoes, q.remanejamentosNaoParticipante, q.adesoesConferidas).filter((a) => a.situacao === 'A_CONFERIR');
  if (pendentes.length === 0) return null;
  const decidir = async (uasg: string, aprovadaEm: string, decisao: 'MESMO' | 'DIFERENTES') => {
    try {
      await decidirAdesao.mutateAsync({ uasg, aprovadaEm, decisao });
      toast.success(decisao === 'MESMO' ? 'Adesão ligada ao remanejamento: conta uma vez só.' : 'Marcadas como operações diferentes: as duas contam no limite.');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível gravar a decisão.');
    }
  };
  return (
    <>
      {pendentes.map((a) => (
        <NoticeBar
          key={`${a.uasg}-${a.aprovadaEm}`}
          tone="warning"
          testId={`adesao-a-conferir-${a.uasg}`}
          action={podeDecidir ? (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <AppButton variant="primary" size="sm" disabled={decidirAdesao.isPending} onClick={() => void decidir(a.uasg, a.aprovadaEm, 'MESMO')} data-testid={`adesao-mesmo-${a.uasg}`}>É o mesmo remanejamento</AppButton>
              <AppButton variant="outline" size="sm" disabled={decidirAdesao.isPending} onClick={() => void decidir(a.uasg, a.aprovadaEm, 'DIFERENTES')} data-testid={`adesao-diferentes-${a.uasg}`}>São operações diferentes</AppButton>
            </div>
          ) : undefined}
        >
          <b>A conferir:</b> o Compras.gov.br trouxe uma adesão de {formatNumber(a.quantidade)} da UASG {a.uasg} ({nomeDe(a.uasg)}){a.aprovadaEm ? `, aprovada em ${a.aprovadaEm.slice(0, 10).split('-').reverse().join('/')}` : ''}. Pode ser o remanejamento registrado aqui. Até {podeDecidir ? 'você decidir' : 'o gestor de saldo decidir'}, ela não conta no limite de adesão.
        </NoticeBar>
      ))}
    </>
  );
};
