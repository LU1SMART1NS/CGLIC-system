import { describe, expect, it } from 'vitest';
import {
  beneficiarioDoQuadro,
  fornecedorDaAta,
  htmlQuadroPretensoes,
  htmlQuadroUnidade,
  instrumentoDaAta,
  linhasDaAtaParaAutorizar,
  montarQuadros,
  parlamentarDoQuadro,
  pedidoEntraNaAutorizacao
} from '../emendasAutorizacao';
import type { AutorEmenda, BeneficiarioEmenda, DocumentoSeiDoPedido, ItemCaep, LinhaPedido, PedidoEmenda } from '../../services/emendasService';

const ATA = '00031/2025-200331';
const item = (n: string, nomeCurto: string, valorUnitario: number): ItemCaep => ({
  itemKey: `${ATA}-${n}`, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: n, descricao: 'ARMA DE FOGO', codigoPdm: 1, valorUnitario, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 1000, nomeCurto
});
const itens = new Map([item('00001', "Carabina 14,5''", 5578.9), item('00002', "Carabina 11,5''", 5319.07)].map((i) => [i.itemKey, i]));
const linha = (id: string, n: string, quantidade: number, beneficiarioId: string | null, extra: Partial<LinhaPedido> = {}): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey: `${ATA}-${n}`, kitId: null, kitNome: null, kitVersao: null, kitComposicao: null, quantidade, beneficiarioId, cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null, ...extra
});
const pedido = (numero: number, autorId: string, emenda: string, linhas: LinhaPedido[], extra: Partial<PedidoEmenda> = {}): PedidoEmenda => ({
  id: `p${numero}`, numero, autorId, etapa: 'CONFERIDO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-08-01',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null,
  siopEmenda: emenda, siopEmendaAno: 2026, siopValor: null, siopGnd: 'GND-4', conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null,
  autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null, empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [],
  canceladoEm: null, canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas, devolucoes: [], documentos: [], pedidoOrigemId: null,
  pedidoOrigemNumero: null, anulacoes: [], emendaId: null, outrasEmendas: [], ...extra
});
const autor = (id: string, nome: string, tipo: AutorEmenda['tipo'], uf: string, sexo: 'M' | 'F'): AutorEmenda => ({ id, tipo, nome, nomeCivil: null, partido: null, uf, emExercicio: true, legislatura: 57, lidoEm: null, sexo });
const autores = new Map([autor('A1', 'Giovani Cherini', 'DEPUTADO', 'RS', 'M'), autor('A2', 'Chris Tonietto', 'DEPUTADO', 'RJ', 'F'), autor('A3', 'Romário', 'SENADOR', 'RJ', 'M')].map((a) => [a.id, a]));
const ben = (id: string, nome: string, sigla: string | null, mun: string | null, uf: string) => ({ id, nome, sigla, entregaMunicipio: mun, entregaUf: uf }) as unknown as BeneficiarioEmenda;
const beneficiarios = new Map([ben('b1', 'Brigada Militar', 'BM-RS', 'Soledade', 'RS'), ben('b2', 'Brigada Militar', 'BM-RS', 'Mormaço', 'RS'), ben('b3', 'Polícia Militar', 'PMERJ', null, 'RJ')].map((b) => [b.id, b]));

