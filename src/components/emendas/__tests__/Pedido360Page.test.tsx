import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AutorEmenda, ItemCaep, LinhaPedido, PedidoEmenda } from '../../../services/emendasService';

const A = '00031/2025-200331';
const B = '00048/2025-200331';
const item = (itemKey: string, numeroAta: string, nomeCurto: string, fornecedor: string): ItemCaep => ({
  itemKey, numeroAta, codigoUasg: '200331', numeroItem: '00001', descricao: nomeCurto, codigoPdm: 1,
  valorUnitario: 100, vigenciaFinal: '2027-06-25', ataEncerrada: false, alocado: 100, nomeCurto, fornecedor
});
const linha = (id: string, quantidade: number, itemKey = `${A}-00001`): LinhaPedido => ({
  id, ordem: 1, tipo: 'ITEM', itemKey, kitId: null, kitNome: null, kitVersao: null, kitComposicao: null,
  quantidade, beneficiarioId: null, cancelada: false, canceladaMotivo: null,
  empenhoDocumentoSei: null, contratoNumero: null, despachoDocumentoSei: null
});
const pedido = (id: string, autorId: string | null, etapa: PedidoEmenda['etapa'], extra: Partial<PedidoEmenda> = {}): PedidoEmenda => ({
  id, numero: 900, numeroNoAno: null, anoDoNumero: null, autorId, etapa, origem: 'SISTEMA', observacao: null, contatoNome: null, contatoTelefone: null, contatoEmail: null, reservadoEm: '2026-10-20',
  minutaEm: null, minutaDocumentoSei: null, oficioNumero: null, oficioDocumentoSei: null, oficioProcessoSei: null, oficioEm: null, divergencia: null, devolvidoEm: null, siopEmenda: null, siopEmendaAno: null,
  siopValor: null, siopGnd: null, conferidoEm: null, solicitadoEm: null, solicitadoDocumentoSei: null, autorizadoEm: null, autorizadoDocumentoSei: null, cgofiEm: null, cgofiDocumentoSei: null,
  empenhadoEm: null, empenhadoDocumentosSei: [], contratacaoEm: null, contratacaoDocumentosSei: [], canceladoEm: null,
  canceladoMotivo: null, versao: 1, atualizadoPorNome: null, atualizadoEm: null, linhas: [linha(`${id}-l`, 3)], devolucoes: [], documentos: [], pedidoOrigemId: null, pedidoOrigemNome: null, anulacoes: [], emendaId: null, outrasEmendas: [],
  ...extra
});
const autor = (id: string, nome: string): AutorEmenda => ({ id, nome, tipo: 'DEPUTADO', nomeCivil: null, partido: 'PX', uf: 'SP', emExercicio: true, legislatura: 57, lidoEm: null });

