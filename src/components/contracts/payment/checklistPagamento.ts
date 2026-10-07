import type { ChecklistResposta, PaymentChecklistAnswer, PaymentFollowUpCycle } from '../../../types/paymentFollowUp';

/** Checklist para pagamento de contratos (Portaria DGFNSP 50/2025, Anexo I), na ordem da Portaria. */
export const CHECKLIST_PAGAMENTO: Array<{ item: string; label: string }> = [
  { item: 'CONTRATO_VIGENTE', label: 'Contrato vigente' },
  { item: 'NOTA_EMPENHO', label: 'Nota de empenho' },
  { item: 'PORTARIA_FISCAIS', label: 'Portaria de designação dos fiscais e gestores do contrato' },
  { item: 'RECEBIMENTO_PROVISORIO', label: 'Termo de recebimento provisório' },
  { item: 'RECEBIMENTO_DEFINITIVO', label: 'Termo de recebimento definitivo' },
  { item: 'SIMPLES_NACIONAL', label: 'Declaração de optante pelo Simples Nacional, se couber (original assinada pelo representante legal)' },
  { item: 'NOTA_FISCAL', label: 'Nota fiscal ou fatura' },
  { item: 'ATESTO', label: 'Atesto da nota fiscal ou fatura' },
  { item: 'RELATORIO_ACOMPANHAMENTO', label: 'Relatório de acompanhamento contratual' },
  { item: 'RELATORIO_ANS', label: 'Relatório de acordo de nível de serviços' },
  { item: 'GPS', label: 'GPS (INSS), se couber' },
  { item: 'GRF', label: 'GRF (FGTS), se couber' },
  { item: 'CNDT', label: 'Certidão negativa de débitos trabalhistas (CNDT)' },
  { item: 'SICAF', label: 'Sistema de Cadastramento Unificado de Fornecedores (SICAF)' },
  { item: 'CADIN', label: 'Cadastro informativo de créditos não quitados do setor público federal (CADIN)' },
  { item: 'CEIS', label: 'Cadastro de empresas inidôneas e suspensas (CEIS)' }
];

export interface LinhaChecklist {
  item: string;
  label: string;
  resposta: ChecklistResposta | '';
  sei: string;
  /** O que o sistema já sabia ao preencher (o usuário confirma). */
  sugeridoPeloSistema?: string;
}

/**
 * Linhas do checklist para a conferência: começa pelo que já foi respondido (devolução anterior) e, nos itens que
 * o sistema conhece, vem marcado para o usuário confirmar.
 */
export function montarChecklist(
  cycle: PaymentFollowUpCycle,
  ctx: { contratoVigente?: boolean; empenhosComSaldo?: boolean }
): LinhaChecklist[] {
  const anteriores = new Map<string, PaymentChecklistAnswer>((cycle.checklist ?? []).map((c) => [c.item, c]));
  const itens = cycle.itens ?? [];
  const seiNf = itens.map((i) => i.notaFiscalSei).filter(Boolean).join(', ');
  const seiAtesto = itens.map((i) => i.atestoSei).filter(Boolean).join(', ') || cycle.input.documentoAtestoSei;

  return CHECKLIST_PAGAMENTO.map(({ item, label }) => {
    const anterior = anteriores.get(item);
    if (anterior) return { item, label, resposta: anterior.resposta, sei: anterior.sei ?? '' };
    switch (item) {
      case 'CONTRATO_VIGENTE':
        return ctx.contratoVigente === undefined
          ? { item, label, resposta: '', sei: '' }
          : { item, label, resposta: ctx.contratoVigente ? 'SIM' : 'NAO', sei: '', sugeridoPeloSistema: ctx.contratoVigente ? 'vigente' : 'vigência encerrada' };
      case 'NOTA_EMPENHO':
        return ctx.empenhosComSaldo === undefined
          ? { item, label, resposta: '', sei: '' }
          : { item, label, resposta: ctx.empenhosComSaldo ? 'SIM' : 'NAO', sei: '', sugeridoPeloSistema: ctx.empenhosComSaldo ? 'empenho com saldo' : 'saldo do empenho insuficiente' };
      case 'NOTA_FISCAL':
        return seiNf ? { item, label, resposta: 'SIM', sei: seiNf, sugeridoPeloSistema: 'informada na abertura' } : { item, label, resposta: '', sei: '' };
      case 'ATESTO':
        return seiAtesto ? { item, label, resposta: 'SIM', sei: seiAtesto, sugeridoPeloSistema: 'informado na abertura' } : { item, label, resposta: '', sei: '' };
      default:
        return { item, label, resposta: '', sei: '' };
    }
  });
}

export function resumoChecklist(linhas: LinhaChecklist[]): { faltam: number; nao: number } {
  return {
    faltam: linhas.filter((l) => !l.resposta).length,
    nao: linhas.filter((l) => l.resposta === 'NAO').length
  };
}

export function rotuloDoItem(item: string): string {
  return CHECKLIST_PAGAMENTO.find((c) => c.item === item)?.label ?? item;
}
