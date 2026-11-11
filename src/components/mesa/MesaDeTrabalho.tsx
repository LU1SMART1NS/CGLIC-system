import React from 'react';
import { AppButton } from '../../design-system/components/AppButton';
import { InfoHint } from '../../design-system/components/InfoHint';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { carteiraDetalhe } from '../carteira/carteiraStyles';
import { blocoDaMesa, COR_DO_TOM, listaDaMesa, type TomDaMesa } from './mesaEstilos';

export type { TomDaMesa };

/*
 * Peças da "mesa de trabalho": o mesmo desenho do Pedido 360 › Andamento e do Contrato 360 › Fiscalização.
 * Com você (o próximo passo, com o botão) · Com outros (quem faz o próximo movimento) · lista por grupo com
 * o filtro "Com pendência · Todos". As regras de cada módulo continuam nos seus utils; aqui só a aparência.
 */

export interface BotaoDaMesa {
  rotulo: string;
  /** botao: azul; link: discreto; perigo: link vermelho. */
  jeito: 'botao' | 'link' | 'perigo';
  onClick: () => void;
  testId: string;
}

export interface LinhaDeTrabalho {
  chave: string;
  tom: TomDaMesa;
  /** Com outros: quem faz o próximo movimento (CAEP, Exército, Fornecedor…). */
  quem?: string;
  titulo: string;
  detalhe?: React.ReactNode;
  /** Data já formatada (dd/mm/aaaa). */
  prazo?: string | null;
  vencido?: boolean;
  /** Regra do prazo, num ⓘ ao lado da data. */
  regra?: string | null;
  botoes: BotaoDaMesa[];
}

const linhaDaLista: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '12px minmax(0, 1fr)',
  gap: '0.2rem 0.7rem',
  padding: '0.65rem 0.75rem',
  borderTop: '1px solid var(--border)',
  alignItems: 'start'
};
const marca = (tom: TomDaMesa): React.CSSProperties => ({
  width: 10,
  height: 10,
  borderRadius: '50%',
  marginTop: '0.3rem',
  boxSizing: 'border-box',
  ...(tom === 'espera' ? { border: `2px solid ${COR_DO_TOM[tom]}` } : { background: COR_DO_TOM[tom] })
});
const etiquetaQuem: React.CSSProperties = {
  display: 'inline-block',
  fontSize: '0.75rem',
  fontWeight: 800,
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '0 0.35rem',
  marginRight: '0.4rem',
  color: '#64748b',
  verticalAlign: '1px'
};

/** Uma linha da mesa: bolinha do tom, título e detalhe; à direita o prazo e os botões (descem no celular). */
export const LinhaDaMesa: React.FC<{ l: LinhaDeTrabalho; testId: string; semBotoes?: boolean }> = ({ l, testId, semBotoes }) => (
  <div style={linhaDaLista} data-testid={testId} data-tom={l.tom}>
    <span style={marca(l.tom)} aria-hidden="true" />
    <div style={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '0.4rem 0.8rem' }}>
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
          {l.quem && <span style={etiquetaQuem}>{l.quem}</span>}
          {l.titulo}
        </div>
        {l.detalhe && <div style={{ ...carteiraDetalhe, fontSize: '0.8rem' }}>{l.detalhe}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', marginLeft: 'auto' }}>
        {l.prazo && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', color: l.vencido ? 'var(--color-danger-text)' : '#64748b' }}>
            {l.vencido ? `venceu em ${l.prazo}` : `até ${l.prazo}`}
            {l.regra && <InfoHint label="Regra do prazo" content={l.regra} testId={`${testId}-regra`} />}
          </span>
        )}
        {!semBotoes && l.botoes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem' }}>
            {l.botoes.map((b) => (
              <AppButton key={b.testId} size={b.jeito === 'botao' ? 'sm' : 'xs'} variant={b.jeito === 'botao' ? 'primary' : b.jeito === 'perigo' ? 'ghostDanger' : 'link'} onClick={b.onClick} data-testid={b.testId}>
                {b.rotulo}
              </AppButton>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

/**
 * Seção "Com você" ou "Com outros": o título com a contagem e as linhas numa lista. Com `destaque`, a lista ganha a
 * borda azul à esquerda (Com você) e mostra `vazio` quando não há nada; com `limite`, mostra "e mais N".
 */
export const SecaoDaMesa: React.FC<{
  titulo: string;
  linhas: LinhaDeTrabalho[];
  testId: string;
  linhaTestId: (l: LinhaDeTrabalho) => string;
  destaque?: boolean;
  vazio?: string;
  semBotoes?: boolean;
  limite?: number;
}> = ({ titulo, linhas, testId, linhaTestId, destaque, vazio, semBotoes, limite }) => {
  const [todas, setTodas] = React.useState(false);
  if (!linhas.length && !vazio) return null;
  const mostradas = limite && !todas ? linhas.slice(0, limite) : linhas;
  return (
    <section style={blocoDaMesa} data-testid={testId}>
      <CarteiraDetailLabel>
        {titulo}
        {linhas.length || !destaque ? ` · ${linhas.length}` : ''}
      </CarteiraDetailLabel>
      <div style={{ ...listaDaMesa, ...(destaque ? { borderLeft: '4px solid var(--primary)' } : {}) }}>
        <div style={{ marginTop: '-1px' }}>
          {linhas.length === 0 ? (
            <div style={{ ...linhaDaLista, gridTemplateColumns: '1fr' }}>
              <span style={{ fontWeight: 600 }}>{vazio}</span>
            </div>
          ) : (
            mostradas.map((l) => <LinhaDaMesa key={l.chave} l={l} testId={linhaTestId(l)} semBotoes={semBotoes} />)
          )}
          {mostradas.length < linhas.length && (
            <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)' }}>
              <AppButton size="xs" variant="link" onClick={() => setTodas(true)}>
                e mais {linhas.length - mostradas.length}
              </AppButton>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

/** "Com pendência · N" e "Todos · N": o filtro dos grupos de "Onde está cada item". */
export const FiltroPendencia: React.FC<{ soPendentes: boolean; pendentes: number; todos: number; onChange: (soPendentes: boolean) => void; testId?: string }> = ({ soPendentes, pendentes, todos, onChange, testId }) => (
  <span role="group" aria-label="Quais beneficiários mostrar" style={{ display: 'inline-flex', gap: '0.5rem' }}>
    <AppButton size="xs" variant={soPendentes ? 'secondary' : 'ghost'} aria-pressed={soPendentes} onClick={() => onChange(true)} data-testid={testId && `${testId}-pendentes`}>
      Com pendência · {pendentes}
    </AppButton>
    <AppButton size="xs" variant={soPendentes ? 'ghost' : 'secondary'} aria-pressed={!soPendentes} onClick={() => onChange(false)} data-testid={testId && `${testId}-todos`}>
      Todos · {todos}
    </AppButton>
  </span>
);

/** Rodapé "E mais N beneficiários sem pendência. Ver todos". */
export const MaisSemPendencia: React.FC<{ resto: number; onVerTodos: () => void; style?: React.CSSProperties }> = ({ resto, onVerTodos, style }) =>
  resto > 0 ? (
    <div style={{ fontSize: '0.8rem', color: '#64748b', ...style }}>
      E mais {resto === 1 ? '1 beneficiário' : `${resto} beneficiários`} sem pendência.{' '}
      <AppButton size="xs" variant="link" onClick={onVerTodos}>
        Ver todos
      </AppButton>
    </div>
  ) : null;
