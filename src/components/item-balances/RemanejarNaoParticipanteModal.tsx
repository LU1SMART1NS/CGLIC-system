import React from 'react';
import { Check, X } from 'lucide-react';
import { ActionButton, AppButton, AppInput, AppTextarea, Modal, NoticeBar, useToast } from '../../design-system';
import { useAcoesQuantitativos } from '../../hooks/useQuantitativosDoItem';
import { useCadastroUasgs } from '../../hooks/useCadastroUasgs';
import { fetchNomeUasg } from '../../services/api';
import { localDaUasg } from '../../services/cadastroUasgsSyncService';
import type { OrgaoQuantitativo, QuantitativosDoItem, RemanejamentoNaoParticipante } from '../../services/quantitativosService';
import type { AdesaoItemRecord } from '../../types';
import { documentoSeiValido } from '../../utils/quantitativos';
import { toSentenceCaseIfAllCaps } from '../../utils/textCase';
import { adesoesNoLimite, livreNaOrigem, regrasDoRemanejamento, usadoNoLimite, type RegraDoLimite } from '../../utils/remanejamentoNaoParticipante';
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
  /** UASGs do item (gerenciadora e participantes): não podem ser destino. */
  participantes: Set<string>;
  onFechar: () => void;
}

type Busca = 'vazia' | 'buscando' | 'achou' | 'nao-encontrada' | 'falhou';

const campo: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 600 };
const texto: React.CSSProperties = { fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 };
const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 };
const mono: React.CSSProperties = { fontFamily: 'monospace', fontWeight: 600 };

const ROTULO: Record<RegraDoLimite['chave'], (livre: string, senasp: boolean) => string> = {
  ORIGEM: (livre, senasp) => (senasp ? `Livre da cota própria: ${livre}` : `Livre no órgão que cede: ${livre}`),
  POR_ORGAO: (livre) => `Até 50% do item para esta UASG: livre ${livre}`,
  TOTAL: (livre) => `Limite de adesão do item: livre ${livre}`
};

