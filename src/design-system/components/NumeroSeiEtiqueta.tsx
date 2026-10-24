import React from 'react';
import { ActionButton } from './ActionButton';
import { useToast } from './Toast';

/** Copia o texto; se o navegador negar a área de transferência, tenta o caminho antigo (execCommand). */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.style.position = 'fixed';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      campo.remove();
    }
  }
}

/** Número SEI com botão que copia só o número (o que a pesquisa do SEI aceita): tarefas do plano e etapas das emendas. */
export const NumeroSeiEtiqueta: React.FC<{ numero: string; testId?: string }> = ({ numero, testId = 'numero-sei-tarefa' }) => {
  const toast = useToast();
  const copiar = async () => {
    if (await copiarTexto(numero)) toast.success(`Número SEI ${numero} copiado.`);
    else toast.error('Não foi possível copiar. Selecione o número e copie.');
  };
  return (
    <span
      data-testid={testId}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid var(--primary)',
        borderRadius: '4px',
        overflow: 'hidden',
        fontSize: '0.75rem',
        lineHeight: 1
      }}
    >
      <span style={{ background: 'var(--primary)', color: '#fff', fontWeight: 800, padding: '0.3rem 0.4rem', letterSpacing: '0.04em' }}>SEI</span>
      <span style={{ padding: '0.3rem 0.45rem', fontWeight: 600, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums', userSelect: 'all' }}>{numero}</span>
      <ActionButton action="copiar" iconOnly label={`Copiar número SEI ${numero}`} type="button" size="sm" onClick={copiar} />
    </span>
  );
};
