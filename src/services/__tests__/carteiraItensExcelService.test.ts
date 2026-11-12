import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import type { ArpItemRecord, ArpRecord } from '../../types';
import type { CarteiraItemRow } from '../../utils/carteiraItens';
import { resumirFatias } from '../../config/gruposGti';
import { COLUNAS_CARTEIRA_ITENS, COLUNAS_PADRAO_CARTEIRA_ITENS, planilhaCarteiraItens } from '../carteiraItensExcelService';
import { gerarExcel } from '../excelSimples';

const row = (over: Partial<CarteiraItemRow> = {}): CarteiraItemRow => ({
  key: '00001/2025-200331-00001',
  ataKey: '00001/2025-200331',
  arp: { numeroAtaRegistroPreco: '00001/2025', codigoUnidadeGerenciadora: '200331', dataVigenciaFinal: '2026-12-31', papelSenasp: 'GERENCIADORA' } as ArpRecord,
  item: { numeroItem: '00001', descricaoItem: 'COLETE BALÍSTICO', nomeRazaoSocialFornecedor: 'Proteção Ltda', niFornecedor: '12345678000190', valorUnitario: 2500 } as ArpItemRecord,
  gestorNome: 'Gestor A',
  diasRestantes: 64,
  faixa: 'ATENCAO',
  quantitativoSenasp: 100,
  consumoPct: 45,
  consumido: 45,
  alocado: 60,
  alocadoPorUnidade: { cglic: 60 },
  nivelAlocacao: 'PARCIAL',
  contratada: 50,
  contratadoSemUnidade: 0,
  empenhado: 45,
  nivelEmpenho: 'PARCIAL',
  ataAssinada: null,
  limiteProvisorioOutrosOrgaos: 0,
  ...over
});
const FATIAS = resumirFatias([{ grupo: 'CNPC', quantidade: 80, orgaos: 2 }]);
const ctx = { fatiasDaLinha: () => FATIAS };
const valor = (ids: string[], r = row()) => planilhaCarteiraItens([r], ids, ctx, '2026-10-28', 'todos os itens')!.linhas[0];

describe('Excel da Carteira › Itens', () => {
  it('saldo, consumo e execução vêm da linha da tela (banco), não da cópia do navegador', () => {
    expect(valor(['senasp', 'consumido', 'saldo', 'consumo', 'valorSaldo', 'empenhado', 'empenho'])).toEqual([100, 45, 55, 45, 137500, 45, 'Parcialmente empenhado']);
  });

  it('sem o saldo sincronizado, saldo e consumo ficam em branco (como o traço da tela)', () => {
    expect(valor(['saldo', 'consumo', 'valorSaldo'], row({ consumido: null, consumoPct: null }))).toEqual([null, null, null]);
  });

  it('identificação: ata, situação, papel, CNPJ e interesse por GTI', () => {
    expect(valor(['ata', 'situacao', 'papel', 'cnpj', 'gti', 'descricao'])).toEqual(['00001/2025', 'Gerenciadora', 'Atenção', 'Colete balístico', '12.345.678/0001-90', 'CNPC 100%']);
  });

  it('colunas na ordem da lista e nenhuma coluna = sem aba', () => {
    const p = planilhaCarteiraItens([row()], ['saldo', 'ata'], ctx, '2026-10-28', 'todos os itens')!;
    expect(p.colunas.map((c) => c.titulo)).toEqual(['Ata', 'Saldo']);
    expect(planilhaCarteiraItens([row()], [], ctx, '2026-10-28', 'todos os itens')).toBeNull();
    expect(COLUNAS_PADRAO_CARTEIRA_ITENS.every((id) => COLUNAS_CARTEIRA_ITENS.some((c) => c.id === id))).toBe(true);
  });

  it('gera o .xlsx com título, cabeçalho e linhas', async () => {
    const blob = await gerarExcel([planilhaCarteiraItens([row(), row({ key: 'b' })], COLUNAS_PADRAO_CARTEIRA_ITENS, ctx, '2026-10-28', 'itens filtrados')!]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.getWorksheet('Itens')!;
    expect(ws.getCell(1, 1).value).toBe('Carteira de Itens · itens filtrados em 28/10/2026');
    expect(ws.getCell(2, 1).value).toBe('Ata');
    expect(ws.rowCount).toBe(4);
  });
});
