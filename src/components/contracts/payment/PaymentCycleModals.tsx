import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AppButton, Modal, NoticeBar } from '../../../design-system';
import type { PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import type { CreatePaymentCycleInput, RegisterPaymentMarcoInput } from '../../../adapters/paymentCycleRpcAdapter';
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

export const TIPOS_DOCUMENTO_RECEBIDO = [
  'Termo de Atesto',
  'Nota Fiscal Eletrônica',
  'Nota Fiscal',
  'Fatura',
  'Apólice de Seguro',
  'Boleto Bancário',
  'Guia de Recolhimento',
  'Multa',
  'Ofício',
  'Recibo',
  'RPA'
];

const errorMessage = (err: unknown, fallback: string) => (err as { message?: string } | null)?.message || fallback;

const Field: React.FC<{ id: string; label: string; children: React.ReactNode; hint?: React.ReactNode }> = ({ id, label, children, hint }) => (
  <div className="form-group">
    <label className="form-label" htmlFor={id}>{label}</label>
    {children}
    {hint && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{hint}</div>}
  </div>
);

/** Campo de data dd/mm/aaaa com máscara. */
const DateField: React.FC<{ id: string; label: string; value: string; onChange: (v: string) => void; hint?: React.ReactNode }> = ({
  id,
  label,
  value,
  onChange,
  hint
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
      required
    />
  </Field>
);

const JustificativaField: React.FC<{ id: string; value: string; onChange: (v: string) => void; hint: string }> = ({ id, value, onChange, hint }) => (
  <Field id={id} label="Justificativa do prazo *" hint={hint}>
    <input
      id={id}
      className="form-input"
      type="text"
      placeholder="Ex.: aguardando regularização no SICAF"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
    />
  </Field>
);

const FooterButtons: React.FC<{ onCancel: () => void; saving: boolean; submitLabel: string }> = ({ onCancel, saving, submitLabel }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
    <AppButton type="button" variant="outline" onClick={onCancel} disabled={saving}>
      Cancelar
    </AppButton>
    <AppButton type="submit" variant="primary" disabled={saving} isLoading={saving}>
      {saving ? 'Salvando...' : submitLabel}
    </AppButton>
  </div>
);

// -----------------------------------------------------------------------------
// Registrar ciclo
// -----------------------------------------------------------------------------
interface DocRow {
  tipo: string;
  numero: string;
  sei: string;
  valor: string;
}

export const CreateCycleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  contractKey: string;
  gestorNome?: string;
  registradoPorNome?: string;
  onSubmit: (input: CreatePaymentCycleInput) => Promise<void>;
}> = ({ isOpen, onClose, contractKey, gestorNome, registradoPorNome, onSubmit }) => {
  const hoje = todayISO();
  const [dataRecebimento, setDataRecebimento] = React.useState(isoToBR(hoje));
  const [vencimento, setVencimento] = React.useState('');
  const [valor, setValor] = React.useState('');
  const [docs, setDocs] = React.useState<DocRow[]>([{ tipo: 'Termo de Atesto', numero: '', sei: '', valor: '' }]);
  const [responsavel, setResponsavel] = React.useState<ResponsavelValue>({ nome: '' });
  const [prazo, setPrazo] = React.useState('');
  const [prazoTocado, setPrazoTocado] = React.useState(false);
  const [justificativa, setJustificativa] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const recebimentoISO = parseDateInputBR(dataRecebimento);
  const vencimentoISO = parseDateInputBR(vencimento);
  const padraoISO = recebimentoISO ? prazoPadraoISO('CONFERENCIA', recebimentoISO) : '';

  // O prazo acompanha o recebimento até o usuário escolher outra data.
  React.useEffect(() => {
    if (!prazoTocado && padraoISO) setPrazo(isoToBR(padraoISO));
  }, [padraoISO, prazoTocado]);

  const prazoISO = parseDateInputBR(prazo);
  const alongado = Boolean(prazoISO && padraoISO && prazoExigeJustificativa({ prazoISO, padraoISO }));

  const updateDoc = (idx: number, patch: Partial<DocRow>) =>
    setDocs((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recebimentoISO || !vencimentoISO) return;
    if (!docs.some((d) => d.tipo === 'Termo de Atesto')) {
      setError('Entre os documentos deve haver o Termo de Atesto, com o Id. SEI dele.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        contractKey,
        competencia: recebimentoISO.slice(0, 7),
        dataRecebimento: recebimentoISO,
        dataVencimentoFatura: vencimentoISO,
        valorAtesto: parseCurrencyInputBR(valor) ?? 0,
        documentos: docs.map((d) => ({
          tipo: d.tipo,
          numero: d.numero.trim() || undefined,
          sei: d.sei.trim(),
          valor: parseCurrencyInputBR(d.valor)
        })),
        prazoConferenciaAte: prazoISO || undefined,
        prazoPadrao: padraoISO || undefined,
        justificativaPrazo: alongado ? justificativa.trim() : undefined,
        responsavelNome: responsavel.nome.trim() || undefined,
        responsavelUserId: responsavel.nome.trim() ? responsavel.userId : undefined,
        registradoPorNome,
        // O acompanhamento de pagamento é feito pelos marcos; tarefas ficam no Plano de gestão.
        applyTaskTemplate: false
      });
      setDocs([{ tipo: 'Termo de Atesto', numero: '', sei: '', valor: '' }]);
      setValor('');
      setVencimento('');
      setResponsavel({ nome: '' });
      setPrazoTocado(false);
      setJustificativa('');
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível registrar o ciclo. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registrar documentos recebidos" size="lg" dismissible={!saving} testId="payment-cycle-modal">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="form-grid">
          <DateField id="payment-recebimento" label="Data de recebimento *" value={dataRecebimento} onChange={setDataRecebimento} hint="Início da contagem do prazo de conferência." />
          <DateField id="payment-vencimento" label="Vencimento da fatura *" value={vencimento} onChange={setVencimento} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Documentos recebidos *</div>
          {docs.map((d, idx) => (
            <div key={idx} data-testid={`payment-doc-row-${idx}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1.3fr) minmax(90px,0.8fr) minmax(110px,1fr) minmax(100px,0.9fr) auto', gap: '0.5rem', alignItems: 'end' }}>
              <Field id={`payment-doc-tipo-${idx}`} label={idx === 0 ? 'Tipo' : ' '}>
                <select id={`payment-doc-tipo-${idx}`} className="form-input" value={d.tipo} onChange={(e) => updateDoc(idx, { tipo: e.target.value })} required>
                  {TIPOS_DOCUMENTO_RECEBIDO.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field id={`payment-doc-numero-${idx}`} label={idx === 0 ? 'Nº' : ' '}>
                <input id={`payment-doc-numero-${idx}`} className="form-input" type="text" placeholder="1234" value={d.numero} onChange={(e) => updateDoc(idx, { numero: e.target.value })} />
              </Field>
              <Field id={`payment-doc-sei-${idx}`} label={idx === 0 ? 'Id. SEI *' : ' '}>
                <input id={`payment-doc-sei-${idx}`} className="form-input" type="text" placeholder="12345678" value={d.sei} onChange={(e) => updateDoc(idx, { sei: e.target.value })} required />
              </Field>
              <Field id={`payment-doc-valor-${idx}`} label={idx === 0 ? 'Valor (R$)' : ' '}>
                <input id={`payment-doc-valor-${idx}`} className="form-input" type="text" inputMode="numeric" placeholder="0,00" value={d.valor} onChange={(e) => updateDoc(idx, { valor: formatCurrencyInputBR(e.target.value) })} />
              </Field>
              <AppButton
                type="button"
                variant="ghostDanger"
                size="sm"
                iconOnly
                icon={<Trash2 size={15} />}
                disabled={idx === 0}
                onClick={() => setDocs((prev) => prev.filter((_, i) => i !== idx))}
                title="Remover documento"
              />
            </div>
          ))}
          <div>
            <AppButton type="button" variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => setDocs((prev) => [...prev, { tipo: 'Nota Fiscal Eletrônica', numero: '', sei: '', valor: '' }])}>
              Adicionar documento
            </AppButton>
          </div>
        </div>

        <div className="form-grid">
          <Field id="payment-valor-atesto" label="Valor atestado (R$) *">
            <input id="payment-valor-atesto" className="form-input" type="text" inputMode="numeric" placeholder="Ex: 15.450,00" value={valor} onChange={(e) => setValor(formatCurrencyInputBR(e.target.value))} required />
          </Field>
          <Field
            id="payment-cycle-responsavel"
            label="Servidor designado"
            hint={
              gestorNome
                ? 'Com o gestor do contrato selecionado, o ciclo acompanha automaticamente uma troca de Gestor Titular.'
                : 'Este contrato ainda não tem Gestor Titular. Defina-o no topo da página ou informe um responsável aqui.'
            }
          >
            <ResponsavelField id="payment-cycle-responsavel" value={responsavel} onChange={setResponsavel} gestorNome={gestorNome} gestorLabel="gestor do contrato" />
          </Field>
        </div>

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
        {alongado && (
          <JustificativaField id="payment-prazo-justificativa" value={justificativa} onChange={setJustificativa} hint="Prazo além do padrão exige justificativa." />
        )}

        {error && <NoticeBar tone="danger" testId="payment-cycle-error">{error}</NoticeBar>}
        <FooterButtons onCancel={onClose} saving={saving} submitLabel="Registrar ciclo" />
      </form>
    </Modal>
  );
};

// -----------------------------------------------------------------------------
// Registrar o próximo marco
// -----------------------------------------------------------------------------
type Resultado = 'EM_ORDEM' | 'COM_PENDENCIA' | 'PAGO' | 'DEVOLVIDO';

export function marcoActionLabel(cycle: PaymentFollowUpCycle): string | null {
  switch (cycle.status) {
    case 'RECEBIDO':
    case 'COM_PENDENCIA':
    case 'DEVOLVIDO':
      return 'Registrar conferência';
    case 'CONFERIDO':
      return 'Enviar à CGOFI';
    case 'ENVIADO_CGOFI':
      return 'Registrar resultado da CGOFI';
    default:
      return null;
  }
}

export const MarcoModal: React.FC<{
  cycle: PaymentFollowUpCycle | null;
  onClose: () => void;
  registradoPorNome?: string;
  onSubmit: (input: RegisterPaymentMarcoInput) => Promise<void>;
}> = ({ cycle, onClose, registradoPorNome, onSubmit }) => {
  const status = cycle?.status;
  const fase = status === 'CONFERIDO' ? 'ENVIO' : status === 'ENVIADO_CGOFI' ? 'CGOFI' : 'CONFERENCIA';
  const [resultado, setResultado] = React.useState<Resultado>(fase === 'CGOFI' ? 'PAGO' : 'EM_ORDEM');
  const [data, setData] = React.useState(isoToBR(todayISO()));
  const [sei, setSei] = React.useState('');
  const [numeroOb, setNumeroOb] = React.useState('');
  const [motivo, setMotivo] = React.useState('');
  const [origem, setOrigem] = React.useState<'FORNECEDOR' | 'FISCAL'>('FORNECEDOR');
  const [prazo, setPrazo] = React.useState('');
  const [prazoTocado, setPrazoTocado] = React.useState(false);
  const [justificativa, setJustificativa] = React.useState('');
  const [regularidade, setRegularidade] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Cada vez que um ciclo é aberto, o formulário recomeça com os padrões da etapa.
  React.useEffect(() => {
    if (!cycle) return;
    setResultado(fase === 'CGOFI' ? 'PAGO' : 'EM_ORDEM');
    setData(isoToBR(todayISO()));
    setSei('');
    setNumeroOb('');
    setMotivo('');
    setOrigem('FORNECEDOR');
    setPrazoTocado(false);
    setJustificativa('');
    setRegularidade(false);
    setError(null);
  }, [cycle?.cycleKey, status]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataISO = parseDateInputBR(data);

  // Qual prazo este formulário define: enviar (após conferir), cobrar a CGOFI (após enviar) ou nova conferência
  // (pendência ou devolução).
  const alvoEtapa: 'ENVIO' | 'COBRANCA_CGOFI' | 'CONFERENCIA' | null =
    fase === 'CONFERENCIA' ? (resultado === 'COM_PENDENCIA' ? 'CONFERENCIA' : 'ENVIO')
    : fase === 'ENVIO' ? 'COBRANCA_CGOFI'
    : resultado === 'DEVOLVIDO' ? 'CONFERENCIA'
    : null;

  const padraoISO = dataISO && alvoEtapa ? prazoPadraoISO(alvoEtapa, dataISO) : '';
  React.useEffect(() => {
    if (!prazoTocado) setPrazo(padraoISO ? isoToBR(padraoISO) : '');
  }, [padraoISO, prazoTocado]);

  if (!cycle) return null;

  const prazoISO = parseDateInputBR(prazo);
  const usaMotivoComoJustificativa = resultado === 'COM_PENDENCIA' || resultado === 'DEVOLVIDO';
  const alongado =
    Boolean(prazoISO && padraoISO) &&
    prazoExigeJustificativa({ prazoISO, padraoISO });
  const pedeJustificativa = alongado && !usaMotivoComoJustificativa;

  const titulo = marcoActionLabel(cycle) || 'Registrar marco';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataISO) return;
    let input: RegisterPaymentMarcoInput;
    const comum = { cycleKey: cycle.cycleKey, data: dataISO, registradoPorNome, prazoPadrao: padraoISO || undefined };
    if (fase === 'CONFERENCIA' && resultado === 'COM_PENDENCIA') {
      input = { ...comum, marco: 'PENDENCIA', motivo: motivo.trim(), origemPendencia: origem, prazoNovo: prazoISO || undefined };
    } else if (fase === 'CONFERENCIA') {
      input = { ...comum, marco: 'CONFERIDO', regularidadeVerificada: regularidade, prazoNovo: prazoISO || undefined, justificativa: pedeJustificativa ? justificativa.trim() : undefined };
    } else if (fase === 'ENVIO') {
      input = { ...comum, marco: 'ENVIADO_CGOFI', sei: sei.trim(), prazoNovo: prazoISO || undefined, justificativa: pedeJustificativa ? justificativa.trim() : undefined };
    } else if (resultado === 'DEVOLVIDO') {
      input = { ...comum, marco: 'DEVOLVIDO', motivo: motivo.trim(), prazoNovo: prazoISO || undefined };
    } else {
      input = { ...comum, marco: 'PAGO', numeroOb: numeroOb.trim() };
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
    <Modal isOpen onClose={onClose} title={titulo} size="md" dismissible={!saving} testId="payment-marco-modal">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {fase === 'CONFERENCIA' && (
          <Field id="marco-resultado" label="Resultado da conferência">
            <select id="marco-resultado" className="form-input" value={resultado} onChange={(e) => { setResultado(e.target.value as Resultado); setPrazoTocado(false); }}>
              <option value="EM_ORDEM">Em ordem</option>
              <option value="COM_PENDENCIA">Com pendência</option>
            </select>
          </Field>
        )}
        {fase === 'CONFERENCIA' && resultado === 'EM_ORDEM' && (
          <label htmlFor="marco-regularidade" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', color: '#334155' }}>
            <input
              id="marco-regularidade"
              type="checkbox"
              checked={regularidade}
              onChange={(e) => setRegularidade(e.target.checked)}
              required
              style={{ marginTop: '0.2rem' }}
            />
            <span>
              Regularidade fiscal e trabalhista do credor verificada (SICAF / CNDs) *
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>
                Se encontrou pendência (por exemplo, CND vencida), escolha "Com pendência" acima.
              </span>
            </span>
          </label>
        )}
        {fase === 'CGOFI' && (
          <Field id="marco-resultado" label="Resultado">
            <select id="marco-resultado" className="form-input" value={resultado} onChange={(e) => { setResultado(e.target.value as Resultado); setPrazoTocado(false); }}>
              <option value="PAGO">Pago (ordem bancária emitida)</option>
              <option value="DEVOLVIDO">Devolvido pela CGOFI</option>
            </select>
          </Field>
        )}

        <DateField
          id="marco-data"
          label={fase === 'ENVIO' ? 'Data de envio à CGOFI *' : resultado === 'PAGO' ? 'Data da ordem bancária *' : 'Data *'}
          value={data}
          onChange={(v) => { setData(v); setPrazoTocado(false); }}
        />

        {fase === 'ENVIO' && (
          <Field id="marco-sei" label="SEI do despacho *">
            <input id="marco-sei" className="form-input" type="text" placeholder="Ex: 12345678" value={sei} onChange={(e) => setSei(e.target.value)} required />
          </Field>
        )}

        {resultado === 'PAGO' && (
          <Field id="marco-ob" label="Número da ordem bancária *">
            <input id="marco-ob" className="form-input" type="text" placeholder="Ex: 2026OB800123" value={numeroOb} onChange={(e) => setNumeroOb(e.target.value)} required />
          </Field>
        )}

        {resultado === 'COM_PENDENCIA' && (
          <Field id="marco-origem" label="De quem é a pendência?">
            <select id="marco-origem" className="form-input" value={origem} onChange={(e) => setOrigem(e.target.value as 'FORNECEDOR' | 'FISCAL')}>
              <option value="FORNECEDOR">Do fornecedor</option>
              <option value="FISCAL">Do fiscal (CGLIC)</option>
            </select>
          </Field>
        )}

        {usaMotivoComoJustificativa && (
          <Field id="marco-motivo" label={resultado === 'DEVOLVIDO' ? 'Motivo da devolução *' : 'Motivo da pendência *'}>
            <input id="marco-motivo" className="form-input" type="text" placeholder="Ex.: CND vencida" value={motivo} onChange={(e) => setMotivo(e.target.value)} required />
          </Field>
        )}

        {alvoEtapa && (
          <DateField
            id="marco-prazo"
            label={
              alvoEtapa === 'ENVIO' ? 'Enviar à CGOFI até *'
              : alvoEtapa === 'COBRANCA_CGOFI' ? 'Cobrar a CGOFI em *'
              : 'Conferir novamente até *'
            }
            value={prazo}
            onChange={(v) => { setPrazo(v); setPrazoTocado(true); }}
            hint={
              alvoEtapa === 'COBRANCA_CGOFI'
                ? `Padrão: ${isoToBR(padraoISO)}. O prazo de pagamento é da CGOFI; esta é a data em que a CGLIC passa a cobrar.`
                : padraoISO ? `Prazo padrão: ${isoToBR(padraoISO)}.` : undefined
            }
          />
        )}
        {pedeJustificativa && (
          <JustificativaField id="marco-justificativa" value={justificativa} onChange={setJustificativa} hint="Prazo além do padrão exige justificativa." />
        )}

        {error && <NoticeBar tone="danger" testId="payment-marco-error">{error}</NoticeBar>}
        <FooterButtons onCancel={onClose} saving={saving} submitLabel="Registrar" />
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
    <Modal isOpen onClose={onClose} title="Cancelar ciclo" size="md" dismissible={!saving} testId="payment-cancel-modal">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <NoticeBar tone="warning" testId="payment-cancel-note">
          O ciclo continua no histórico, marcado como cancelado, e deixa de contar nos ciclos ativos e nos alertas.
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
        <FooterButtons onCancel={onClose} saving={saving} submitLabel="Cancelar ciclo" />
      </form>
    </Modal>
  );
};
