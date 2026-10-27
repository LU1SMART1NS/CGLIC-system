import { describe, it, expect } from 'vitest';
import { fatiasDaCaptacao, lerFiltroCaptacao, lerModoCaptacao, situacaoGrupoBeneficiario, sugerirGrupoBeneficiario, type GrupoBeneficiario } from '../captacaoEmendas';
import type { ItemCaep, LinhaPedido, PedidoEmenda } from '../../services/emendasService';

const item = (k: string, extra: Partial<ItemCaep> = {}): ItemCaep => ({
  itemKey: k, numeroAta: '00031/2025', codigoUasg: '200331', numeroItem: '00001', descricao: k, codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, ...extra
});
const linha = (extra: Partial<LinhaPedido>): LinhaPedido => ({
  id: 'l' + Math.random(), ordem: 1, tipo: 'ITEM', itemKey: 'a', kitId: null, kitNome: null, kitVersao: null, kitComposicao: null,
  quantidade: 1, beneficiarioId: null, cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null, ...extra
});
const pedido = (extra: Partial<PedidoEmenda>): PedidoEmenda => ({
  id: 'p' + Math.random(), numero: 1, autorId: 'C:1', etapa: 'RESERVADO', origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null, siopEmendaAno: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: [], ...extra
});
const itens = new Map([item('a'), item('b', { valorUnitario: 10, numeroAta: '00061/2024', vigenciaFinal: '2026-12-19' }), item('v', { ataEncerrada: true, numeroAta: '00020/2025', vigenciaFinal: '2026-05-28' })].map((i) => [i.itemKey, i]));

const ben = (nome: string, sigla: string | null = null, naturezaJuridica: string | null = 'Órgão Público do Poder Executivo Estadual ou do Distrito Federal') => ({ nome, sigla, naturezaJuridica });

describe('sugestão do grupo do beneficiário', () => {
  it('casos reais da medição de 27/10/2026', () => {
    expect(sugerirGrupoBeneficiario(ben('10º Batalhão de Polícia Militar', '10º BPM'))).toBe('CNCG');
    expect(sugerirGrupoBeneficiario(ben('1ª Delegacia de Polícia de Corumbá', '1ª DP Corumbá'))).toBe('CNPC');
    expect(sugerirGrupoBeneficiario(ben('2º Distrito Policial'))).toBe('CNPC');
    expect(sugerirGrupoBeneficiario(ben('Corpo de Bombeiros Militar do Distrito Federal', 'CBMDF'))).toBe('LIGABOM');
    expect(sugerirGrupoBeneficiario(ben('Polícia Militar do Distrito Federal', 'PMDF'))).toBe('CNCG');
    expect(sugerirGrupoBeneficiario(ben('Polícia Científica do Estado de São Paulo', 'SPTC'))).toBe('CONDPCI');
    expect(sugerirGrupoBeneficiario(ben('Secretaria da Segurança Pública do Estado de São Paulo'))).toBe('CONSESP');
  });

  it('município vai para o CNGM: guarda, natureza jurídica e secretaria de segurança sem "Estado"', () => {
    expect(sugerirGrupoBeneficiario(ben('Guarda Municipal de Toledo', null, 'Município'))).toBe('CNGM');
    expect(sugerirGrupoBeneficiario(ben('Secretaria Municipal de Segurança de Jacareí', null, 'Município'))).toBe('CNGM');
    expect(sugerirGrupoBeneficiario(ben('Secretaria de Segurança Pública de Cascavel', null, null))).toBe('CNGM');
  });

  it('Polícia Penal em Outros, mas a guarda externa dos presídios é da PM', () => {
    expect(sugerirGrupoBeneficiario(ben('Polícia Penal do Estado de Rondônia', 'PP-RO'))).toBe('OUTROS');
    expect(sugerirGrupoBeneficiario(ben('Batalhão de Guarda Externa dos Presídios', 'BPGEP'))).toBe('CNCG');
  });

  it('sem pista no nome: sem sugestão', () => {
    expect(sugerirGrupoBeneficiario(ben('Quartel Comando-Geral'))).toBeNull();
    expect(situacaoGrupoBeneficiario(null, null)).toBe('SEM_SUGESTAO');
    expect(situacaoGrupoBeneficiario(null, 'CNCG')).toBe('A_CONFIRMAR');
    expect(situacaoGrupoBeneficiario('CNCG', null)).toBe('CONFIRMADOS');
  });
});

describe('fatias da captação', () => {
  const grupos = new Map<string, GrupoBeneficiario>([['pm', 'CNCG'], ['gm', 'CNGM']]);

  it('soma o valor das linhas por grupo; sem grupo confirmado = a confirmar; sem beneficiário fica fora', () => {
    const p = pedido({
      linhas: [
        linha({ itemKey: 'a', quantidade: 6, beneficiarioId: 'pm' }),
        linha({ itemKey: 'a', quantidade: 3, beneficiarioId: 'gm' }),
        linha({ itemKey: 'a', quantidade: 1, beneficiarioId: 'novo' }),
        linha({ itemKey: 'a', quantidade: 50, beneficiarioId: null }),
        linha({ itemKey: 'a', quantidade: 99, beneficiarioId: 'pm', cancelada: true })
      ]
    });
    const f = fatiasDaCaptacao([p], grupos, itens);
    expect(f.total).toBe(1000);
    expect(f.fatias.map((x) => [x.grupo, x.pct])).toEqual([['CNCG', 60], ['CNGM', 30], ['A_CONFIRMAR', 10]]);
    expect(f.principal?.grupo).toBe('CNCG');
    expect(f.medida).toBe('VALOR');
  });

  it('CNGM pode ser a captação principal; pedido cancelado não conta', () => {
    const p1 = pedido({ linhas: [linha({ itemKey: 'a', quantidade: 2, beneficiarioId: 'gm' }), linha({ itemKey: 'b', quantidade: 5 })] });
    const p2 = pedido({ etapa: 'CANCELADO', linhas: [linha({ itemKey: 'a', quantidade: 9, beneficiarioId: 'pm' })] });
    const f = fatiasDaCaptacao([p1, p2], grupos, itens);
    expect(f.principal?.grupo).toBe('CNGM');
    expect(f.porBeneficiario).toEqual([{ grupo: 'CNGM', beneficiarios: [{ id: 'gm', valor: 200 }] }]);
  });

  it('filtro na URL aceita os grupos da captação e volta ao padrão', () => {
    expect(lerFiltroCaptacao('CNGM')).toBe('CNGM');
    expect(lerFiltroCaptacao('OUTROS')).toBe('TODOS');
    expect(lerModoCaptacao('50')).toBe('50');
    expect(lerModoCaptacao('x')).toBe('PRINCIPAL');
  });
});
