import React, { useState } from 'react';
import { AppButton } from '../../design-system/components/AppButton';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { carteiraDetalhe } from '../carteira/carteiraStyles';

export interface ItemComVoce {
  chave: string;
  titulo: string;
  detalhe: string;
  acao: string;
  onAcao: () => void;
}

const lista: React.CSSProperties = { border: '1px solid var(--border)', borderLeft: '4px solid var(--primary)', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' };
const linhaDaLista: React.CSSProperties = { display: 'grid', gridTemplateColumns: '12px minmax(0, 1fr)', gap: '0.2rem 0.7rem', padding: '0.65rem 0.75rem', borderTop: '1px solid var(--border)', alignItems: 'start' };
const marca: React.CSSProperties = { width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)', marginTop: '0.3rem' };
const LIMITE = 5;

/**
 * "Com você" dos Painéis do Início (decisão de 11/11/2026): só para o coordenador e só com as decisões que são dele
 * (distribuir, definir, conferir). O Painel do gestor já mostra só a carteira dele, então a lista de Pendências é o
 * "com você" do gestor. Desenho do Pedido 360 › Andamento.
 */
export const ComVoce: React.FC<{ itens: ItemComVoce[]; testId: string; id?: string; carregando?: boolean }> = ({ itens, testId, id, carregando = false }) => {
  const [todas, setTodas] = useState(false);
  const visiveis = todas ? itens : itens.slice(0, LIMITE);
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }} id={id} data-testid={testId}>
      <CarteiraDetailLabel>Com você{itens.length ? ` · ${itens.length}` : ''}</CarteiraDetailLabel>
      <div style={lista}>
        <div style={{ marginTop: '-1px' }}>
          {itens.length === 0 ? (
            <div style={{ ...linhaDaLista, gridTemplateColumns: '1fr' }}><span style={{ fontWeight: 600 }}>{carregando ? 'Contando…' : 'Nada com você agora.'}</span></div>
          ) : (
            visiveis.map((l) => (
              <div key={l.chave} style={linhaDaLista} data-testid={`${testId}-${l.chave}`}>
                <span style={marca} aria-hidden="true" />
                <div style={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0.4rem 0.8rem' }}>
                  <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{l.titulo}</div>
                    <div style={{ ...carteiraDetalhe, fontSize: '0.8rem' }}>{l.detalhe}</div>
                  </div>
                  <div style={{ marginLeft: 'auto' }}>
                    <AppButton size="sm" variant="primary" onClick={l.onAcao}>{l.acao}</AppButton>
                  </div>
                </div>
              </div>
            ))
          )}
          {!todas && itens.length > LIMITE && (
            <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)' }}>
              <AppButton size="xs" variant="link" onClick={() => setTodas(true)}>e mais {itens.length - LIMITE}</AppButton>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
