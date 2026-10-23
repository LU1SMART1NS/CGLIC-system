import React, { useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { useJuntarBeneficiarios } from '../../hooks/useEmendas';
import { formatarCnpj, localDoBeneficiario, nomeESigla, rotuloBeneficiario, type BeneficiarioEmenda } from '../../services/emendasService';
import { saoParecidos } from '../../utils/emendasBeneficiarios';

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

interface Props {
  /** O cadastro de onde a pessoa abriu a janela. */
  base: BeneficiarioEmenda;
  /** O outro, quando a janela vem de um par parecido. */
  outro?: BeneficiarioEmenda;
  lista: BeneficiarioEmenda[];
  /** Indicações (linhas das emendas) de cada beneficiário, para dizer quantas passam. */
  linhasPorBeneficiario: Map<string, number>;
  onClose: () => void;
}

const opcao = (marcada: boolean): React.CSSProperties => ({
  border: `2px solid ${marcada ? 'var(--primary, #0c326f)' : 'var(--color-border, #e2e8f0)'}`,
  background: marcada ? 'var(--color-primary-soft, #e0e7f5)' : 'var(--color-surface, #fff)',
  color: 'var(--color-text, #0f172a)',
  borderRadius: 8,
  padding: '0.65rem 0.8rem',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
  minWidth: 0
});
const pequeno: React.CSSProperties = { fontSize: '0.76rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 600 };

/** Junta dois cadastros do mesmo beneficiário (migration 166): as linhas passam para o que fica e o outro some. */
export const JuntarBeneficiariosModal: React.FC<Props> = ({ base, outro, lista, linhasPorBeneficiario, onClose }) => {
  const juntar = useJuntarBeneficiarios();
  const toast = useToast();
  const [outroId, setOutroId] = useState(outro?.id ?? '');
  const [ficaId, setFicaId] = useState(base.id);
  const [motivo, setMotivo] = useState('');
  const [tentou, setTentou] = useState(false);

  // Parecidos primeiro, depois os demais na ordem do nome.
  const candidatos = useMemo(() => {
    const outros = lista.filter((b) => b.id !== base.id && b.ativo);
    return [...outros.filter((b) => saoParecidos(base, b)), ...outros.filter((b) => !saoParecidos(base, b))];
  }, [lista, base]);

  const segundo = lista.find((b) => b.id === outroId);
  const fica = ficaId === base.id ? base : segundo;
  const sai = ficaId === base.id ? segundo : base;
  const cnpjDiferente = Boolean(base.cnpj && segundo?.cnpj && base.cnpj !== segundo.cnpj);
  const linhasQueSaem = sai ? linhasPorBeneficiario.get(sai.id) ?? 0 : 0;

  const enviar = async () => {
    setTentou(true);
    if (!fica || !sai || !motivo.trim() || cnpjDiferente) return;
    try {
      const r = await juntar.mutateAsync({ fica, sai, motivo: motivo.trim() });
      toast.success(`${rotuloBeneficiario(sai)} juntado a ${rotuloBeneficiario(fica)} (${plural(r.linhas, 'indicação passou', 'indicações passaram')}).`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const cartao = (b: BeneficiarioEmenda) => (
    <label key={b.id} style={opcao(ficaId === b.id)} data-testid={`emendas-juntar-fica-${b.id}`}>
      <span style={{ ...pequeno, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <input type="radio" name="emendas-juntar-fica" checked={ficaId === b.id} onChange={() => setFicaId(b.id)} />
        {ficaId === b.id ? 'Fica' : 'Sai'}
      </span>
      <b style={{ lineHeight: 1.35 }}>{nomeESigla(b)}</b>
      <span style={pequeno}>{[b.orgao, localDoBeneficiario(b)].filter(Boolean).join(' · ') || 'Sem órgão e local'}</span>
      <span style={pequeno}>
        {plural(linhasPorBeneficiario.get(b.id) ?? 0, 'indicação', 'indicações')} · {b.cnpj ? `CNPJ ${formatarCnpj(b.cnpj)}` : 'Falta CNPJ'}
      </span>
    </label>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!juntar.isPending}
      size="md"
      testId="emendas-juntar-modal"
      title="Juntar beneficiários repetidos"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={juntar.isPending} />
          <AppButton type="button" onClick={() => void enviar()} disabled={juntar.isPending || !segundo} isLoading={juntar.isPending} data-testid="emendas-juntar-confirmar">
            Juntar os dois
          </AppButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)' }}>Escolha qual cadastro fica. As indicações das emendas do outro passam para ele e o outro deixa de existir.</span>
        {!outro && (
          <AppSelect label="Juntar com" value={outroId} onChange={(e) => setOutroId(e.target.value)} data-testid="emendas-juntar-outro">
            <option value="">Escolha o outro cadastro</option>
            {candidatos.map((b) => (
              <option key={b.id} value={b.id}>
                {[nomeESigla(b), localDoBeneficiario(b)].filter(Boolean).join(' · ')}
              </option>
            ))}
          </AppSelect>
        )}
        {segundo && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '0.6rem' }}>
            {cartao(base)}
            {cartao(segundo)}
          </div>
        )}
        {fica && sai && (
          <div style={{ background: 'var(--color-surface-2, #f8fafc)', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.84rem', lineHeight: 1.5 }} data-testid="emendas-juntar-resumo">
            {linhasQueSaem > 0 ? (
              <>
                {plural(linhasQueSaem, 'indicação passa', 'indicações passam')} para <b>{rotuloBeneficiario(fica)}</b>.{' '}
              </>
            ) : null}
            O nome do outro fica guardado como outra grafia, para a busca achar pelos dois. O que só o outro tem preenchido (CNPJ, endereço, contato) passa para o que fica.
          </div>
        )}
        {cnpjDiferente && (
          <div role="alert" style={{ fontSize: '0.8rem', fontWeight: 600, padding: '0.5rem 0.7rem', borderRadius: 6, background: 'var(--color-danger-bg, #fdecea)', color: 'var(--color-danger, #b11b05)' }}>
            Os dois têm CNPJ diferentes. Confira antes de juntar: podem ser órgãos diferentes.
          </div>
        )}
        <AppTextarea
          label="Por que são o mesmo beneficiário? *"
          hint="Fica no histórico, com quem juntou e quando."
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          error={tentou && !motivo.trim() ? 'Diga por que os dois são o mesmo.' : undefined}
          data-testid="emendas-juntar-motivo"
        />
      </div>
    </Modal>
  );
};
