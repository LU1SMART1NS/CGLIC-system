import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import type { ItemCaep, KitEmenda } from '../emendasService';
import { resumirFatias } from '../../config/gruposGti';
import { montarLinhasItensCaep, montarLinhasKitsCaep } from '../../utils/emendasItensSaldo';
import { gerarExcelDeSaldo, planilhasDeSaldo } from '../emendasExcelService';

const HOJE = '2026-10-28';
const item = (itemKey: string, numeroItem: string, alocado: number, extra: Partial<ItemCaep> = {}): ItemCaep => ({
  itemKey, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem, descricao: `ITEM ${numeroItem}`, codigoPdm: 1,
  valorUnitario: 10, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado, nomeCurto: `Nome ${numeroItem}`, gnd: 'GND-4', ...extra
});
const ITENS = [item('a', '00001', 100), item('b', '00002', 0), item('c', '00003', 50, { ataEncerrada: true })];
const kit = (id: string, nome: string, itens: KitEmenda['itens'], ativo = true) => ({ id, nome, descricao: null, ativo, itens, versao: 1 }) as unknown as KitEmenda;
const KITS = [kit('k1', 'Kit bom', [{ itemKey: 'a', quantidade: 2 }]), kit('k2', 'Kit sem saldo', [{ itemKey: 'b', quantidade: 1 }]), kit('k3', 'Kit desativado', [{ itemKey: 'a', quantidade: 1 }], false)];
const FATIAS = new Map([['00031/2025-200331-00001', resumirFatias([{ grupo: 'CNCG', quantidade: 70, orgaos: 3 }, { grupo: 'LIGABOM', quantidade: 30, orgaos: 1 }])]]);

const planilhas = () => planilhasDeSaldo(montarLinhasItensCaep(ITENS, [], undefined, null, FATIAS), montarLinhasKitsCaep(KITS, ITENS, HOJE, new Map([['a', 40]]), undefined), HOJE);

describe('Excel de Emendas › Itens: itens e kits com saldo', () => {
  it('só entra item com saldo e ata vigente, e kit ativo que ainda cabe', () => {
    const [itens, kits] = planilhas();
    expect(itens.linhas.map((l) => l[1])).toEqual([1]);
    expect(itens.linhas[0][5]).toBe('CNCG 70% · LIGABOM 30%');
    expect(itens.linhas[0][11]).toBe(100); // saldo pela conta da tela: sem pedidos, saldo = alocado
    expect(kits.linhas.map((l) => l[0])).toEqual(['Kit bom']);
    expect(kits.linhas[0][3]).toBe(30); // kits pela conta da tela de kits: (100 − 40 reservados) ÷ 2
  });

  it('gera o .xlsx com as duas abas', async () => {
    const blob = await gerarExcelDeSaldo(planilhas(), HOJE);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Itens com saldo', 'Kits com saldo']);
    const ws = wb.getWorksheet('Itens com saldo')!;
    expect(ws.getCell(2, 1).value).toBe('Ata');
    expect(ws.getCell(3, 3).value).toBe('Item 00001');
    expect(wb.getWorksheet('Kits com saldo')!.getCell(3, 1).value).toBe('Kit bom');
  });
});
