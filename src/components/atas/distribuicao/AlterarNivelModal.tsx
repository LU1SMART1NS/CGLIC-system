import React from 'react';
import { Modal } from '../../../design-system/components/Modal';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { useGestorNivelHistorico, useSalvarGestorNivel } from '../../../hooks/useGestorNiveis';
import {
  CAPACIDADE_NIVEL,
  DESCRICAO_NIVEL,
  MOTIVOS_NIVEL,
  NIVEIS_GESTOR,
  ROTULO_NIVEL,
  capacidadeDe,
  ocupacao,
  percentual,
  type NivelGestor,
  type NivelRegistrado
} from './nivelGestor';

interface AlterarNivelModalProps {
  userId: string;
  nome: string;
  atual: NivelRegistrado | null;
  /** Nível já marcado ao abrir (ex.: "Subir para Intermediário"). */
  sugerido?: NivelGestor;
  /** Carga do gestor, para mostrar como a ocupação muda. */
  carga: number;
  /** Motivo já preenchido ao abrir. */
  motivoInicial?: string;
  onClose: () => void;
}

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/** Nível do gestor (só coordenador): escolhe o nível, com motivo obrigatório; mostra o histórico de mudanças. */
export const AlterarNivelModal: React.FC<AlterarNivelModalProps> = ({ userId, nome, atual, sugerido, carga, motivoInicial = '', onClose }) => {
  const salvar = useSalvarGestorNivel();
  const { data: historico = [] } = useGestorNivelHistorico(userId);
  const [nivel, setNivel] = React.useState<NivelGestor | null>(sugerido ?? atual?.nivel ?? null);
  const [motivo, setMotivo] = React.useState(motivoInicial);

  const mudou = nivel !== null && nivel !== atual?.nivel;
  const podeSalvar = mudou && motivo.trim().length > 0 && !salvar.isPending;
  const primeiroNome = nome.split(' ')[0];

  const handleSalvar = () => {
    if (!podeSalvar || !nivel) return;
    salvar.mutate({ userId, nivel, motivo: motivo.trim() }, { onSuccess: onClose });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!salvar.isPending}
      size="md"
      title={`Nível de ${nome}`}
      subtitle="Só o coordenador altera. O nível muda a capacidade usada na ocupação."
      testId="alterar-nivel-modal"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvar.isPending} />
          <ActionButton
            action="salvar"
            type="button"
            onClick={handleSalvar}
            disabled={!podeSalvar}
            isLoading={salvar.isPending}
            data-testid="alterar-nivel-salvar"
          >
            {mudou && nivel ? `Salvar como ${ROTULO_NIVEL[nivel]}` : 'Escolha outro nível'}
          </ActionButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div role="radiogroup" aria-label="Nível" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {NIVEIS_GESTOR.map((n) => {
            const sel = nivel === n;
            return (
              <label
                key={n}
                data-testid={`alterar-nivel-${n}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '18px 1fr auto',
                  gap: '0.6rem',
                  alignItems: 'center',
                  minHeight: '44px',
                  padding: '0.55rem 0.75rem',
                  border: `1px solid ${sel ? 'var(--primary)' : '#e2e8f0'}`,
                  background: sel ? 'var(--color-info-bg)' : '#ffffff',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                <input type="radio" name="alterar-nivel" checked={sel} onChange={() => setNivel(n)} />
                <span style={{ fontSize: '0.84rem' }}>
                  <strong>{ROTULO_NIVEL[n]}</strong>
                  {atual?.nivel === n && <span style={{ color: '#64748b', fontWeight: 600 }}> · atual</span>}
                  <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>{DESCRICAO_NIVEL[n]}</span>
                </span>
                <strong style={{ fontSize: '0.84rem' }}>{percentual(CAPACIDADE_NIVEL[n])}</strong>
              </label>
            );
          })}
        </div>

        {mudou && nivel && (
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-warning-text)', background: 'var(--color-warning-bg)', borderRadius: '6px', padding: '0.5rem 0.7rem' }}>
            Ocupação de {primeiroNome}: {Math.round(ocupacao(carga, capacidadeDe(atual?.nivel)))} → {Math.round(ocupacao(carga, CAPACIDADE_NIVEL[nivel]))}
            {CAPACIDADE_NIVEL[nivel] < capacidadeDe(atual?.nivel) ? '. Baixar o nível aumenta a ocupação.' : '.'}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <label htmlFor="alterar-nivel-motivo" style={{ fontSize: '0.78rem', fontWeight: 700 }}>Motivo (obrigatório)</label>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {MOTIVOS_NIVEL.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                style={{
                  font: 'inherit',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: `1px solid ${motivo === m ? 'var(--primary)' : '#e2e8f0'}`,
                  background: motivo === m ? 'var(--color-info-bg)' : '#f8fafc',
                  color: '#0f172a',
                  borderRadius: '999px',
                  padding: '0.2rem 0.6rem',
                  cursor: 'pointer'
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <textarea
            id="alterar-nivel-motivo"
            className="form-input"
            maxLength={300}
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            data-testid="alterar-nivel-motivo"
          />
        </div>

        <div style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: 1.6, borderTop: '1px solid #f1f5f9', paddingTop: '0.6rem' }}>
          <strong style={{ color: '#0f172a' }}>Histórico</strong>
          {historico.length === 0 ? (
            <div>Nível ainda não informado. Até lá, a ocupação usa a capacidade de Intermediário.</div>
          ) : (
            historico.map((h) => (
              <div key={`${h.criadoEm}-${h.nivel}`}>
                {dataCurta(h.criadoEm)} · {h.nivelAnterior && h.nivelAnterior !== h.nivel ? `${ROTULO_NIVEL[h.nivelAnterior]} → ` : ''}
                {ROTULO_NIVEL[h.nivel]} · “{h.motivo}”{h.definidoPorNome ? ` · ${h.definidoPorNome}` : ''}
              </div>
            ))
          )}
        </div>

        {salvar.isError && (
          <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--color-danger-text)', fontWeight: 600 }}>
            Erro ao salvar: {(salvar.error as Error).message}
          </div>
        )}
      </div>
    </Modal>
  );
};
