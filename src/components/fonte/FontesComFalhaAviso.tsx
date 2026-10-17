import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { AppButton } from '../../design-system/components/AppButton';
import type { FonteComFalha } from '../../types/managementDashboard';

/** "empenhado acima do contratado" → "Empenhado acima do contratado" (só a primeira letra, como frase). */
const comoFrase = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Motivo em linguagem do usuário; o tempo limite do banco é o caso mais comum. */
function motivo(mensagem: string): string {
  if (/statement timeout/i.test(mensagem)) return 'a consulta demorou mais que o tempo limite do banco';
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(mensagem)) return 'sem conexão com o banco';
  return mensagem;
}

interface FontesComFalhaAvisoProps {
  falhas: FonteComFalha[];
  onTentar: () => void;
  tentando: boolean;
  /** Onde fica o que não carregou, no título: "do Início", "dos Pagamentos". Padrão: "da tela". */
  onde?: string;
  /** Prefixo dos data-testid (padrão "fontes"): "<prefixo>-com-falha" e "<prefixo>-tentar". */
  testIdPrefix?: string;
}

/**
 * Parte da tela não carregou (ex.: o saldo dos itens estourou o tempo limite). O resto da tela segue funcionando;
 * aqui o usuário sabe o que ficou de fora e pode tentar de novo, em vez de ver contagens zeradas sem explicação ou a
 * tela inteira travada. Usada pelo Início e pelas telas que leem várias fontes (useLeiturasComFalha).
 */
export const FontesComFalhaAviso: React.FC<FontesComFalhaAvisoProps> = ({ falhas, onTentar, tentando, onde = 'da tela', testIdPrefix = 'fontes' }) => {
  if (falhas.length === 0) return null;
  const algumaSemLeitura = falhas.some((f) => f.situacao === 'NAO_CARREGOU');

  return (
    <section
      role="status"
      data-testid={`${testIdPrefix}-com-falha`}
      style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: '8px', padding: '0.75rem 0.9rem', color: 'var(--color-warning-text-strong)', fontSize: '0.85rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <AlertTriangle size={16} aria-hidden="true" />
        <strong>{algumaSemLeitura ? `Parte ${onde} não carregou` : `Parte ${onde} não atualizou`}</strong>
        <AppButton
          type="button"
          variant="outline"
          size="sm"
          onClick={onTentar}
          disabled={tentando}
          icon={<RotateCcw size={14} />}
          style={{ marginLeft: 'auto' }}
          data-testid={`${testIdPrefix}-tentar`}
        >
          {tentando ? 'Tentando…' : 'Tentar novamente'}
        </AppButton>
      </div>
      <ul style={{ margin: '0.45rem 0 0', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {falhas.map((f) => (
          <li key={f.rotulo}>
            <strong>{comoFrase(f.rotulo)}</strong>
            {f.situacao === 'DESATUALIZADA'
              ? ': não atualizou — mostrando a última leitura.'
              : ': não carregou — as contagens que dependem dela podem estar incompletas.'}{' '}
            <span style={{ color: 'var(--color-text-muted, #64748b)' }}>({motivo(f.mensagem)})</span>
          </li>
        ))}
      </ul>
    </section>
  );
};
