import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Modal } from '../../design-system/components/Modal';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppTextarea } from '../../design-system/components/FormFields';
import { formatPncpAtaUrl } from '../../utils/pncpUtils';
import type { RegistroFornecedorPncp } from '../../services/fornecedorAtaPncpService';
import type { CandidatoFornecedorPncp } from '../../services/api';

interface IndicarFornecedorModalProps {
  isOpen: boolean;
  registro: RegistroFornecedorPncp | null;
  onClose: () => void;
  onConfirm: (input: { fornecedorIdentificador: string; comoConfirmou: string }) => Promise<void>;
  isSaving?: boolean;
}

const formatQtd = (n: number) => n.toLocaleString('pt-BR');
const formatMoeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Linha "Item 3 · Vestuário Proteção · 16.896 un × R$ 1.416,97 = R$ 23.941.125,12". */
export function descreverItensDoCandidato(c: CandidatoFornecedorPncp): string[] {
  return c.itens.map((i) => `Item ${i.numeroItem} · ${i.descricao || 'sem descrição'} · ${formatQtd(i.quantidade)} un × ${formatMoeda(i.valorUnitario)} = ${formatMoeda(i.valorTotal)}`);
}

/** Fornecedor estrangeiro: o PNCP não tem CNPJ, só o código do SICAF ("ESTRANG…"). */
export const ehIdentificadorEstrangeiro = (identificador: string) => /^[A-Z]/.test(identificador);

/**
 * Janela em que o coordenador indica o fornecedor de uma ata que o PNCP publicou sem fornecedor. As opções são só os
 * fornecedores com resultado publicado na compra (o identificador gravado é o do PNCP, nunca digitado), e o
 * coordenador diz como confirmou (fica gravado com nome e data).
 */
export const IndicarFornecedorModal: React.FC<IndicarFornecedorModalProps> = ({ isOpen, registro, onClose, onConfirm, isSaving = false }) => {
  // A página monta a janela com `key` ao abrir: o estado começa do registro e não precisa ser reposto.
  const [escolha, setEscolha] = React.useState(registro?.fornecedorIdentificador || '');
  const [comoConfirmou, setComoConfirmou] = React.useState(registro?.comoConfirmou || '');
  const [erro, setErro] = React.useState<string | null>(null);

  if (!registro || !isOpen) return null;
  const compra = registro.numeroCompra && registro.anoCompra ? `${registro.numeroCompra}/${registro.anoCompra}` : registro.numeroCompra || 'não informada';
  const ataUrl = formatPncpAtaUrl(null, registro.numeroControlePncp, registro.numeroAta);
  const podeConfirmar = Boolean(escolha) && comoConfirmou.trim().length >= 10 && !isSaving;

  const confirmar = async () => {
    if (!podeConfirmar) return;
    setErro(null);
    try {
      await onConfirm({ fornecedorIdentificador: escolha, comoConfirmou: comoConfirmou.trim() });
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível gravar a indicação.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Indicar o fornecedor da ata ${registro.numeroAta}`}
      subtitle={`O PNCP publicou a ata sem informar o fornecedor. A compra ${compra} gerou ${registro.atasNaCompra ?? 'mais de uma'} ${registro.atasNaCompra === 1 ? 'ata' : 'atas'}. Escolha o fornecedor desta ata entre os que têm resultado publicado na compra. Confira no documento da ata antes de indicar.`}
      size="lg"
      dismissible={!isSaving}
      testId="indicar-fornecedor-modal"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={isSaving} />
          <ActionButton action="indicarFornecedor" type="button" onClick={confirmar} disabled={!podeConfirmar} isLoading={isSaving} data-testid="indicar-fornecedor-confirmar" />
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {ataUrl && (
          <a href={ataUrl} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)' }}>
            <ExternalLink size={14} /> Abrir a ata no PNCP (documento com o fornecedor)
          </a>
        )}

        <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <legend style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
            Fornecedores com resultado na compra
          </legend>
          {registro.candidatos.length === 0 && (
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>Nenhum item da compra tem resultado publicado no PNCP ainda. Não há fornecedor para indicar.</p>
          )}
          {registro.candidatos.map((c) => {
            const selecionado = escolha === c.identificador;
            const id = `fornecedor-${c.identificador}`;
            return (
              <label
                key={c.identificador}
                htmlFor={id}
                data-testid={`candidato-${c.identificador}`}
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'flex-start',
                  padding: '0.75rem 0.9rem',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: selecionado ? 'var(--color-info-bg)' : '#ffffff',
                  border: selecionado ? '2px solid var(--primary)' : '1px solid #cbd5e1'
                }}
              >
                <input
                  id={id}
                  type="radio"
                  name="fornecedor-da-ata"
                  value={c.identificador}
                  checked={selecionado}
                  onChange={() => setEscolha(c.identificador)}
                  disabled={isSaving}
                  style={{ marginTop: '3px' }}
                />
                <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>{c.nome || c.identificador}</span>
                  <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                    Identificador no PNCP: <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{c.identificador}</span>
                    {ehIdentificadorEstrangeiro(c.identificador) ? ' · fornecedor estrangeiro, sem CNPJ' : ''}
                  </span>
                  {descreverItensDoCandidato(c).map((linha) => (
                    <span key={linha} style={{ fontSize: '0.78rem', color: '#334155' }}>{linha}</span>
                  ))}
                </span>
              </label>
            );
          })}
        </fieldset>

        {registro.itensSemResultado.length > 0 && (
          <div style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#475569' }}>
            {registro.itensSemResultado.map((i) => (
              <div key={i.numeroItem}>
                Item {i.numeroItem} · {i.descricao || 'sem descrição'} · {formatQtd(i.quantidade)} un estimadas · ainda sem resultado publicado no PNCP. Não pode ser atribuído a nenhuma ata por enquanto; entra sozinho quando o PNCP publicar o resultado.
              </div>
            ))}
          </div>
        )}

        <AppTextarea
          label="Como você confirmou (obrigatório)"
          hint="Fica gravado quem indicou, quando e com base em quê. Mínimo de 10 caracteres."
          placeholder="Ex.: PDF da ata no PNCP, cláusula 2 (Empresa: ITURRI S.A.)"
          rows={2}
          value={comoConfirmou}
          onChange={(e) => setComoConfirmou(e.target.value)}
          disabled={isSaving}
          data-testid="indicar-fornecedor-como-confirmou"
          error={erro || undefined}
        />
      </div>
    </Modal>
  );
};
