import React from 'react';
import { ActionButton, AppButton, Modal, NoticeBar } from '../../../design-system';
import type { PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import type { CreatePaymentCycleInput, RegisterPaymentMarcoInput } from '../../../adapters/paymentCycleRpcAdapter';
import {
  empenhosSemSaldo,
  errorMessage,
  margemDaChegada,
  useEmpenhosDoContrato,
  type ContratoParaCiclo
} from './cicloPagamentoShared';
import { PAGAMENTO_RULES } from '../../../config/alertRules';
import { ResponsavelField, type ResponsavelValue } from '../ResponsavelField';
import {
  formatCurrencyInputBR,
  isoToBR,
  maskDateInputBR,
  parseCurrencyInputBR,
  parseDateInputBR,
  prazoExigeJustificativa,
  prazoPadraoISO,
  todayISO
} from './paymentFormUtils';

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const Field: React.FC<{ id: string; label: string; children: React.ReactNode; hint?: React.ReactNode }> = ({ id, label, children, hint }) => (
  <div className="form-group">
    <label className="form-label" htmlFor={id}>{label}</label>
    {children}
    {hint && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{hint}</div>}
  </div>
);

/** Campo de data dd/mm/aaaa com máscara. */
export const DateField: React.FC<{ id: string; label: string; value: string; onChange: (v: string) => void; hint?: React.ReactNode; required?: boolean }> = ({
  id,
  label,
  value,
  onChange,
  hint,
  required = true
}) => (
  <Field id={id} label={label} hint={hint}>
    <input
      id={id}
      className="form-input"
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      value={value}
      onChange={(e) => onChange(maskDateInputBR(e.target.value))}
      required={required}
    />
  </Field>
);

export const JustificativaField: React.FC<{ id: string; value: string; onChange: (v: string) => void; hint: string; label?: string; placeholder?: string }> = ({
  id,
  value,
  onChange,
  hint,
  label = 'Justificativa do prazo *',
  placeholder = 'Ex.: aguardando regularização no SICAF'
}) => (
  <Field id={id} label={label} hint={hint}>
    <input id={id} className="form-input" type="text" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} required />
  </Field>
);

/**
 * Ações dos modais. Vão na prop `footer` do Modal (fixa, sempre visível, empilhada em 44px no celular);
 * o botão de envio usa `form` para submeter o formulário do corpo.
 */
export const FooterButtons: React.FC<{ formId: string; onCancel: () => void; saving: boolean; submitLabel: string; disabled?: boolean }> = ({
  formId,
  onCancel,
  saving,
  submitLabel,
  disabled
}) => (
  <>
    <ActionButton action="cancelar" type="button" onClick={onCancel} disabled={saving}>
      Cancelar
    </ActionButton>
    <AppButton type="submit" form={formId} variant="primary" disabled={saving || disabled} isLoading={saving}>
      {saving ? 'Salvando...' : submitLabel}
    </AppButton>
  </>
);

// -----------------------------------------------------------------------------
// Abrir ciclo
// -----------------------------------------------------------------------------
interface ItemRow {
  notaFiscal: string;
  notaFiscalSei: string;
  atestoSei: string;
  empenho: string;
  subelemento: string;
  bruto: string;
  juros: string;
  glosa: string;
  desconto: string;
  justificativaJuros: string;
}

const itemVazio = (empenho = ''): ItemRow => ({
  notaFiscal: '',
  notaFiscalSei: '',
  atestoSei: '',
  empenho,
  subelemento: '',
  bruto: '',
  juros: '',
  glosa: '',
  desconto: '',
  justificativaJuros: ''
});

const aPagar = (i: ItemRow) =>
  (parseCurrencyInputBR(i.bruto) ?? 0) + (parseCurrencyInputBR(i.juros) ?? 0) - (parseCurrencyInputBR(i.glosa) ?? 0) - (parseCurrencyInputBR(i.desconto) ?? 0);

