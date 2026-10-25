import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AutorEmenda, ItemCaep, LinhaPedido, PedidoEmenda } from '../../../services/emendasService';

const A = '00033/2025-200331';
const item: ItemCaep = {
  itemKey: `${A}-00003`, numeroAta: '00033/2025', codigoUasg: '200331', numeroItem: '00003', descricao: 'Camioneta', codigoPdm: 1,
  valorUnitario: 191811.62, vigenciaFinal: '2026-12-26', ataEncerrada: false, alocado: 296, nomeCurto: 'Camioneta/SUV'
};
const linha = (id: string, quantidade: number): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey: `${A}-00003`, kitId: null, kitNome: null, kitVersao: null, kitComposicao: null, quantidade, beneficiarioId: null,
  cancelada: false, canceladaMotivo: null, empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null
});
const pedido = (id: string, autorId: string, etapa: PedidoEmenda['etapa'], quantidade: number): PedidoEmenda => ({
  id, numero: 1, autorId, etapa, origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: '08027.000215/2026-81', oficioEm: null, divergencia: null, devolvidoEm: null,
  siopEmenda: null, siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null,
  cgofiDocumentoSei: null, empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null, canceladoMotivo: null, versao: 1,
  atualizadoPorNome: null, atualizadoEm: null, linhas: [linha(`${id}-l`, quantidade)], devolucoes: [], documentos: []
});
const autor: AutorEmenda = { id: 'B:MG', nome: 'Bancada MG', tipo: 'BANCADA', nomeCivil: null, partido: null, uf: 'MG', emExercicio: true, legislatura: 57, lidoEm: null };

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-24',
  useItensCaep: () => ({ data: [item], isLoading: false, isError: false, error: null }),
  usePedidosEmendas: () => ({ data: [pedido('p1', 'B:MG', 'AUTORIZADO', 38), pedido('p2', 'B:MG', 'RESERVADO', 14), pedido('p3', 'B:MG', 'CANCELADO', 99)], isLoading: false }),
  useAutoresEmendas: () => ({ data: [autor] }),
  useBeneficiariosEmendas: () => ({ data: [] }),
  useNotasDasLinhas: () => ({ data: new Map() }),
  useKitsEmendas: () => ({ data: [{ id: 'k1', nome: 'Kit viatura', ativo: true, itens: [{ itemKey: `${A}-00003`, quantidade: 1 }] }] })
}));

import { EmendasDoItemTab } from '../EmendasDoItemTab';

const render = (itemKey: string) => renderToStaticMarkup(<MemoryRouter>{<EmendasDoItemTab itemKey={itemKey} podeVerContratos={false} />}</MemoryRouter>);

describe('Item 360 › Emendas (decisão de 24/10/2026)', () => {
  it('resumo numa linha (alocado → reservado → saldo), prazo de indicação, um pedido por linha e os kits em que o item entra', () => {
    const html = render(`${A}-00003`);
    expect(html).toContain('item360-emendas-resumo');
    expect(html).toContain('Alocado à CAEP');
    // 38 + 14 reservados (o cancelado não conta); saldo 244.
    expect(html).toContain('>52<');
    expect(html).toContain('>244<');
    expect(html).toContain('Indicação até 21/11/2026');
    expect(html).toContain('item360-emendas-tabela');
    expect(html).toContain('Bancada MG');
    expect(html).toContain('Processo 08027.000215/2026-81');
    expect(html).toContain('>Reservado<'.replace('>Reservado<', 'Itens reservados'));
    expect(html).toContain('Kit viatura');
    expect(html).not.toContain('Registrar');
  });

  it('item sem alocação à CAEP: diz isso e não lista nada', () => {
    const html = render('00099/2025-200331-00001');
    expect(html).toContain('Sem alocação à CAEP.');
    expect(html).not.toContain('item360-emendas-tabela');
  });
});