const COM_CONTATO = pedido('p1', 'A1', 'OFICIO', {
  contatoNome: 'Maria da Assessoria', contatoTelefone: '61999990000', contatoEmail: 'maria@camara.leg.br', oficioEm: '2026-10-10', oficioProcessoSei: '08027.000226/2026-61', minutaEm: '2026-10-01'
});
const DEVOLVIDO = pedido('dev', 'A1', 'RESERVADO', {
  oficioProcessoSei: '08027.000226/2026-61', divergencia: 'valor diferente', devolvidoEm: '2026-10-20',
  devolucoes: [{ rodada: 1, minutaEm: '2026-09-10', oficioEm: '2026-09-25', oficioDocumentoSei: '40555666', oficioProcessoSei: '08027.000226/2026-61', motivo: 'valor diferente', devolvidoEm: '2026-10-20', criadoPorNome: null }]
});
// Com número (migration 217): 1/2026 do Deputado Um, enviado à CCGA e ainda sem contrato.
const NA_CCGA = pedido('ccga', 'A1', 'CONTRATACAO', {
  numeroNoAno: 1, anoDoNumero: 2026, siopEmenda: '31660008', siopEmendaAno: 2026, siopGnd: 'GND-4', siopValor: 300,
  solicitadoDocumentoSei: '41000001', cgofiDocumentoSei: '41000003', empenhadoDocumentosSei: ['41000004', '41000005'], contratacaoDocumentosSei: ['41000006'], contratacaoEm: '2026-10-15'
});
const DUAS_ATAS = pedido('aut', 'A1', 'CGOFI', {
  solicitadoEm: '2026-09-23', autorizadoEm: '2026-09-24', cgofiEm: '2026-09-30',
  linhas: [linha('aut-1', 8, `${A}-00001`), linha('aut-2', 3, `${B}-00001`)],
  documentos: [
    { id: '37098929', linhas: [], etapa: 'AUTORIZACAO', numero: '37098929', data: '2026-09-23', ataKey: A, assinadaEm: '2026-09-24' },
    { id: '37162877', linhas: [], etapa: 'CGOFI', numero: '37162877', data: '2026-09-29', ataKey: null, assinadaEm: null }
  ]
});
const BLOCOS = pedido('blocos', 'A1', 'AUTORIZADO', {
  oficioProcessoSei: '08027.000215/2026-81', solicitadoEm: '2026-09-23', autorizadoEm: '2026-09-24',
  linhas: [linha('b-1', 8), linha('b-2', 3), linha('b-3', 5, `${B}-00001`), { ...linha('b-4', 2), cancelada: true, canceladaMotivo: 'Passou para o pedido reservado em 20/10/2026.' }],
  documentos: [
    { id: 'd1', etapa: 'AUTORIZACAO', numero: '37098929', data: '2026-09-23', ataKey: A, assinadaEm: '2026-09-24', linhas: [{ linhaId: 'b-1', quantidade: 8 }] },
    { id: 'd2', etapa: 'AUTORIZACAO', numero: '37099000', data: '2026-10-01', ataKey: A, assinadaEm: null, linhas: [{ linhaId: 'b-2', quantidade: 3 }] },
    { id: 'd3', etapa: 'AUTORIZACAO', numero: '37104393', data: '2026-09-23', ataKey: B, assinadaEm: '2026-09-24', linhas: [] }
  ]
});
const DUAS_EMENDAS = pedido('p5', 'A1', 'CONTRATACAO', {
  numeroNoAno: 2, anoDoNumero: 2026, siopEmenda: '71070008', siopEmendaAno: 2026,
  outrasEmendas: [{ id: 'o1', ano: 2024, numero: '71070011', documentoSei: '35633634', observacao: 'sobra de 2024', criadoPorNome: 'Luís', criadoEm: '2026-10-26T18:00:00Z' }]
});
const SEM_PARLAMENTAR = pedido('p4', null, 'RESERVADO');
const PEDIDOS = [COM_CONTATO, DEVOLVIDO, NA_CCGA, DUAS_ATAS, BLOCOS, DUAS_EMENDAS, SEM_PARLAMENTAR];

const perfil = vi.hoisted(() => ({ gerir: true }));

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-23',
  usePedidosEmendas: () => ({ data: PEDIDOS, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn(), dataUpdatedAt: 0 }),
  useNotasDasLinhas: () => ({ data: new Map() }),
  useDiferencasDeEmpenho: () => ({ conferencia: [], diferencas: new Map(), porItem: new Map(), resolvidos: new Set<string>() }),
  useCredorDiferente: () => ({ porPedido: new Map(), todosPorPedido: new Map(), resolvidos: new Set<string>() }),
  useItensCaep: () => ({ data: [item(`${A}-00001`, '00031/2025', 'Carabina', 'FORNECEDOR A'), item(`${B}-00001`, '00048/2025', 'Mira', 'FORNECEDOR B')], isLoading: false }),
  useAutoresEmendas: () => ({ data: [autor('A1', 'Deputado Um')] }),
  useBeneficiariosEmendas: () => ({ data: [] }),
  useKitsEmendas: () => ({ data: [] }),
  usePodeGerirEmendas: () => perfil.gerir,
  usePodeVerContratos: () => false,
  useRemoverEmendaDoPedido: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useLigarEmendaAoPedido: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useNotasSemPedido: () => ({ data: [] }),
  useMapaGruposBeneficiarios: () => new Map()
}));
vi.mock('../../../hooks/useEmendasQuadro', () => ({ usePrecosParaEmenda: () => ({ precos: undefined, ipca: null, semPrevisao: false }) }));
vi.mock('../PedidoModal', () => ({ PedidoModal: () => null }));
vi.mock('../EtapaPedidoModal', () => ({ EtapaPedidoModal: () => null }));
vi.mock('../AnulacaoModal', () => ({ AnulacaoModal: () => null }));
vi.mock('../AutorizacaoQuadrosModal', () => ({ AutorizacaoQuadrosModal: () => null }));

