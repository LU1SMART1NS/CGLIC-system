import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActionButton, Modal, NoticeBar } from '../../../design-system';
import type { PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import type { RegisterPaymentMarcoInput } from '../../../adapters/paymentCycleRpcAdapter';
import { buscarFaturasDoContratoAgora, ehBemAIncorporar, fetchFaturasParaCiclo, type FaturaParaCiclo } from '../../../services/cicloPagamentoApoioService';
import { DateField, Field, FooterButtons, JustificativaField } from './PaymentCycleModals';
import { errorMessage, faturasSugeridas, useEmpenhosDoContrato } from './cicloPagamentoShared';
import { isoToBR, parseDateInputBR, prazoExigeJustificativa, prazoPadraoISO, todayISO } from './paymentFormUtils';

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
  const queryClient = useQueryClient();
  const contractKey = cycle?.contractKey;
  const { data: faturas = [], isLoading, refetch } = useQuery({
    queryKey: ['ciclo-faturas-disponiveis', contractKey],
    queryFn: () => fetchFaturasParaCiclo(contractKey as string),
    enabled: Boolean(contractKey),
    staleTime: 60 * 1000
  });
  const { data: empenhos = [] } = useEmpenhosDoContrato(contractKey);

  const [selecionadas, setSelecionadas] = React.useState<number[]>([]);
  const [tocouSelecao, setTocouSelecao] = React.useState(false);
  const [sei, setSei] = React.useState('');
  const [data, setData] = React.useState(isoToBR(todayISO()));
  const [prazo, setPrazo] = React.useState('');
  const [prazoTocado, setPrazoTocado] = React.useState(false);
  const [justificativaPrazo, setJustificativaPrazo] = React.useState('');
  const [justificativaValor, setJustificativaValor] = React.useState('');
  const [colog, setColog] = React.useState(false);
  const [buscando, setBuscando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const empenhosDoCiclo = new Set((cycle?.itens ?? []).map((i) => i.empenhoCanonicalKey).concat(cycle?.input.empenhoCanonicalKey ?? []));
  const naturezas = empenhos.filter((e) => empenhosDoCiclo.has(e.canonicalKey)).map((e) => e.naturezaDespesa);
  const temBem = naturezas.some((n) => ehBemAIncorporar(n));
  const naturezaDesconhecida = naturezas.length === 0 || naturezas.some((n) => !n);

  React.useEffect(() => {
    setTocouSelecao(false);
    setSei('');
    setData(isoToBR(todayISO()));
    setPrazoTocado(false);
    setJustificativaPrazo('');
    setJustificativaValor('');
    setAviso(null);
    setError(null);
  }, [cycle?.cycleKey]);

  React.useEffect(() => {
    if (cycle && !tocouSelecao) setSelecionadas(faturasSugeridas(faturas, cycle));
  }, [faturas, cycle, tocouSelecao]);

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
  const soma = faturas.filter((f) => selecionadas.includes(f.idFatura)).reduce((s, f) => s + f.valorLiquido, 0);
  const divergente = selecionadas.length > 0 && Math.abs(soma - cycle.input.valorAtesto) >= 0.01;
  // Faturas que citam um empenho do ciclo vêm primeiro.
  const citaEmpenho = (f: FaturaParaCiclo) =>
    [...empenhosDoCiclo].some((k) => {
      const numero = empenhos.find((e) => e.canonicalKey === k)?.numero;
      return Boolean(numero && f.empenhos?.includes(numero));
    });
  const lista = [...faturas].sort((a, b) => Number(citaEmpenho(b)) - Number(citaEmpenho(a)));

  const alternar = (id: number) => {
    setTocouSelecao(true);
    setSelecionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const buscarAgora = async () => {
    if (!contratoIdGov || !contractKey) return;
    setBuscando(true);
    setAviso(null);
    try {
      const n = await buscarFaturasDoContratoAgora(contractKey, contratoIdGov);
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ['financeiro-faturas'] });
      setAviso(`Faturas do contrato consultadas agora no Contratos.gov.br: ${n} gravada(s).`);
    } catch (err) {
      setAviso(errorMessage(err, 'O Contratos.gov.br não respondeu. Tente de novo em instantes.'));
    } finally {
      setBuscando(false);
    }
  };

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>Faturas cadastradas no Contratos.gov.br</div>
          {contratoIdGov && (
            <ActionButton action="sincronizar" type="button" size="sm" onClick={() => void buscarAgora()} disabled={buscando} label={buscando ? 'Buscando...' : 'Buscar faturas agora'} />
          )}
        </div>
        {aviso && <NoticeBar tone="info" testId="payment-envio-aviso">{aviso}</NoticeBar>}
        {isLoading ? (
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Carregando as faturas…</div>
        ) : lista.length === 0 ? (
          <NoticeBar tone="warning" testId="payment-envio-sem-fatura">
            Nenhuma fatura em aberto deste contrato no Contratos.gov.br. Você pode enviar assim mesmo: o sistema liga a fatura depois,
            pelo empenho e pelo valor, quando ela aparecer.
          </NoticeBar>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }} data-testid="payment-envio-faturas">
            {lista.map((f) => {
              const emOutro = Boolean(f.cicloId && f.cicloId !== cycle.id);
              return (
                <label
                  key={f.idFatura}
                  htmlFor={`fatura-${f.idFatura}`}
                  style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', opacity: emOutro ? 0.55 : 1 }}
                >
                  <input id={`fatura-${f.idFatura}`} type="checkbox" checked={selecionadas.includes(f.idFatura)} disabled={emOutro} onChange={() => alternar(f.idFatura)} style={{ marginTop: '0.2rem' }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    <strong>
                      {f.numero ? `NF ${f.numero}` : `Fatura ${f.idFatura}`} · {moeda(f.valorLiquido)}
                    </strong>
                    <span style={{ color: '#64748b' }}>
                      {[f.referencia ? `ref. ${f.referencia}` : null, f.empenhos, f.situacao, f.liquidada ? 'já liquidada' : null, emOutro ? 'já está em outro ciclo' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {selecionadas.length > 0 && (
          <NoticeBar tone={divergente ? 'warning' : 'success'} testId="payment-envio-conferencia-valor">
            Ciclo {moeda(cycle.input.valorAtesto)} {divergente ? '≠' : '='} faturas {moeda(soma)}
            {divergente ? `: diferença de ${moeda(Math.abs(soma - cycle.input.valorAtesto))}.` : '.'}
          </NoticeBar>
        )}
        {selecionadas.length === 0 && lista.length > 0 && (
          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
            Sem fatura marcada, o sistema tenta ligar sozinho depois (mesmo empenho e mesmo valor) e pede confirmação se houver dúvida.
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
