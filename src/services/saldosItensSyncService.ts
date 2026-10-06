/**
 * Atualização global dos saldos dos itens das atas, em segundo plano e sob a trava do banco
 * (recurso 'saldos_itens', sincronizacao_fontes).
 *
 * Faz o que as telas faziam sozinhas ao abrir (e repetiam em cada navegador):
 * - relê, nos contratos vinculados aos itens, a quantidade contratada que entra no saldo; só os
 *   vínculos sem leitura ou com mais de 6 horas, a menos que o coordenador force;
 * - grava o quantitativo SENASP dos itens que ainda usam o homologado da ata como base.
 *
 * Os empenhos dos contratos não entram aqui: seguem pelos botões "Atualizar empenhos" (Contrato 360 e
 * Execução Financeira) e "Atualizar" do Item.
 */
import { refreshAllLinkedItemQuantities } from './itemSaldoRefreshService';
import { syncAllPendingItemSenasp } from './itemSenaspBatchService';
import {
  executarComReserva,
  UASG_TODAS,
  VALIDADE_PADRAO,
  type ResultadoSincronizacao
} from './sincronizacaoFontesService';

export const RECURSO_SALDOS_ITENS = 'saldos_itens' as const;
export const FONTE_QUANTIDADES_CONTRATOS = 'Quantidade contratada dos contratos';
export const FONTE_QUANTITATIVO_SENASP = 'Quantitativo SENASP dos itens';

export async function sincronizarSaldosItens(opts: { forcar?: boolean } = {}): Promise<ResultadoSincronizacao> {
  return executarComReserva(
    RECURSO_SALDOS_ITENS,
    UASG_TODAS,
    { forcar: opts.forcar, validade: VALIDADE_PADRAO },
    async () => {
      const quantidades = await refreshAllLinkedItemQuantities({ force: Boolean(opts.forcar) });
      // A falha do quantitativo SENASP não derruba a das quantidades: cada uma é contada à parte.
      let senasp: Awaited<ReturnType<typeof syncAllPendingItemSenasp>> | null = null;
      let erroSenasp = false;
      try {
        senasp = await syncAllPendingItemSenasp();
      } catch (err) {
        erroSenasp = true;
        console.warn('[saldosItens] falha ao sincronizar o quantitativo SENASP:', err);
      }

      const fontesComFalha: string[] = [];
      const problemas: string[] = [];
      if (quantidades.falhas.length > 0) {
        fontesComFalha.push(FONTE_QUANTIDADES_CONTRATOS);
        const n = quantidades.falhas.length;
        problemas.push(`${n} ${n === 1 ? 'contrato não teve a quantidade atualizada' : 'contratos não tiveram a quantidade atualizada'}`);
      }
      if (erroSenasp || (senasp?.falhas ?? 0) > 0) {
        fontesComFalha.push(FONTE_QUANTITATIVO_SENASP);
        const n = senasp?.falhas ?? 0;
        problemas.push(erroSenasp ? 'o quantitativo SENASP não pôde ser consultado' : `${n} ${n === 1 ? 'item ficou sem' : 'itens ficaram sem'} o quantitativo SENASP`);
      }

      const total = quantidades.itensAtualizados + (senasp?.gravados ?? 0);
      return fontesComFalha.length > 0
        ? { status: 'PARCIAL', total, fontesComFalha, mensagem: `${problemas.join(' e ')}.` }
        : { status: 'SUCESSO', total, fontesComFalha: [] };
    }
  );
}
