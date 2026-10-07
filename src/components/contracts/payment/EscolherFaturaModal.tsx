import React from 'react';
import { Modal, NoticeBar } from '../../../design-system';
import type { PaymentFollowUpCycle } from '../../../types/paymentFollowUp';
import { FooterButtons, JustificativaField } from './PaymentCycleModals';
import { errorMessage, useFaturasDoCiclo } from './cicloPagamentoShared';
import { FaturasDoCiclo } from './FaturasDoCiclo';

/**
 * Escolher (ou trocar) a fatura de um ciclo já enviado à CGOFI: quando o sistema achou mais de uma candidata, ou a
 * fatura foi cadastrada depois do envio. A liquidação e a OB dela entram no ciclo na hora.
 */
export const EscolherFaturaModal: React.FC<{
  cycle: PaymentFollowUpCycle | null;
  contratoIdGov?: string | number | null;
  onClose: () => void;
  registradoPorNome?: string;
  onSubmit: (input: { cycleKey: string; faturas: number[]; justificativa?: string; registradoPorNome?: string }) => Promise<void>;
}> = ({ cycle, contratoIdGov, onClose, registradoPorNome, onSubmit }) => {
  const faturas = useFaturasDoCiclo(cycle, contratoIdGov, { incluirPagas: true });
  const [justificativa, setJustificativa] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setJustificativa('');
    setError(null);
  }, [cycle?.cycleKey]);

  if (!cycle) return null;
  const trocar = (cycle.faturas ?? []).length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (faturas.selecionadas.length === 0) return setError('Marque ao menos uma fatura.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        cycleKey: cycle.cycleKey,
        faturas: faturas.selecionadas,
        justificativa: faturas.divergente ? justificativa.trim() : undefined,
        registradoPorNome
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível ligar a fatura. Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={trocar ? 'Trocar a fatura do ciclo' : 'Escolher a fatura do ciclo'}
      size="lg"
      dismissible={!saving}
      testId="payment-escolher-fatura-modal"
      footer={<FooterButtons formId="payment-escolher-fatura-form" onCancel={onClose} saving={saving} submitLabel={trocar ? 'Trocar fatura' : 'Ligar fatura'} />}
    >
      <form id="payment-escolher-fatura-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <NoticeBar tone="info" testId="payment-escolher-fatura-info">
          Marque a fatura que este ciclo paga. A partir dela o sistema acompanha a liquidação no SIAFI e a ordem bancária no Tesouro; se
          ela já tiver sido liquidada ou paga, o ciclo é atualizado na hora.
        </NoticeBar>
        <FaturasDoCiclo
          cycle={cycle}
          estado={faturas}
          testIdPrefix="payment-escolher"
          semFaturaTexto="Nenhuma fatura deste contrato no Contratos.gov.br. Cadastre a fatura lá e use Buscar faturas agora."
        />
        {faturas.divergente && (
          <JustificativaField
            id="escolher-justificativa"
            label="Justificativa da diferença *"
            placeholder="Ex.: glosa aplicada depois do cadastro da fatura"
            value={justificativa}
            onChange={setJustificativa}
            hint="O valor do ciclo e o das faturas devem ser fiéis; a diferença fica registrada."
          />
        )}
        {error && <NoticeBar tone="danger" testId="payment-escolher-fatura-error">{error}</NoticeBar>}
      </form>
    </Modal>
  );
};
