import React from 'react';
import { ActionButton, AppTextarea, Modal, useToast } from '../../design-system';
import { useAusentesDaFonte } from '../../hooks/useAusentesDaFonte';
import { JUSTIFICATIVA_MAX, JUSTIFICATIVA_MIN } from '../../services/avisosResolvidosService';
import { rotuloAusente, trabalhoNaFonte } from '../../services/ausentesDaFonteService';
import { formatCurrency } from '../../utils/format';

interface Props {
  tipo: 'NOTA' | 'FATURA';
  chave: string;
  onClose: () => void;
}

/**
 * Decisão do coordenador sobre nota ou fatura que o Contratos.gov.br deixou de listar e que tem trabalho da equipe
 * (migration 113): manter ou retirar, com justificativa. O que a retirada apaga fica registrado na decisão.
 */
export const AusenteDaFonteDecisao: React.FC<Props> = ({ tipo, chave, onClose }) => {
  const { porChave, decidir } = useAusentesDaFonte();
  const toast = useToast();
  const [texto, setTexto] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  const a = porChave.get(`${tipo}|${chave}`);
  const gravando = decidir.isPending;
  const justificativa = texto.trim();
  const podeEnviar = justificativa.length >= JUSTIFICATIVA_MIN && !gravando;
  const nota = tipo === 'NOTA';

  const fechar = () => {
    if (!gravando) onClose();
  };

  const confirmar = async (decisao: 'MANTER' | 'RETIRAR') => {
    if (!podeEnviar) {
      setErro(`Escreva a justificativa com pelo menos ${JUSTIFICATIVA_MIN} caracteres.`);
      return;
    }
    setErro(null);
    try {
      await decidir.mutateAsync({ tipo, chave, decisao, justificativa });
      toast.success(decisao === 'MANTER' ? `${nota ? 'Nota mantida no contrato.' : 'Fatura mantida.'}` : `${nota ? 'Nota retirada do contrato.' : 'Fatura retirada.'}`);
      onClose();
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não foi possível gravar. Tente de novo.');
    }
  };

  return (
    <Modal
      isOpen
      onClose={fechar}
      dismissible={!gravando}
      size="md"
      title={nota ? 'Nota de empenho a conferir' : 'Fatura a conferir'}
      testId="ausente-da-fonte-dialog"
      footer={
        <>
          <ActionButton action="cancelar" size="sm" onClick={fechar} disabled={gravando} />
          <ActionButton action="retirarVinculo" size="sm" onClick={() => void confirmar('RETIRAR')} disabled={!podeEnviar || !a} data-testid="ausente-retirar">
            {nota ? 'Retirar nota' : 'Retirar fatura'}
          </ActionButton>
          <ActionButton action="manterVinculo" size="sm" onClick={() => void confirmar('MANTER')} disabled={!podeEnviar || !a} data-testid="ausente-manter">
            {nota ? 'Manter nota' : 'Manter fatura'}
          </ActionButton>
        </>
      }
    >
      {!a ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Esta {nota ? 'nota' : 'fatura'} já não está a conferir.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
            <strong>
              {rotuloAusente(a).replace(/^./, (c) => c.toUpperCase())}
              {a.valor !== undefined ? ` · ${formatCurrency(a.valor)}` : ''}
            </strong>
            <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '2px' }}>
              {a.gestorContrato ? `Gestor do contrato: ${a.gestorContrato}` : 'Contrato sem gestor definido'}
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155' }}>
            O Contratos.gov.br deixou de listar esta {nota ? 'nota' : 'fatura'} no contrato. Ela foi mantida porque {nota ? `tem ${trabalhoNaFonte(a)}` : trabalhoNaFonte(a)}.
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {nota ? (
              <>
                <li><strong>Manter nota</strong>: passa a ser vínculo da equipe, a sincronização não a tira mais e o trabalho fica.</li>
                <li><strong>Retirar nota</strong>: registra o cancelamento no histórico da nota e apaga a distribuição entre os itens e as quantidades informadas. A unidade interna da nota sai quando o item for aberto.</li>
              </>
            ) : (
              <>
                <li><strong>Manter fatura</strong>: a fatura e a ligação com o ciclo ficam, sem voltar a avisar.</li>
                <li><strong>Retirar fatura</strong>: apaga a fatura e a ligação com o ciclo de pagamento. O ciclo continua.</li>
              </>
            )}
          </ul>
          <AppTextarea
            label="Justificativa (obrigatória)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={JUSTIFICATIVA_MAX}
            rows={3}
            placeholder={nota ? 'Ex.: a nota foi anulada no SIAFI; confirmado com o fiscal' : 'Ex.: fatura substituída pela 123; confirmado com a CGOFI'}
            error={erro ?? undefined}
            data-testid="ausente-justificativa"
          />
        </div>
      )}
    </Modal>
  );
};