import { Pedido360Page } from '../pedido360/Pedido360Page';
import { pedidoDoEndereco } from '../pedido360/pedidoDoEndereco';

const render = (url: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/emendas/parlamentares/:autorId/pedidos/:ano/:ordem" element={<Pedido360Page />} />
        <Route path="/emendas/pedidos/id/:id" element={<Pedido360Page />} />
      </Routes>
    </MemoryRouter>
  );

describe('Pedido 360: endereço e número do pedido (migration 217)', () => {
  it('acha o pedido pelo parlamentar, ano e ordem, ou pelo identificador interno', () => {
    expect(pedidoDoEndereco(PEDIDOS, { autorId: 'A1', ano: '2026', ordem: '1' })?.id).toBe('ccga');
    expect(pedidoDoEndereco(PEDIDOS, { autorId: 'A1', ano: '2026', ordem: '9' })).toBeUndefined();
    expect(pedidoDoEndereco(PEDIDOS, { id: 'dev' })?.id).toBe('dev');
  });

  it('o cartão mostra o número no parlamentar e nunca o sequencial do banco', () => {
    const html = render('/emendas/parlamentares/A1/pedidos/2026/1');
    expect(html).toContain('Pedido 1/2026');
    expect(html).toContain('Deputado Um');
    expect(html).toContain('Emenda 3166 0008 / 2026');
    expect(html).not.toContain('900');
  });

  it('sem emenda, o pedido é uma reserva e o endereço é o interno', () => {
    const html = render('/emendas/pedidos/id/p4');
    expect(html).toContain('Reserva de 20/10/2026');
    expect(html).toContain('Parlamentar a definir');
    expect(html).toContain('emendas-pedido-sem-autor-p4');
  });

  it('cartão (28/10/2026): o pedido no título, o parlamentar embaixo, itens somados pelo nome e a próxima tarefa na etapa', () => {
    const html = render('/emendas/parlamentares/A1/pedidos/2026/1');
    expect(html).toMatch(/<h1 class="i360-title">.*?>Pedido 1\/2026<\/button>/);
    expect(html).toContain('pedido-360-abrir-parlamentar');
    expect(html).toContain('pedido-360-abrir-emenda');
    expect(html).not.toContain('instrument-360-origin');
    const blocos = render('/emendas/pedidos/id/blocos');
    const resumo = blocos.match(/data-testid="pedido-360-resumo-itens">(.*?)<\/span><\/div>/)?.[1].replace(/<!-- -->|<[^>]*>/g, '');
    expect(resumo).toBe('3 itens em 2 atas · 11× Carabina · 5× Mira');
    expect(blocos).not.toContain('pedido-360-mais-itens');
    expect(render('/emendas/pedidos/id/p1')).toContain('próximo: conferir com o SIOP');
    expect(render('/emendas/pedidos/id/dev')).toContain('próximo: registrar a 2ª minuta');
  });

  it('endereço que não existe: pedido não encontrado', () => {
    expect(render('/emendas/parlamentares/A1/pedidos/2026/9')).toContain('Pedido não encontrado');
  });
});