export const CreateCycleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  /** Contrato fixo (tela do Contrato); sem ele, o usuário escolhe em `contratos` (aba Pagamentos). */
  contractKey?: string;
  contratos?: ContratoParaCiclo[];
  gestorNome?: string;
  registradoPorNome?: string;
  onSubmit: (input: CreatePaymentCycleInput) => Promise<void>;
}> = ({ isOpen, onClose, contractKey: contratoFixo, contratos = [], gestorNome: gestorFixo, registradoPorNome, onSubmit }) => {
  const hoje = todayISO();
  const [contrato, setContrato] = React.useState(contratoFixo ?? '');
  const [processo, setProcesso] = React.useState('');
  const [dataAtesto, setDataAtesto] = React.useState('');
  const [dataChegada, setDataChegada] = React.useState(isoToBR(hoje));
  const [vencimento, setVencimento] = React.useState('');
  const [itens, setItens] = React.useState<ItemRow[]>([itemVazio()]);
  const [responsavel, setResponsavel] = React.useState<ResponsavelValue>({ nome: '' });
  const [prazo, setPrazo] = React.useState('');
  const [prazoTocado, setPrazoTocado] = React.useState(false);
  const [justificativa, setJustificativa] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (contratoFixo) setContrato(contratoFixo);
  }, [contratoFixo]);

  const contractKey = contratoFixo ?? contrato;
  const gestorNome = gestorFixo ?? contratos.find((c) => c.contractKey === contractKey)?.gestorNome;
  const { data: empenhos = [], isLoading: carregandoEmpenhos } = useEmpenhosDoContrato(contractKey || undefined);

  // Com um só empenho com saldo, ele já vem escolhido.
  React.useEffect(() => {
    const comSaldo = empenhos.filter((e) => e.saldo > 0);
    if (comSaldo.length === 1) setItens((prev) => prev.map((i) => (i.empenho ? i : { ...i, empenho: comSaldo[0].canonicalKey })));
  }, [empenhos]);

  const chegadaISO = parseDateInputBR(dataChegada);
  const atestoISO = parseDateInputBR(dataAtesto);
  const vencimentoISO = parseDateInputBR(vencimento);
  const padraoISO = chegadaISO ? prazoPadraoISO('CONFERENCIA', chegadaISO) : '';

  React.useEffect(() => {
    if (!prazoTocado && padraoISO) setPrazo(isoToBR(padraoISO));
  }, [padraoISO, prazoTocado]);

  const prazoISO = parseDateInputBR(prazo);
  const alongado = Boolean(prazoISO && padraoISO && prazoExigeJustificativa({ prazoISO, padraoISO }));
  const margem = chegadaISO && vencimentoISO ? margemDaChegada(chegadaISO, vencimentoISO) : null;
  const foraDoPrazo = margem !== null && margem < PAGAMENTO_RULES.chegadaMinimaDiasUteis;
  const total = itens.reduce((s, i) => s + aPagar(i), 0);
  const semSaldo = empenhosSemSaldo(itens.map((i) => ({ empenho: i.empenho, valor: aPagar(i) })), empenhos);

  const updateItem = (idx: number, patch: Partial<ItemRow>) => setItens((prev) => prev.map((i, n) => (n === idx ? { ...i, ...patch } : i)));

  const limpar = () => {
    setProcesso('');
    setDataAtesto('');
    setDataChegada(isoToBR(todayISO()));
    setVencimento('');
    setItens([itemVazio()]);
    setResponsavel({ nome: '' });
    setPrazoTocado(false);
    setJustificativa('');
    setError(null);
    if (!contratoFixo) setContrato('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractKey) return setError('Escolha o contrato.');
    if (!atestoISO || !chegadaISO || !vencimentoISO) return setError('Preencha as datas completas (dd/mm/aaaa).');
    if (atestoISO > chegadaISO) return setError('A chegada à CGLIC não pode ser anterior ao atesto.');
    if (itens.some((i) => aPagar(i) < 0)) return setError('Glosa e desconto não podem passar do valor bruto mais juros.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        contractKey,
        dataAssinaturaAtesto: atestoISO,
        dataRecebimento: chegadaISO,
        dataVencimentoFatura: vencimentoISO,
        numeroProcessoPagamentoSei: processo.trim(),
        itens: itens.map((i) => ({
          notaFiscal: i.notaFiscal.trim(),
          notaFiscalSei: i.notaFiscalSei.trim() || undefined,
          atestoSei: i.atestoSei.trim(),
          empenhoCanonicalKey: i.empenho,
          subelemento: i.subelemento.trim() || undefined,
          valorBruto: parseCurrencyInputBR(i.bruto) ?? 0,
          jurosMulta: parseCurrencyInputBR(i.juros) ?? 0,
          glosa: parseCurrencyInputBR(i.glosa) ?? 0,
          desconto: parseCurrencyInputBR(i.desconto) ?? 0,
          justificativaJuros: (parseCurrencyInputBR(i.juros) ?? 0) > 0 ? i.justificativaJuros.trim() : undefined
        })),
        prazoConferenciaAte: prazoISO || undefined,
        prazoPadrao: padraoISO || undefined,
        justificativaPrazo: alongado ? justificativa.trim() : undefined,
        responsavelNome: responsavel.nome.trim() || undefined,
        responsavelUserId: responsavel.nome.trim() ? responsavel.userId : undefined,
        registradoPorNome
      });
      limpar();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível abrir o ciclo. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Abrir ciclo de pagamento"
      size="lg"
      dismissible={!saving}
      testId="payment-cycle-modal"
      footer={<FooterButtons formId="payment-cycle-form" onCancel={onClose} saving={saving} submitLabel="Abrir ciclo" />}
    >
      <form id="payment-cycle-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="form-grid">
          {!contratoFixo && (
            <Field id="payment-contrato" label="Contrato *">
              <select id="payment-contrato" className="form-input" value={contrato} onChange={(e) => { setContrato(e.target.value); setItens([itemVazio()]); }} required>
                <option value="">Escolha o contrato</option>
                {contratos.map((c) => (
                  <option key={c.contractKey} value={c.contractKey}>
                    {c.numero}{c.fornecedorNome ? ` · ${c.fornecedorNome}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field id="payment-processo" label="Processo SEI de pagamento *" hint="Um processo por pagamento (Portaria 50, art. 5º, § 1º).">
            <input id="payment-processo" className="form-input" type="text" placeholder="08020.000000/2026-00" value={processo} onChange={(e) => setProcesso(e.target.value)} required />
          </Field>
        </div>

        <div className="form-grid">
          <DateField id="payment-atesto" label="Data do atesto *" value={dataAtesto} onChange={setDataAtesto} hint="Início dos prazos de liquidação e pagamento." />
          <DateField id="payment-chegada" label="Chegada à CGLIC *" value={dataChegada} onChange={setDataChegada} hint="Início do prazo de conferência." />
          <DateField id="payment-vencimento" label="Vencimento contratual *" value={vencimento} onChange={setVencimento} />
        </div>
        {foraDoPrazo && (
          <NoticeBar tone="warning" testId="payment-chegada-fora-prazo">
            Chegou com {margem} {margem === 1 ? 'dia útil' : 'dias úteis'} até o vencimento; a Portaria 50 (art. 5º) pede no mínimo{' '}
            {PAGAMENTO_RULES.chegadaMinimaDiasUteis}. Isso fica registrado no ciclo.
          </NoticeBar>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Do pagamento (Portaria 50, Anexo II) *</div>
          {contractKey && !carregandoEmpenhos && empenhos.length === 0 && (
            <NoticeBar tone="warning" testId="payment-sem-empenho">
              Este contrato não tem empenho vinculado no sistema. Atualize os empenhos do contrato antes de abrir o ciclo.
            </NoticeBar>
          )}
          {itens.map((item, idx) => {
            const juros = parseCurrencyInputBR(item.juros) ?? 0;
            return (
              <div key={idx} data-testid={`payment-item-${idx}`} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', background: '#f8fafc' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '0.6rem' }}>
                  <Field id={`item-nf-${idx}`} label="Nota fiscal *">
                    <input id={`item-nf-${idx}`} className="form-input" type="text" value={item.notaFiscal} onChange={(e) => updateItem(idx, { notaFiscal: e.target.value })} required />
                  </Field>
                  <Field id={`item-nf-sei-${idx}`} label="SEI da nota">
                    <input id={`item-nf-sei-${idx}`} className="form-input" type="text" value={item.notaFiscalSei} onChange={(e) => updateItem(idx, { notaFiscalSei: e.target.value })} />
                  </Field>
                  <Field id={`item-atesto-${idx}`} label="SEI do atesto *">
                    <input id={`item-atesto-${idx}`} className="form-input" type="text" value={item.atestoSei} onChange={(e) => updateItem(idx, { atestoSei: e.target.value })} required />
                  </Field>
                  <Field id={`item-empenho-${idx}`} label="Empenho *">
                    <select id={`item-empenho-${idx}`} className="form-input" value={item.empenho} onChange={(e) => updateItem(idx, { empenho: e.target.value })} required disabled={!contractKey}>
                      <option value="">{carregandoEmpenhos ? 'Carregando...' : 'Escolha'}</option>
                      {empenhos.map((e) => (
                        <option key={e.canonicalKey} value={e.canonicalKey}>
                          {e.numero} · saldo {moeda(e.saldo)}{e.naturezaDespesa ? ` · ND ${e.naturezaDespesa}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id={`item-sub-${idx}`} label="Subelemento">
                    <input id={`item-sub-${idx}`} className="form-input" type="text" inputMode="numeric" maxLength={8} placeholder="Ex.: 52" value={item.subelemento} onChange={(e) => updateItem(idx, { subelemento: e.target.value.replace(/\D/g, '') })} />
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: '0.6rem', alignItems: 'end' }}>
                  <Field id={`item-bruto-${idx}`} label="Valor bruto *">
                    <input id={`item-bruto-${idx}`} className="form-input" type="text" inputMode="numeric" placeholder="0,00" value={item.bruto} onChange={(e) => updateItem(idx, { bruto: formatCurrencyInputBR(e.target.value) })} required />
                  </Field>
                  <Field id={`item-juros-${idx}`} label="Juros/multa">
                    <input id={`item-juros-${idx}`} className="form-input" type="text" inputMode="numeric" placeholder="0,00" value={item.juros} onChange={(e) => updateItem(idx, { juros: formatCurrencyInputBR(e.target.value) })} />
                  </Field>
                  <Field id={`item-glosa-${idx}`} label="Glosa">
                    <input id={`item-glosa-${idx}`} className="form-input" type="text" inputMode="numeric" placeholder="0,00" value={item.glosa} onChange={(e) => updateItem(idx, { glosa: formatCurrencyInputBR(e.target.value) })} />
                  </Field>
                  <Field id={`item-desconto-${idx}`} label="Desconto">
                    <input id={`item-desconto-${idx}`} className="form-input" type="text" inputMode="numeric" placeholder="0,00" value={item.desconto} onChange={(e) => updateItem(idx, { desconto: formatCurrencyInputBR(e.target.value) })} />
                  </Field>
                  <div className="form-group">
                    <span className="form-label">A pagar</span>
                    <strong style={{ fontSize: '0.95rem', padding: '0.45rem 0' }}>{moeda(aPagar(item))}</strong>
                  </div>
                </div>
                {juros > 0 && (
                  <JustificativaField
                    id={`item-just-juros-${idx}`}
                    label="Justificativa dos juros/multa *"
                    placeholder="Ex.: atraso causado por ..."
                    value={item.justificativaJuros}
                    onChange={(v) => updateItem(idx, { justificativaJuros: v })}
                    hint="Pagamento com juros ou multa exige justificativa (Portaria 50, art. 5º, § 7º)."
                  />
                )}
                {itens.length > 1 && (
                  <div>
                    <ActionButton action="remover" type="button" size="sm" onClick={() => setItens((prev) => prev.filter((_, n) => n !== idx))}>
                      Remover nota
                    </ActionButton>
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <ActionButton action="adicionar" type="button" size="sm" onClick={() => setItens((prev) => [...prev, itemVazio(prev[prev.length - 1]?.empenho)])}>
              Adicionar nota fiscal
            </ActionButton>
            <span style={{ fontSize: '0.85rem', color: '#334155' }}>
              Total a pagar: <strong>{moeda(total)}</strong>
            </span>
          </div>
          {semSaldo.length > 0 && (
            <NoticeBar tone="warning" testId="payment-empenho-sem-saldo">
              O valor passa do saldo de {semSaldo.join(', ')} (empenhado menos o já pago por fatura). Na conferência, o item "Nota de
              empenho" virá marcado como "Não".
            </NoticeBar>
          )}
        </div>

        <div className="form-grid">
          <Field
            id="payment-cycle-responsavel"
            label="Servidor designado"
            hint={gestorNome ? 'Com o gestor do contrato selecionado, o ciclo acompanha uma troca de Gestor Titular.' : 'Contrato sem Gestor Titular: informe um responsável.'}
          >
            <ResponsavelField id="payment-cycle-responsavel" value={responsavel} onChange={setResponsavel} gestorNome={gestorNome} gestorLabel="gestor do contrato" />
          </Field>
          <DateField
            id="payment-prazo-conferencia"
            label="Conferir a documentação até *"
            value={prazo}
            onChange={(v) => {
              setPrazo(v);
              setPrazoTocado(true);
            }}
            hint={padraoISO ? `Prazo padrão: ${isoToBR(padraoISO)}.` : undefined}
          />
        </div>
        {alongado && (
          <JustificativaField id="payment-prazo-justificativa" value={justificativa} onChange={setJustificativa} hint="Prazo além do padrão exige justificativa." />
        )}

        {error && <NoticeBar tone="danger" testId="payment-cycle-error">{error}</NoticeBar>}
      </form>
    </Modal>
  );
};

// -----------------------------------------------------------------------------
// Marcos simples: recebido de volta, resultado da CGOFI, envio à COLOG, prorrogação da liquidação
// -----------------------------------------------------------------------------
export type MarcoSimples = 'RETORNO' | 'RESULTADO_CGOFI' | 'ENVIADO_COLOG' | 'PRORROGACAO_LIQUIDACAO';

const TITULO_MARCO: Record<MarcoSimples, string> = {
  RETORNO: 'Recebido de volta',
  RESULTADO_CGOFI: 'Resultado da CGOFI',
  ENVIADO_COLOG: 'Enviar à COLOG',
  PRORROGACAO_LIQUIDACAO: 'Prorrogar o prazo de liquidação'
};

export const MarcoSimplesModal: React.FC<{
  cycle: PaymentFollowUpCycle | null;
  marco: MarcoSimples | null;
  onClose: () => void;
  registradoPorNome?: string;
  onSubmit: (input: RegisterPaymentMarcoInput) => Promise<void>;
}> = ({ cycle, marco, onClose, registradoPorNome, onSubmit }) => {
  const [resultado, setResultado] = React.useState<'PAGO' | 'DEVOLVIDO'>('PAGO');
  const [data, setData] = React.useState(isoToBR(todayISO()));
  const [sei, setSei] = React.useState('');
  const [numeroOb, setNumeroOb] = React.useState('');
  const [motivo, setMotivo] = React.useState('');
  const [prazo, setPrazo] = React.useState('');
  const [prazoTocado, setPrazoTocado] = React.useState(false);
  const [justificativa, setJustificativa] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setResultado('PAGO');
    setData(isoToBR(todayISO()));
    setSei('');
    setNumeroOb('');
    setMotivo('');
    setPrazoTocado(false);
    setJustificativa('');
    setError(null);
  }, [cycle?.cycleKey, marco]);

  const dataISO = parseDateInputBR(data);
  const precisaPrazo = marco === 'RETORNO' || (marco === 'RESULTADO_CGOFI' && resultado === 'DEVOLVIDO');
  const padraoISO = dataISO && precisaPrazo ? prazoPadraoISO('CONFERENCIA', dataISO) : '';
  React.useEffect(() => {
    if (!prazoTocado) setPrazo(padraoISO ? isoToBR(padraoISO) : '');
  }, [padraoISO, prazoTocado]);

  if (!cycle || !marco) return null;

  const prazoISO = parseDateInputBR(prazo);
  const alongado = marco === 'RETORNO' && Boolean(prazoISO && padraoISO && prazoExigeJustificativa({ prazoISO, padraoISO }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataISO) return;
    const comum = { cycleKey: cycle.cycleKey, data: dataISO, registradoPorNome };
    let input: RegisterPaymentMarcoInput;
    if (marco === 'RETORNO') {
      input = { ...comum, marco: 'RETORNO', prazoNovo: prazoISO || undefined, prazoPadrao: padraoISO || undefined, justificativa: alongado ? justificativa.trim() : undefined };
    } else if (marco === 'ENVIADO_COLOG') {
      input = { ...comum, marco: 'ENVIADO_COLOG', sei: sei.trim() };
    } else if (marco === 'PRORROGACAO_LIQUIDACAO') {
      input = { ...comum, marco: 'PRORROGACAO_LIQUIDACAO', justificativa: justificativa.trim() };
    } else if (resultado === 'DEVOLVIDO') {
      input = { ...comum, marco: 'DEVOLVIDO', motivo: motivo.trim(), prazoNovo: prazoISO || undefined, prazoPadrao: padraoISO || undefined };
    } else {
      input = { ...comum, marco: 'PAGO', numeroOb: numeroOb.trim(), justificativa: justificativa.trim() || undefined };
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(input);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível registrar. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={TITULO_MARCO[marco]}
      size="md"
      dismissible={!saving}
      testId="payment-marco-modal"
      footer={<FooterButtons formId="payment-marco-form" onCancel={onClose} saving={saving} submitLabel="Registrar" />}
    >
      <form id="payment-marco-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {marco === 'RESULTADO_CGOFI' && (
          <>
            <NoticeBar tone="info" testId="payment-conciliacao-info">
              O sistema registra sozinho a liquidação e o pagamento quando a fatura do ciclo ganha NP e ordem bancária no
              Contratos.gov.br e no Tesouro. Use este registro só para devolução ou para lançar uma OB que o sistema ainda não achou.
            </NoticeBar>
            <Field id="marco-resultado" label="Resultado">
              <select id="marco-resultado" className="form-input" value={resultado} onChange={(e) => { setResultado(e.target.value as 'PAGO' | 'DEVOLVIDO'); setPrazoTocado(false); }}>
                <option value="PAGO">Pago (ordem bancária emitida)</option>
                <option value="DEVOLVIDO">Devolvido pela CGOFI</option>
              </select>
            </Field>
          </>
        )}
        {marco === 'PRORROGACAO_LIQUIDACAO' && (
          <NoticeBar tone="info" testId="payment-prorrogacao-info">
            O prazo de liquidação pode ser prorrogado uma vez, por igual período, quando houver diligência (IN 77, art. 7º, § 3º).
          </NoticeBar>
        )}

        <DateField
          id="marco-data"
          label={marco === 'RESULTADO_CGOFI' && resultado === 'PAGO' ? 'Data da ordem bancária *' : marco === 'RETORNO' ? 'Recebido de volta em *' : 'Data *'}
          value={data}
          onChange={(v) => { setData(v); setPrazoTocado(false); }}
        />

        {marco === 'ENVIADO_COLOG' && (
          <Field id="marco-sei" label="SEI do despacho à COLOG *">
            <input id="marco-sei" className="form-input" type="text" value={sei} onChange={(e) => setSei(e.target.value)} required />
          </Field>
        )}
        {marco === 'RESULTADO_CGOFI' && resultado === 'PAGO' && (
          <>
            <Field id="marco-ob" label="Número da ordem bancária *">
              <input id="marco-ob" className="form-input" type="text" placeholder="Ex: 2026OB800123" value={numeroOb} onChange={(e) => setNumeroOb(e.target.value.toUpperCase())} required />
            </Field>
            <Field id="marco-just-ob" label="Justificativa (só se a OB ainda não aparece no Tesouro)">
              <input id="marco-just-ob" className="form-input" type="text" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
            </Field>
          </>
        )}
        {marco === 'RESULTADO_CGOFI' && resultado === 'DEVOLVIDO' && (
          <Field id="marco-motivo" label="Motivo da devolução *">
            <input id="marco-motivo" className="form-input" type="text" placeholder="Ex.: falta a consulta da NF-e" value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
          </Field>
        )}
        {precisaPrazo && (
          <DateField
            id="marco-prazo"
            label="Conferir novamente até *"
            value={prazo}
            onChange={(v) => { setPrazo(v); setPrazoTocado(true); }}
            hint={padraoISO ? `Prazo padrão: ${isoToBR(padraoISO)}.` : undefined}
          />
        )}
        {(alongado || marco === 'PRORROGACAO_LIQUIDACAO') && (
          <JustificativaField
            id="marco-justificativa"
            label={marco === 'PRORROGACAO_LIQUIDACAO' ? 'Justificativa (diligência) *' : 'Justificativa do prazo *'}
            value={justificativa}
            onChange={setJustificativa}
            hint={marco === 'PRORROGACAO_LIQUIDACAO' ? 'Diga qual diligência exige mais prazo.' : 'Prazo além do padrão exige justificativa.'}
          />
        )}

        {error && <NoticeBar tone="danger" testId="payment-marco-error">{error}</NoticeBar>}
      </form>
    </Modal>
  );
};

// -----------------------------------------------------------------------------
// Cancelar o ciclo (fica no histórico, marcado como Cancelado)
// -----------------------------------------------------------------------------
export const CancelCycleModal: React.FC<{
  cycle: PaymentFollowUpCycle | null;
  onClose: () => void;
  registradoPorNome?: string;
  onSubmit: (input: RegisterPaymentMarcoInput) => Promise<void>;
}> = ({ cycle, onClose, registradoPorNome, onSubmit }) => {
  const [motivo, setMotivo] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMotivo('');
    setError(null);
  }, [cycle?.cycleKey]);

  if (!cycle) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ cycleKey: cycle.cycleKey, marco: 'CANCELADO', data: todayISO(), motivo: motivo.trim(), registradoPorNome });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível cancelar o ciclo. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Cancelar ciclo" size="md" dismissible={!saving} testId="payment-cancel-modal" footer={<FooterButtons formId="payment-cancel-form" onCancel={onClose} saving={saving} submitLabel="Cancelar ciclo" />}>
      <form id="payment-cancel-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <NoticeBar tone="warning" testId="payment-cancel-note">
          O ciclo continua no histórico, marcado como cancelado, e deixa de contar nos ciclos ativos e nos alertas. As faturas
          ligadas a ele ficam livres para outro ciclo.
        </NoticeBar>
        <Field id="cancel-motivo" label="Motivo do cancelamento *">
          <input
            id="cancel-motivo"
            className="form-input"
            type="text"
            placeholder="Ex.: atesto anulado, lançado em duplicidade"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
          />
        </Field>
        {error && <NoticeBar tone="danger" testId="payment-cancel-error">{error}</NoticeBar>}
      </form>
    </Modal>
  );
};