function erroDaRegra(r: RegraDoLimite, q: number, senasp: boolean, alocado: number, baseSaldo: number): string {
  if (r.chave === 'ORIGEM') {
    return senasp
      ? `A cota ficaria ${formatNumber(baseSaldo - q)}, abaixo dos ${formatNumber(alocado)} alocados. Diminua a alocação das unidades em ${formatNumber(q - r.livre)} antes de remanejar.`
      : `O órgão só tem ${formatNumber(r.livre)} para ceder.`;
  }
  if (r.chave === 'POR_ORGAO') return r.livre === 0 ? 'Esta UASG já chegou a 50% do item. Não pode receber mais.' : `Passa dos 50% do item para esta UASG. O máximo agora é ${formatNumber(r.livre)}.`;
  return `Passa do limite de adesão do item. O máximo agora é ${formatNumber(r.livre)}.`;
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
  const [uasg, setUasg] = React.useState('');
  const [nome, setNome] = React.useState('');
  const [busca, setBusca] = React.useState<Busca>('vazia');
  const [quantidade, setQuantidade] = React.useState('');
  const [documento, setDocumento] = React.useState('');
  const [justificativa, setJustificativa] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  // A UASG digitada por último: a busca de uma UASG antiga não sobrescreve a atual.
  const ultimaUasg = React.useRef('');

  React.useEffect(() => {
    setUasg(''); setNome(''); setBusca('vazia'); setQuantidade(''); setDocumento(''); setJustificativa(''); setErro(null);
  }, [p.origem?.uasg]);

  const cadastro = useCadastroUasgs(/^\d{6}$/.test(uasg) ? [uasg] : []).get(uasg);
  const participante = /^\d{6}$/.test(uasg) && p.participantes.has(uasg);
  const destinoValido = /^\d{6}$/.test(uasg) && !participante && uasg !== p.origem?.uasg;
  const nomeDestino = cadastro?.nome ?? nome;

  const mudarUasg = (digitado: string) => {
    const u = digitado.replace(/\D/g, '').slice(0, 6);
    ultimaUasg.current = u;
    setUasg(u); setNome(''); setErro(null);
    setBusca(u.length === 6 ? 'buscando' : 'vazia');
    if (u.length !== 6) return;
    void fetchNomeUasg(u).then((r) => {
      if (ultimaUasg.current !== u) return;
      setBusca(r.situacao);
      if (r.situacao === 'achou') setNome(toSentenceCaseIfAllCaps(r.nome));
    });
  };

  const adesoes = React.useMemo(() => adesoesNoLimite(p.adesoes, q.remanejamentosNaoParticipante, q.adesoesConferidas), [p.adesoes, q.remanejamentosNaoParticipante, q.adesoesConferidas]);
  const livre = o ? livreNaOrigem({ orgao: o, baseSaldo: p.baseSaldo, alocado: p.alocado, contratado: p.origem?.contratado ?? 0 }) : 0;
  const contaOrigem = !o ? '' : senasp
    ? `cota ${formatNumber(p.baseSaldo)} − alocado ${formatNumber(p.alocado)}`
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
  const quebradas = qtd > 0 ? regras.filter((r) => qtd > r.livre) : [];
  const usadoUasg = destinoValido ? usadoNoLimite(adesoes, q.remanejamentosNaoParticipante, uasg).total : 0;
  const usadoTotal = usadoNoLimite(adesoes, q.remanejamentosNaoParticipante).total;

  const gravar = async () => {
    if (!o || !p.origem) return;
    setErro(null);
    if (!/^\d{6}$/.test(uasg)) return setErro('A UASG do órgão não participante tem 6 dígitos.');
    if (participante) return setErro('Esta UASG é participante do item. Use o remanejamento entre participantes, na linha do órgão.');
    if (uasg === p.origem.uasg) return setErro('O destino precisa ser outro órgão.');
    if (busca === 'buscando') return setErro('Aguarde: buscando o nome da UASG no Compras.gov.br.');
    if (!nomeDestino.trim()) return setErro('Escreva o nome do órgão (não veio do Compras.gov.br).');
    if (qtd < 1) return setErro('Informe a quantidade (número inteiro).');
    if (quebradas.length > 0) return setErro(erroDaRegra(quebradas[0], qtd, senasp, p.alocado, p.baseSaldo));
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
      {o && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <label style={campo}>
            UASG do órgão não participante
            <AppInput inputMode="numeric" value={uasg} style={{ width: 130 }} placeholder="000000" onChange={(e) => mudarUasg(e.target.value)} data-testid="remanejar-np-uasg" />
          </label>
          {participante && <NoticeBar tone="danger" testId="remanejar-np-participante">Esta UASG é participante do item. Use o remanejamento entre participantes, na linha do órgão.</NoticeBar>}
          {destinoValido && (
            cadastro || busca === 'achou' ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.55rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 2 }} data-testid="remanejar-np-orgao">
                <b>{nomeDestino}</b>
                <span style={pequeno}>UASG {uasg}{cadastro && localDaUasg(cadastro) ? ` · ${localDaUasg(cadastro)}` : ''} · Compras.gov.br</span>
                {usadoUasg > 0 && <span style={{ ...pequeno, color: 'var(--color-warning-text)' }}>Já tem {formatNumber(usadoUasg)} em adesões neste item.</span>}
              </div>
            ) : busca === 'buscando' ? (
              <span style={pequeno}>Buscando o nome no Compras.gov.br…</span>
            ) : (
              <label style={campo}>
                Nome do órgão
                <span style={pequeno}>{busca === 'falhou' ? 'O Compras.gov.br não respondeu agora.' : 'A UASG não foi achada no cadastro do Compras.gov.br. Confira o número.'} Se estiver certo, escreva o nome.</span>
                <AppInput value={nome} onChange={(e) => setNome(e.target.value)} data-testid="remanejar-np-nome" />
              </label>
            )
          )}
          <label style={campo}>
            Quantidade{destinoValido ? ` (até ${formatNumber(maximo)})` : ''}
            <AppInput inputMode="numeric" value={quantidade} style={{ width: 150 }} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))} data-testid="remanejar-np-quantidade" />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }} aria-live="polite" data-testid="remanejar-np-regras">
            {regras.map((r) => {
              const quebrou = qtd > r.livre;
              return (
                <div key={r.chave} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: '0.4rem', fontSize: '0.84rem', color: quebrou ? 'var(--color-danger-text)' : undefined }} data-testid={`regra-${r.chave}`}>
                  {quebrou ? <X size={16} aria-label="não passa" /> : <Check size={16} color="var(--color-success-text)" aria-label="passa" />}
                  <div>
                    {ROTULO[r.chave](formatNumber(r.livre), senasp)}
                    <div style={pequeno}>{r.conta}</div>
                    {quebrou && <div>{erroDaRegra(r, qtd, senasp, p.alocado, p.baseSaldo)}</div>}
                  </div>
                </div>
              );
            })}
            {!destinoValido && <span style={pequeno}>Os limites de 50% por órgão e do total de adesões aparecem com a UASG de destino.</span>}
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
                  <Linha rotulo={`Livre em ${p.origem?.nome}`} valor={`${formatNumber(livre)} → ${formatNumber(livre - qtd)}`} />
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