describe('Pedido 360: cartão e Andamento', () => {
  it('contato da assessoria: o coordenador e o gestor de emendas veem; a consulta não (decisão de 25/10/2026)', () => {
    expect(render('/emendas/pedidos/id/p1')).toContain('Maria da Assessoria');
    perfil.gerir = false;
    try {
      const html = render('/emendas/pedidos/id/p1');
      expect(html).toContain('Deputado Um');
      expect(html).not.toContain('Maria da Assessoria');
      expect(html).not.toContain('61999990000');
      expect(html).not.toContain('emendas-pedido-contato-p1');
    } finally {
      perfil.gerir = true;
    }
  });

  it('no ofício: etapa 3 de 13, a conferência é com a CAEP e o botão da próxima etapa está no cartão e na tarefa', () => {
    const html = render('/emendas/pedidos/id/p1');
    expect(html).toContain('3 de 13');
    expect(html).toContain('pedido360-proxima-p1');
    expect(html).toContain('emendas-pedido-proximo-p1');
    expect(html).toContain('Conferir com o SIOP');
    expect(html).toMatch(/pedido360-tarefa-conferir" data-estado="COMIGO"/);
    expect(html).toMatch(/pedido360-tarefa-minuta" data-estado="FEITA"/);
    // A etiqueta da ação e os contadores do Plano de gestão das atas.
    expect(html).toContain('plan-acao');
    expect(html).toContain('plan-contadores');
    expect(html).toContain('Comigo agora');
  });

  it('ofício devolvido: a 2ª minuta com a tentativa anterior e o aviso', () => {
    const html = render('/emendas/pedidos/id/dev');
    expect(html).toContain('pedido360-devolucoes');
    expect(html).toContain('Ofício devolvido uma vez');
    expect(html).toContain('Registrar a 2ª minuta');
    expect(html).toContain('valor diferente');
  });

  it('na CCGA sem contrato: contrato fecha sozinho, fases concluídas recolhidas e sem cancelar nem alterar', () => {
    const html = render('/emendas/parlamentares/A1/pedidos/2026/1');
    expect(html).toContain('9 de 13');
    expect(html).toMatch(/pedido360-tarefa-contrato" data-estado="FONTE"/);
    expect(html).toContain('0 de 1 item com contrato');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('41000004');
    expect(html).toContain('41000006');
    expect(html).toContain('emendas-pedido-mais-sei-CONTRATACAO');
    expect(html).not.toContain('emendas-pedido-cancelar-ccga');
    expect(html).not.toContain('emendas-pedido-alterar-ccga');
    // A fase Execução aparece; a entrega fecha pela fatura depois do contrato.
    expect(html).toContain('pedido360-fase-EXECUCAO');
  });

  it('solicitação por ata: 1 de 2 atas e o envio à CGOFI com a data de cada documento', () => {
    const html = render('/emendas/pedidos/id/aut');
    expect(html).toMatch(/pedido360-tarefa-solicitacao" data-estado="COMIGO"/);
    expect(html).toContain('1 de 2 atas');
    expect(html).toContain('37162877');
    expect(html).toContain('29/09/2026');
  });

  it('O que falta vira pendência da tarefa: assinatura com botão, próximo passo e beneficiário', () => {
    const html = render('/emendas/pedidos/id/blocos');
    expect(html).toContain('Informar a assinatura da solicitação 37099000 · ata 00031/2025');
    expect(html).toContain('emendas-pedido-tarefa-ass-37099000');
    expect(html).toContain('Registrar o envio à CGOFI');
    expect(html).toContain('Informar o beneficiário de 3 itens');
    expect(html).toContain('1 aguardando a assinatura · 2 autorizados');
  });
});

describe('Pedido 360: Itens e Execução', () => {
  it('Itens: blocos por ata com a situação de cada linha e os itens tirados', () => {
    const html = render('/emendas/pedidos/id/blocos?aba=itens');
    expect(html).toContain('emendas-pedido-ata-00031/2025');
    expect(html).toContain('emendas-pedido-ata-00048/2025');
    expect(html).toMatch(/emendas-linha-situacao-b-2" data-situacao="AGUARDANDO_ASSINATURA"/);
    expect(html).toContain('1 item tirado do pedido: Passou para o pedido reservado em 20/10/2026.');
  });

  it('Itens vindo do Item 360 (?item=): as linhas daquele item em destaque', () => {
    const html = render(`/emendas/pedidos/id/blocos?aba=itens&item=${encodeURIComponent(`${A}-00001`)}`);
    expect(html).toContain('background:var(--primary-light)');
    expect(html).toContain('/atas/detalhe/00031%2F2025-200331/itens/00001?aba=emendas');
  });

  it('Execução: as emendas do pedido no alto, com os botões só para quem gere', () => {
    const html = render('/emendas/parlamentares/A1/pedidos/2026/2?aba=execucao');
    expect(html).toContain('emendas-pedido-emendas-p5');
    expect(html).toContain('2024 · 7107 0011');
    expect(html).toContain('emendas-pedido-emenda-tirar-71070011');
    perfil.gerir = false;
    try {
      const leitura = render('/emendas/parlamentares/A1/pedidos/2026/2?aba=execucao');
      expect(leitura).toContain('2024 · 7107 0011');
      expect(leitura).not.toContain('emendas-pedido-emenda-tirar-71070011');
    } finally {
      perfil.gerir = true;
    }
  });

  it('Execução antes do empenho: avisa que começa com a nota', () => {
    expect(render('/emendas/pedidos/id/p1?aba=execucao')).toContain('pedido360-execucao-antes');
  });
});
