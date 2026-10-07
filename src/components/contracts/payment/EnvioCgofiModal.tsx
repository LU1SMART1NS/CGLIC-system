import React from 'react';
import { Modal, NoticeBar } from '../../../design-system';
import type { PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import type { RegisterPaymentMarcoInput } from '../../../adapters/paymentCycleRpcAdapter';
import { ehBemAIncorporar } from '../../../services/cicloPagamentoApoioService';
import { DateField, Field, FooterButtons, JustificativaField } from './PaymentCycleModals';
import { errorMessage, useFaturasDoCiclo } from './cicloPagamentoShared';
import { FaturasDoCiclo } from './FaturasDoCiclo';
import { isoToBR, parseDateInputBR, prazoExigeJustificativa, prazoPadraoISO, todayISO } from './paymentFormUtils';

/**
 * Envio à CGOFI: liga o ciclo às faturas que a CGLIC cadastrou no Contratos.gov.br (o sistema acompanha a liquidação
 * e a ordem bancária delas) e, quando há bem a incorporar (ND 449052), envia à COLOG no mesmo despacho.
 */
export const EnvioCgofiModal: React.FC<{
  cycle: PaymentFollowUpCycle | null;
  /** Id do contrato no Contratos.gov.br, para "Buscar faturas agora". */
  contratoIdGov?: string | number | null;
  onClose: () => void;
  registradoPorNome?: string;
  onSubmit: (input: RegisterPaymentMarcoInput) => Promise<void>;
}> = ({ cycle, contratoIdGov, onClose, registradoPorNome, onSubmit }) => {
  const faturasDoCiclo = useFaturasDoCiclo(cycle, contratoIdGov);
  const { empenhos, empenhosDoCiclo, selecionadas, divergente, lista } = faturasDoCiclo;
  const [sei, setSei] = React.useState('');
  const [data, setData] = React.useState(isoToBR(todayISO()));
  const [prazo, setPrazo] = React.useState('');
  const [prazoTocado, setPrazoTocado] = React.useState(false);
  const [justificativaPrazo, setJustificativaPrazo] = React.useState('');
  const [justificativaValor, setJustificativaValor] = React.useState('');
  const [colog, setColog] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const naturezas = empenhos.filter((e) => empenhosDoCiclo.has(e.canonicalKey)).map((e) => e.naturezaDespesa);
  const temBem = naturezas.some((n) => ehBemAIncorporar(n));
  const naturezaDesconhecida = naturezas.length === 0 || naturezas.some((n) => !n);

  React.useEffect(() => {
    setSei('');
    setData(isoToBR(todayISO()));
    setPrazoTocado(false);
    setJustificativaPrazo('');
    setJustificativaValor('');
    setError(null);
  }, [cycle?.cycleKey]);

  React.useEffect(() => {
    setColog(temBem);
  }, [temBem, cycle?.cycleKey]);

  const dataISO = parseDateInputBR(data);
  const padraoISO = dataISO ? prazoPadraoISO('COBRANCA_CGOFI', dataISO) : '';
  React.useEffect(() => {
    if (!prazoTocado) setPrazo(padraoISO ? isoToBR(padraoISO) : '');
  }, [padraoISO, prazoTocado]);

  if (!cycle) return null;

  const prazoISO = parseDateInputBR(prazo);
  const alongado = Boolean(prazoISO && padraoISO && prazoExigeJustificativa({ prazoISO, padraoISO }));
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataISO) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        cycleKey: cycle.cycleKey,
        marco: 'ENVIADO_CGOFI',
        data: dataISO,
        sei: sei.trim(),
        faturas: selecionadas,
        enviarColog: colog,
        prazoNovo: prazoISO || undefined,
        prazoPadrao: padraoISO || undefined,
        justificativa: divergente ? justificativaValor.trim() : alongado ? justificativaPrazo.trim() : undefined,
        registradoPorNome
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível registrar o envio. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Enviar à CGOFI"
      size="lg"
      dismissible={!saving}
      testId="payment-envio-modal"
      footer={<FooterButtons formId="payment-envio-form" onCancel={onClose} saving={saving} submitLabel={colog ? 'Enviar à CGOFI e à COLOG' : 'Enviar à CGOFI'} />}
    >
      <form id="payment-envio-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <FaturasDoCiclo
          cycle={cycle}
          estado={faturasDoCiclo}
          testIdPrefix="payment-envio"
          semFaturaTexto="Nenhuma fatura em aberto deste contrato no Contratos.gov.br. Você pode enviar assim mesmo e escolher a fatura depois, no ciclo; o sistema também tenta ligar sozinho pelo empenho e pelo valor."
        />
        {selecionadas.length === 0 && lista.length > 0 && (
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Sem fatura marcada, o sistema tenta ligar sozinho depois (mesmo empenho e mesmo valor); havendo dúvida, escolha a fatura no ciclo.
          </div>
        )}
        {divergente && (
          <JustificativaField
            id="envio-justificativa-valor"
            label="Justificativa da diferença *"
            placeholder="Ex.: glosa aplicada depois do cadastro da fatura"
            value={justificativaValor}
            onChange={setJustificativaValor}
            hint="O valor do ciclo e o das faturas devem ser fiéis; a diferença fica registrada."
          />
        )}

        <div className="form-grid">
          <Field id="envio-sei" label="SEI do despacho *">
            <input id="envio-sei" className="form-input" type="text" value={sei} onChange={(e) => setSei(e.target.value)} required />
          </Field>
          <DateField id="envio-data" label="Data de envio *" value={data} onChange={(v) => { setData(v); setPrazoTocado(false); }} />
        </div>

        {(temBem || naturezaDesconhecida) && (
          <label htmlFor="envio-colog" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'var(--color-info-bg)', fontSize: '0.85rem' }}>
            <input id="envio-colog" type="checkbox" checked={colog} onChange={(e) => setColog(e.target.checked)} style={{ marginTop: '0.2rem' }} />
            <span>
              <strong>Enviar também à COLOG</strong> (bens a incorporar, Portaria 50, art. 5º, § 5º)
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#475569' }}>
                {temBem
                  ? 'Empenho com natureza de despesa 449052 (equipamentos e material permanente).'
                  : 'A natureza de despesa do empenho ainda não foi lida do Contratos.gov.br: marque se for bem permanente.'}
              </span>
            </span>
          </label>
        )}

        <DateField
          id="envio-cobrar"
          label="Cobrar a CGOFI em *"
          value={prazo}
          onChange={(v) => { setPrazo(v); setPrazoTocado(true); }}
          hint={padraoISO ? `Padrão: ${isoToBR(padraoISO)}. A liquidação e a OB entram sozinhas quando aparecerem nas fontes.` : undefined}
        />
        {alongado && !divergente && (
          <JustificativaField id="envio-justificativa-prazo" value={justificativaPrazo} onChange={setJustificativaPrazo} hint="Prazo além do padrão exige justificativa." />
        )}

        {error && <NoticeBar tone="danger" testId="payment-envio-error">{error}</NoticeBar>}
      </form>
    </Modal>
  );
};
