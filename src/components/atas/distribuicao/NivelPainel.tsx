import React from 'react';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { ROTULO_NIVEL, mesAno, percentual, type AvaliacaoSubida, type NivelGestor } from './nivelGestor';
import type { NivelDoGestor } from './EquipeFila';

interface NivelPainelProps {
  nome: string;
  nivel: NivelDoGestor;
  avaliacao: AvaliacaoSubida | null;
  capacidade: number;
  podeAlterar: boolean;
  onAlterar: (sugerido?: NivelGestor, motivo?: string) => void;
}

/** Linha aberta da Equipe: nível, capacidade e os critérios de subida, um a um. Só o coordenador confirma a subida. */
export const NivelPainel: React.FC<NivelPainelProps> = ({ nome, nivel, avaliacao, capacidade, podeAlterar, onAlterar }) => {
  const { registro, userId } = nivel;
  const titulo = registro
    ? `Nível · ${ROTULO_NIVEL[registro.nivel]} (capacidade ${percentual(capacidade)}) desde ${mesAno(registro.desde)}`
    : `Nível · não informado (capacidade ${percentual(capacidade)}, a de Intermediário)`;

  return (
    <section
      data-testid={`nivel-painel-${nome}`}
      style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
    >
      <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>{titulo}</span>

      {!registro && (
        <div style={{ fontSize: '0.84rem', color: '#475569' }}>
          Informe o nível de partida de {nome.split(' ')[0]}. A partir dele o sistema acompanha os critérios de subida.
        </div>
      )}

      {registro && !avaliacao && <div style={{ fontSize: '0.84rem', color: '#475569' }}>Já está no nível mais alto.</div>}

      {avaliacao && (
        <>
          <span style={{ fontSize: '0.84rem', fontWeight: 700 }}>Para subir a {ROTULO_NIVEL[avaliacao.proximo]}</span>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {avaliacao.criterios.map((c) => (
              <li key={c.texto} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: '0.4rem', fontSize: '0.84rem', lineHeight: 1.4 }}>
                <span aria-label={c.ok ? 'Cumprido' : 'Ainda não'} style={{ fontWeight: 900, color: c.ok ? 'var(--color-success-text)' : '#94a3b8' }}>
                  {c.ok ? '✓' : '○'}
                </span>
                <span>
                  {c.texto}
                  <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>{c.detalhe}</span>
                </span>
              </li>
            ))}
          </ul>
          <div
            style={{
              fontSize: '0.84rem',
              fontWeight: 700,
              padding: '0.5rem 0.7rem',
              borderRadius: '6px',
              background: avaliacao.pronto ? 'var(--color-success-bg)' : '#f8fafc',
              color: avaliacao.pronto ? 'var(--color-success-text)' : '#64748b'
            }}
          >
            {avaliacao.pronto
              ? `Cumpre os critérios para ${ROTULO_NIVEL[avaliacao.proximo]}. Só sobe quando o coordenador confirmar.`
              : `Ainda não cumpre os critérios para ${ROTULO_NIVEL[avaliacao.proximo]}.`}
          </div>
        </>
      )}

      {podeAlterar && userId && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {avaliacao?.pronto && (
            <ActionButton
              action="confirmar"
              type="button"
              size="sm"
              onClick={() => onAlterar(avaliacao.proximo, 'Cumpriu os critérios de subida')}
              data-testid={`nivel-subir-${nome}`}
            >
              Subir para {ROTULO_NIVEL[avaliacao.proximo]}
            </ActionButton>
          )}
          <ActionButton action="editar" type="button" size="sm" onClick={() => onAlterar()} data-testid={`nivel-alterar-${nome}`}>
            {registro ? 'Alterar nível' : 'Informar nível'}
          </ActionButton>
        </div>
      )}
      {podeAlterar && !userId && (
        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{nome} não tem conta no sistema: cadastre o servidor para informar o nível.</div>
      )}
    </section>
  );
};
