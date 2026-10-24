import React from 'react';
import { Copy } from 'lucide-react';
import { IconButton } from './IconButton';
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

/**
 * Número SEI em pílula clara com botão que copia só o número (o que a pesquisa do SEI aceita). Padrão do sistema para
 * mostrar documento ou processo SEI: tarefas do plano, pagamentos, quantitativos, previsão, reajuste e emendas.
 */
export const NumeroSeiEtiqueta: React.FC<{ numero: string; testId?: string }> = ({ numero, testId = 'numero-sei-tarefa' }) => {
  const toast = useToast();
  const copiar = async () => {
    if (await copiarTexto(numero)) toast.success(`Número SEI ${numero} copiado.`);
    else toast.error('Não foi possível copiar. Selecione o número e copie.');
  };
  return (
    <span data-testid={testId} className="sei-pilula" onClick={(e) => e.stopPropagation()}>
      <span className="sei-pilula__rotulo">SEI</span>
      <span className="sei-pilula__numero">{numero}</span>
      <IconButton label={`Copiar número SEI ${numero}`} icon={<Copy size={12} />} type="button" size="xs" className="sei-pilula__copiar" onClick={copiar} />
    </span>
  );
};