describe('quadros da autorização de empenho', () => {
  it('parlamentar e beneficiário como no documento', () => {
    expect(parlamentarDoQuadro(autores.get('A1'))).toBe('Deputado Federal Giovani Cherini - RS');
    expect(parlamentarDoQuadro(autores.get('A2'))).toBe('Deputada Federal Chris Tonietto - RJ');
    expect(parlamentarDoQuadro(autores.get('A3'))).toBe('Senador Romário - RJ');
    expect(beneficiarioDoQuadro({ beneficiarioId: 'b1' }, beneficiarios)).toBe('Brigada Militar · BM-RS (Soledade - RS)');
    expect(beneficiarioDoQuadro({ beneficiarioId: null, beneficiarioNome: 'BRIGADA MILITAR – RS (Mormaço – RS)' }, beneficiarios)).toBe('BRIGADA MILITAR – RS (Mormaço – RS)');
  });

  it('instrumento e fornecedor vindos do sistema', () => {
    expect(instrumentoDaAta('00031/2025', '31805339')).toBe('Ata nº 31/2025 (31805339)');
    expect(instrumentoDaAta('00031/2025', null)).toBe('Ata nº 31/2025');
    expect(fornecedorDaAta('MARCELO SILVEIRA DA COSTA', '40437906191')).toBe('MARCELO SILVEIRA DA COSTA (CPF 404.379.061-91)');
    expect(fornecedorDaAta('EMPRESA LTDA', '12345678000190')).toBe('EMPRESA LTDA (CNPJ 12.345.678/0001-90)');
  });

  it('vários pedidos: agrupa por item e, dentro dele, por pedido; o quadro da unidade soma por item', () => {
    const p499 = pedido(499, 'A1', '28630004', [linha('l1', '00001', 4, 'b1'), linha('l2', '00001', 4, 'b2')]);
    const p506 = pedido(506, 'A2', '39420015', [linha('l3', '00002', 8, 'b3')]);
    const p443 = pedido(443, 'A3', '37990010', [linha('l4', '00002', 2, 'b3')]);
    const q = montarQuadros({ ataKey: ATA, pedidos: [p499, p506, p443].map((p) => ({ pedido: p, linhas: p.linhas })), itens, autores, beneficiarios });
    expect(q.itens.map((i) => [i.numeroItem, i.quantidade, i.total])).toEqual([[1, 8, 44631.2], [2, 10, 53190.7]]);
    expect(q.itens[1].pedidos.map((p) => p.numero)).toEqual([506, 443]);
    expect(q.total).toBe(97821.9);
    const h1 = htmlQuadroPretensoes(q, 'Ata nº 31/2025 (31805339)');
    // ARP, item e objeto mesclados pelas linhas do item; parlamentar mesclado pelas linhas do pedido.
    expect(h1).toContain('rowspan="2"><b>Ata nº 31/2025 (31805339)</b>');
    expect(h1).toContain('rowspan="2">Deputado Federal Giovani Cherini - RS');
    expect(h1).toContain('Senador Romário - RJ');
    expect(h1).toContain('97.821,90');
    const h2 = htmlQuadroUnidade(q, { unidade: 'Secretaria Nacional de Segurança Pública - Senasp (Gerenciador)', modalidade: 'Pregão Eletrônico', certame: 'Pregão nº 90005/2024', uasg: '200331', instrumento: 'Ata nº 31/2025 (31805339)', fornecedor: 'X (CPF 1)' });
    expect(h2).toContain('Pregão nº 90005/2024');
    expect(h2).toContain('>10<');
    expect(h2).toContain('53.190,70');
  });

  it('linha já numa solicitação assinada fica de fora; pedido além da autorização não entra', () => {
    const assinada: DocumentoSeiDoPedido = { id: 'd1', etapa: 'AUTORIZACAO', numero: '37098929', data: null, ataKey: ATA, assinadaEm: '2026-09-24', linhas: [{ linhaId: 'l1', quantidade: 4 }] };
    const aguardando: DocumentoSeiDoPedido = { id: 'd2', etapa: 'AUTORIZACAO', numero: '37100000', data: null, ataKey: ATA, assinadaEm: null, linhas: [{ linhaId: 'l2', quantidade: 4 }] };
    const p = pedido(499, 'A1', '28630004', [linha('l1', '00001', 4, 'b1'), linha('l2', '00001', 4, 'b2')], { etapa: 'AUTORIZADO', documentos: [assinada, aguardando] });
    expect(linhasDaAtaParaAutorizar(p, ATA).map((l) => l.id)).toEqual(['l2']);
    expect(pedidoEntraNaAutorizacao(p, ATA)).toBe(true);
    expect(pedidoEntraNaAutorizacao({ ...p, etapa: 'CGOFI' }, ATA)).toBe(false);
    expect(pedidoEntraNaAutorizacao(pedido(1, 'A1', 'x', [linha('l9', '00001', 1, 'b1', { itemKey: '00099/2024-200331-00001' })]), ATA)).toBe(false);
  });
});
