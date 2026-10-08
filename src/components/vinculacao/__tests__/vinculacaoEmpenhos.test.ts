import { describe, it, expect } from 'vitest';
import { mapDistribuicao } from '../../../services/distribuicaoEmpenhoService';
import type { FaturaCarteira } from '../../../services/financeiroCarteiraService';
import {
  aguardaVinculoAosItens,
  empenhosCitadosSemVinculo,
  entraNoLote,
  ordenarFila,
  passaFiltroSugestao,
  temSugestaoUnica,
  vinculadaPelaEquipe
} from '../vinculacaoEmpenhos';

const nota = (over: any) =>
  mapDistribuicao({ contrato_empenho_id: over.id ?? 'c', empenho_id: 'e', numero_oficial: over.ne ?? 'NE', valor_nota: 100, parcelas: [], sugestao: [], situacao: 'A_DISTRIBUIR', ...over });

const fatura = (o: Partial<FaturaCarteira>): FaturaCarteira => ({
  idFatura: 1, contractKey: 'K1', numero: '1490', tipo: 'Nota Fiscal', emissao: '2026-07-10', vencimento: null, valorLiquido: 24500,
  dataLiquidacao: null, situacao: 'Pendente', cancelada: false, np: null, referencia: '07/2026', ordensBancarias: null, obEmissao: null,
  paga: false, npContratos: 1, empenhos: '2024NE000412', empenhosSemVinculo: 1, empenhosSemVinculoNumeros: '2024NE000412', ...o
});

describe('fila Empenhos aos itens', () => {
  it('a vincular e a rever esperam a equipe; vinculadas pela equipe vão para o outro segmento; automáticas somem', () => {
    expect(aguardaVinculoAosItens(nota({ situacao: 'A_DISTRIBUIR' }))).toBe(true);
    expect(aguardaVinculoAosItens(nota({ situacao: 'REVISAR' }))).toBe(true);
    expect(aguardaVinculoAosItens(nota({ situacao: 'DISTRIBUIDA', origem: 'AUTO' }))).toBe(false);
    expect(vinculadaPelaEquipe(nota({ situacao: 'DISTRIBUIDA', origem: 'USUARIO' }))).toBe(true);
    expect(vinculadaPelaEquipe(nota({ situacao: 'DISTRIBUIDA', origem: 'AUTO' }))).toBe(false);
  });

  it('só a sugestão única entra no lote, e nunca uma nota a rever', () => {
    const unica = nota({ sugestao_tipo: 'TOTAL_DO_ITEM', sugestao: [{ numero_item: 43, quantidade: 342 }] });
    const varias = nota({ sugestao_tipo: 'VARIAS_POSSIBILIDADES', sugestao: [{ numero_item: 43, quantidade: 7 }, { numero_item: 45, quantidade: 7 }] });
    const rever = nota({ situacao: 'REVISAR', sugestao_tipo: 'MULTIPLO_DO_PRECO', sugestao: [{ numero_item: 13, quantidade: 3 }] });
    expect(temSugestaoUnica(unica)).toBe(true);
    expect(entraNoLote(unica)).toBe(true);
    expect(entraNoLote(varias)).toBe(false);
    expect(temSugestaoUnica(rever)).toBe(true);
    expect(entraNoLote(rever)).toBe(false);
    expect(passaFiltroSugestao(varias, 'VARIAS')).toBe(true);
    expect(passaFiltroSugestao(nota({ sugestao_tipo: 'SEM_SUGESTAO' }), 'NENHUMA')).toBe(true);
    expect(passaFiltroSugestao(unica, 'NENHUMA')).toBe(false);
    expect(passaFiltroSugestao(unica, 'TODOS')).toBe(true);
  });

  it('as notas a rever vêm primeiro, depois as mais recentes', () => {
    const lista = [
      nota({ id: 'a', ne: 'A', data_emissao: '2026-09-01' }),
      nota({ id: 'b', ne: 'B', data_emissao: '2024-12-01', situacao: 'REVISAR' }),
      nota({ id: 'c', ne: 'C', data_emissao: '2026-09-30' })
    ];
    expect(ordenarFila(lista, (d) => d.dataEmissao).map((d) => d.numeroOficial)).toEqual(['B', 'C', 'A']);
  });
});

describe('fila Empenhos ao contrato', () => {
  it('lista cada NE citada sem vínculo, só de contratos com empenhos consultados e sem faturas canceladas', () => {
    const linhas = empenhosCitadosSemVinculo(
      [
        fatura({ idFatura: 1, empenhosSemVinculo: 2, empenhosSemVinculoNumeros: '2024NE000412, 2025NE000603' }),
        fatura({ idFatura: 2, contractKey: 'NAO_CONSULTADO' }),
        fatura({ idFatura: 3, cancelada: true }),
        fatura({ idFatura: 4, empenhosSemVinculo: 0, empenhosSemVinculoNumeros: null })
      ],
      new Set(['K1'])
    );
    expect(linhas.map((l) => l.chave)).toEqual(['1|2024NE000412', '1|2025NE000603']);
  });
});
