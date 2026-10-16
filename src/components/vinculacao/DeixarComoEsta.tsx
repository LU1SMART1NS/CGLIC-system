import React from 'react';
import { ActionButton, AppTextarea, Modal, StatusBadge, useToast } from '../../design-system';
import { useAvisosResolvidos } from '../../hooks/useAvisosResolvidos';
import { JUSTIFICATIVA_MAX, JUSTIFICATIVA_MIN, type AvisoResolvido } from '../../services/avisosResolvidosService';
import { dataBR } from '../financeiro/financeiroFormat';

/** O que vai ser deixado como está: a chave da marca (avisos_resolvidos, tipo FONTE) e o resumo mostrado na janela. */
export interface AlvoDeixarComoEsta {
  chave: string;
  titulo: string;
  contexto?: string;
}

const subtle: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', fontWeight: 600 };

/**
 * "Deixar como está" nas filas de empenho, para linhas de contrato encerrado (decisão de 15/10/2026): a linha sai
 * da fila e do número do menu, com justificativa obrigatória, quem e quando; Reexibir desfaz. Grava na mesma
 * tabela do ✓ Resolvido dos avisos (avisos_resolvidos, tipo FONTE), sem migration.
 */
export function useDeixarComoEsta(regra: string) {
  const toast = useToast();
  const { porChave, resolver, reexibir, podeResolver } = useAvisosResolvidos();
  const [alvo, setAlvo] = React.useState<AlvoDeixarComoEsta | null>(null);
  const [texto, setTexto] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  const [gravando, setGravando] = React.useState(false);

  const abrir = React.useCallback((a: AlvoDeixarComoEsta) => {
    setAlvo(a);
    setTexto('');
    setErro(null);
  }, []);
  const fechar = () => {
    if (!gravando) setAlvo(null);
  };

  const confirmar = async () => {
    if (!alvo) return;
    const justificativa = texto.trim();
    if (justificativa.length < JUSTIFICATIVA_MIN) {
      setErro(`Escreva a justificativa com pelo menos ${JUSTIFICATIVA_MIN} caracteres.`);
      return;
    }
    setGravando(true);
    setErro(null);
    try {
      await resolver.mutateAsync({ chave: alvo.chave, tipo: 'FONTE', justificativa });
      toast.success(`${alvo.titulo} deixada como está.`);
      setAlvo(null);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não foi possível gravar. Tente de novo.');
    } finally {
      setGravando(false);
    }
  };

  const reexibirLinha = (chave: string, titulo: string) =>
    reexibir.mutate(
      { chave },
      {
        onSuccess: () => toast.success(`${titulo} voltou para a fila.`),
        onError: (err) => toast.error(err.message)
      }
    );

  const dialog = (
    <Modal
      isOpen={Boolean(alvo)}
      onClose={fechar}
      dismissible={!gravando}
      size="sm"
      title="Deixar como está"
      subtitle="A linha sai da fila e do número do menu. Fica registrado quem decidiu e por quê."
      testId="deixar-como-esta-dialog"
      footer={
        <>
          <ActionButton action="cancelar" size="sm" onClick={fechar} disabled={gravando} />
          <ActionButton action="confirmar" size="sm" onClick={() => void confirmar()} disabled={gravando} data-testid="deixar-como-esta-confirmar">
            {gravando ? 'Gravando...' : 'Deixar como está'}
          </ActionButton>
        </>
      }
    >
      {alvo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
            <strong>{alvo.titulo}</strong>
            {alvo.contexto && <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '2px' }}>{alvo.contexto}</div>}
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>{regra}</p>
          <AppTextarea
            label="Justificativa (obrigatória)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={JUSTIFICATIVA_MAX}
            rows={4}
            placeholder="Ex.: contrato encerrado e pago; o empenhado por item não muda mais nada."
            error={erro ?? undefined}
            autoFocus
            data-testid="deixar-como-esta-justificativa"
          />
        </div>
      )}
    </Modal>
  );

  return { abrir, dialog, porChave, reexibir: reexibirLinha, reexibindo: reexibir.isPending, podeDeixar: podeResolver };
}

/** Na coluna de situação: "Deixada como está · quem, quando" e a justificativa. */
export const MarcaDeixada: React.FC<{ marca: AvisoResolvido; testId?: string }> = ({ marca, testId }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }} data-testid={testId}>
    <StatusBadge label="Deixada como está" variant="neutral" size="sm" dot={false} />
    <div style={subtle}>
      {marca.resolvidoPorNome || '—'}, {dataBR(marca.resolvidoEm)}
    </div>
    <div style={{ fontSize: '0.76rem', fontStyle: 'italic', color: '#0f172a', whiteSpace: 'normal', maxWidth: '46ch' }}>{marca.justificativa}</div>
  </div>
);

/** "contrato encerrado em 06/05/2025" (ou só "contrato encerrado", sem data). */
export function textoEncerrado(vigenciaFim?: string): string {
  return vigenciaFim ? `contrato encerrado em ${dataBR(vigenciaFim)}` : 'contrato encerrado';
}
