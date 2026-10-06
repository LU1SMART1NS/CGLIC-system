import { useCallback } from 'react';
import { useToast } from '../design-system/components/Toast';
import { atualizarNoServidor, type ResultadoDaAtualizacao } from '../services/sincronizacaoNoServidorService';
import type { RecursoSincronizado } from '../services/sincronizacaoFontesService';

/** O que dizer ao coordenador quando a espera terminou sem a execução concluir. */
export function mensagemDaEspera(resultado: ResultadoDaAtualizacao): string | null {
  if (resultado.concluiu) return null;
  return resultado.motivo === 'tempo'
    ? 'A atualização continua no servidor. Os dados aparecem sozinhos quando ela terminar.'
    : 'Já há uma atualização em andamento, ou os dados acabaram de ser atualizados. Nada foi iniciado agora.';
}

/**
 * Botão "Atualizar" do coordenador: pede ao servidor (Edge Function sincronizar-fontes) a atualização
 * forçada do recurso e espera terminar. Os avisos (recusa da função, espera longa) saem como toast.
 * Devolve a mensagem de erro, quando houve, para quem quiser mostrá-la também na própria tela.
 */
export function useAtualizacaoNoServidor() {
  const toast = useToast();
  return useCallback(
    async (recurso: RecursoSincronizado, uasgs: readonly string[]): Promise<{ erro?: string }> => {
      try {
        const resultado = await atualizarNoServidor(recurso, uasgs);
        const aviso = mensagemDaEspera(resultado);
        if (aviso) toast.show(aviso, 'info');
        return {};
      } catch (err) {
        const erro = err instanceof Error ? err.message : String(err);
        console.warn(`[atualizacao] ${recurso}:`, erro);
        toast.error(erro);
        return { erro };
      }
    },
    [toast]
  );
}
