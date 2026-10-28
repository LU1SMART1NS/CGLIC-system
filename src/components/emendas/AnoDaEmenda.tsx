import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ANO_SEM, ANO_TODOS } from '../../utils/emendasAno';

interface Props {
  /** O filtro do endereço: '2026', 'sem' ou 'todos'. */
  valor: string;
  anoCorrente: number;
  /** Anos da lista, do mais novo ao mais antigo, com quantos registros cada um traz. */
  anos: Array<{ ano: number; count: number }>;
  /** Contagem de "Todos os anos"; sem ela a opção não aparece (Parlamentares, que soma sobra). */
  todos?: number;
  /** Quantos registros (pedidos ou emendas) têm o nº da emenda sem o ano: o aviso laranja ao lado do botão (some com zero). */
  semAno: number;
  onChange: (valor: string) => void;
  testId: string;
}

/**
 * Ano da emenda (protótipo aprovado em 28/10/2026): um botão "Ano: 2026 ▾" que abre a lista dos anos, do mesmo
 * tamanho com 2 ou com 15 anos. Os registros sem o ano não são um ano: ficam num aviso laranja ao lado, que filtra
 * só eles com um clique e volta ao ano corrente com outro.
 */
export const AnoDaEmenda: React.FC<Props> = ({ valor, anoCorrente, anos, todos, semAno, onChange, testId }) => {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const escolher = (v: string) => {
    onChange(v);
    setAberto(false);
  };
  const noBotao = valor === ANO_SEM ? 'a informar' : valor === ANO_TODOS ? 'todos' : valor;
  const filtrado = valor !== String(anoCorrente);
  const opcoes = [
    ...anos.map((a) => ({ valor: String(a.ano), rotulo: String(a.ano), corrente: a.ano === anoCorrente, count: a.count, separar: false })),
    ...(todos != null ? [{ valor: ANO_TODOS, rotulo: 'Todos os anos', corrente: false, count: todos, separar: true }] : [])
  ];

  return (
    <div ref={raiz} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', position: 'relative' }} data-testid={testId}>
      {semAno > 0 && (
        <button
          type="button"
          aria-pressed={valor === ANO_SEM}
          onClick={() => onChange(valor === ANO_SEM ? String(anoCorrente) : ANO_SEM)}
          title="Com o número da emenda, mas sem o ano: sem ele, o sistema não lê o empenhado nem calcula a sobra. Informe o ano na conferência do pedido."
          className="carteira-filter-btn"
          data-testid={`${testId}-sem-ano`}
          style={{
            padding: '0.3rem 0.65rem',
            borderRadius: '999px',
            border: `1px solid ${valor === ANO_SEM ? '#8a5300' : '#e5a50a'}`,
            background: valor === ANO_SEM ? '#8a5300' : '#fff2d6',
            color: valor === ANO_SEM ? '#ffffff' : '#8a5300',
            fontSize: '0.78rem',
            fontWeight: 800,
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          {semAno} sem ano
        </button>
      )}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-haspopup="menu"
          aria-expanded={aberto}
          aria-controls={aberto ? menuId : undefined}
          aria-label={`Ano da emenda: ${noBotao}`}
          className="carteira-filter-btn"
          data-testid={`${testId}-btn`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.38rem 0.65rem',
            borderRadius: '6px',
            border: `1px solid ${filtrado ? 'var(--primary)' : '#cbd5e1'}`,
            background: filtrado ? '#e0e7f5' : '#ffffff',
            color: filtrado ? 'var(--primary)' : '#334155',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          Ano: <span style={{ fontWeight: 800 }}>{noBotao}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </button>
        {aberto && (
          <div
            id={menuId}
            className="carteira-filter-menu"
            role="menu"
            aria-label="Ano da emenda"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              zIndex: 30,
              minWidth: '200px',
              maxHeight: '320px',
              overflowY: 'auto',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
              padding: '0.25rem'
            }}
          >
            {opcoes.map((o) => {
              const marcado = o.valor === valor;
              return (
                <button
                  key={o.valor}
                  type="button"
                  role="menuitemradio"
                  aria-checked={marcado}
                  onClick={() => escolher(o.valor)}
                  data-testid={`${testId}-opcao-${o.valor}`}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    padding: '0.45rem 0.6rem',
                    border: 'none',
                    borderTop: o.separar ? '1px solid #e2e8f0' : 'none',
                    borderRadius: '6px',
                    background: marcado ? '#e0e7f5' : 'transparent',
                    color: '#0f172a',
                    fontSize: '0.8rem',
                    fontWeight: marcado ? 800 : 600,
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  <span>
                    {o.rotulo}
                    {o.corrente && <span style={{ color: '#64748b', fontWeight: 600 }}> · corrente</span>}
                  </span>
                  <span style={{ color: '#64748b' }}>{o.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
