import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ItemCaep, LinhaPedido, PedidoEmenda } from '../../../services/emendasService';

vi.mock('../../../hooks/useEmendas', () => ({
  hojeEmBrasilia: () => '2026-10-28',
  useAutoresEmendas: () => ({ data: [{ id: 'B2', nome: 'Dep. B' }] }),
  useConferirOficio: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useEmendasSiop: () => ({ data: [] }),
  usePedidoEmDiaNaTela: () => () => true,
  useRegistrarOficioRetificador: () => ({ isPending: false, mutateAsync: vi.fn() })
}));
vi.mock('../../../design-system/components/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), show: vi.fn() }) }));

import { ConferenciaDoOficio } from '../pedido360/ConferenciaDoOficio';

const A = '00031/2025-200331';
const B = '00048/2025-200331';
const item = (k: string, numeroAta: string, nomeCurto: string, fornecedor: string, valorUnitario: number): ItemCaep => ({
  itemKey: k,
  numeroAta,
  codigoUasg: '200331',
  numeroItem: '00001',
  descricao: nomeCurto,
  codigoPdm: 1,
  valorUnitario,
  vigenciaFinal: '2027-06-25',
  ataEncerrada: false,
  alocado: 100,
  nomeCurto,
  fornecedor
});
const itensLista = [item(`${A}-00001`, '00031/2025', 'Carabina', 'FORNECEDOR A', 100), item(`${B}-00001`, '00048/2025', 'Mira', 'FORNECEDOR B', 50)];
const itens = new Map(itensLista.map((i) => [i.itemKey, i]));
const linha = (id: string, itemKey: string, quantidade: number): LinhaPedido => ({
  id,
  ordem: 1,
  tipo: 'ITEM',
  itemKey,
  kitId: null,
  kitNome: null,
  kitVersao: null,
  kitComposicao: null,
  quantidade,
  beneficiarioId: 'b1',
  cancelada: false,
  canceladaMotivo: null,
  empenhoDocumentoSei: null,
  contratoNumero: null,
  despachoDocumentoSei: null
});
const pedido = (extra: Partial<PedidoEmenda> = {}): PedidoEmenda =>
  ({
    id: 'p',
    numero: 1,
    autorId: 'A1',
    etapa: 'OFICIO',
    origem: 'SISTEMA',
    reservadoEm: '2026-09-01',
    oficioDocumentoSei: '37091178',
    oficioProcessoSei: null,
    siopEmenda: '28630004',
    siopEmendaAno: null,
    siopValor: null,
    siopGnd: null,
    oficioValor: null,
    versao: 1,
    linhas: [linha('l1', `${A}-00001`, 8), linha('l2', `${B}-00001`, 3)],
    devolucoes: [],
    documentos: [],
    anulacoes: [],
    emendaId: null,
    outrasEmendas: [],
    minutaPrecos: null,
    ...extra
  }) as unknown as PedidoEmenda;

const render = (p: PedidoEmenda, pedidos: PedidoEmenda[] = []) =>
  renderToStaticMarkup(
    <ConferenciaDoOficio
      pedido={p}
      pedidos={pedidos}
      itens={itens}
      itensLista={itensLista}
      beneficiarios={new Map()}
      beneficiariosLista={[]}
      autor={undefined}
      nomeDoAutor="Deputado"
      precos={undefined}
      reservadoFora={new Map()}
      hoje="2026-10-28"
      onSair={() => {}}
      onNovaMinuta={() => {}}
    />
  );

describe('conferência do ofício no Pedido 360 (protótipo aprovado em 28/10/2026)', () => {
  it('os itens do pedido por ata, cada um para marcar, ajustar ou retirar; os 6 pontos do SIOP sem beneficiário e objeto', () => {
    const html = render(pedido());
    expect(html).toContain('conferencia-ata-00031/2025');
    expect(html).toContain('conferencia-ata-00048/2025');
    expect(html).toContain('conferencia-confere-l1');
    expect(html).toContain('conferencia-qtd-l2');
    expect(html).toContain('conferencia-retirar-l1');
    expect(html).toContain('0 de 1 conferidos');
    for (const k of ['numero_emenda', 'autor', 'valor', 'gnd', 'compra_direta', 'uf']) expect(html).toContain(`conferencia-ponto-${k}`);
    expect(html).not.toContain('conferencia-ponto-beneficiario');
    expect(html).not.toContain('conferencia-ponto-objeto');
    expect(html).toContain('Não bate: gerar nova minuta');
  });

  it('o previsto (950) cabe no que sobra da emenda: igual cabe, menor não cabe', () => {
    const cabe = render(pedido({ siopValor: 950, oficioValor: 900 }));
    expect(cabe).toContain('data-testid="conferencia-cabe">Cabe<');
    expect(cabe).not.toContain('conferencia-nao-cabe');
    const naoCabe = render(pedido({ siopValor: 949.99, oficioValor: 950 }));
    expect(naoCabe).toContain('Não cabe');
    expect(naoCabe).toContain('conferencia-nao-cabe');
  });

  it('o valor do ofício não se digita: é a soma dos itens, e a CAEP só confere (migration 249)', () => {
    const html = render(pedido({ siopValor: 950 }));
    expect(html).not.toContain('conferencia-valor-oficio');
    expect(html).not.toContain('Ofício retificador');
    expect(html).toContain('Os itens somam');
    expect(html).toContain('conferencia-soma-dica');
    expect(html).toContain('Tudo confere com o ofício SEI 37091178 (R$');
  });

  it('retificador depois do empenho (migration 250): soma = ofício anterior + acréscimos; empenhado não sai nem desce', () => {
    const html = renderToStaticMarkup(
      <ConferenciaDoOficio
        pedido={pedido({ etapa: 'EMPENHADO', oficioValor: 1234.56, oficioValorDocumentoSei: '37091178' })}
        pedidos={[]}
        itens={itens}
        itensLista={itensLista}
        beneficiarios={new Map()}
        beneficiariosLista={[]}
        autor={undefined}
        nomeDoAutor="Deputado"
        precos={undefined}
        reservadoFora={new Map()}
        hoje="2026-10-28"
        retificador
        onSair={() => {}}
        onNovaMinuta={() => {}}
      />
    );
    expect(html).toContain('Ofício anterior + acréscimos');
    expect(html).toContain('1.234,56');
    expect(html).toContain('os itens empenhados não mudam');
    expect(html).not.toContain('conferencia-retirar-l1');
    expect(html).toContain('>empenhado<');
    expect(html).toContain('conferencia-abrir-acrescentar');
  });

  it('retificador: pede o SEI, mostra o ofício anterior e esconde o SIOP e as marcas', () => {
    const html = renderToStaticMarkup(
      <ConferenciaDoOficio
        pedido={pedido({ etapa: 'CONFERIDO', oficioValor: 1200, oficioValorDocumentoSei: '37091178' })}
        pedidos={[]}
        itens={itens}
        itensLista={itensLista}
        beneficiarios={new Map()}
        beneficiariosLista={[]}
        autor={undefined}
        nomeDoAutor="Deputado"
        precos={undefined}
        reservadoFora={new Map()}
        hoje="2026-10-28"
        retificador
        onSair={() => {}}
        onNovaMinuta={() => {}}
      />
    );
    expect(html).toContain('Ofício retificador');
    expect(html).toContain('substitui o ofício SEI 37091178');
    expect(html).toContain('retificador-sei');
    expect(html).toContain('Ofício anterior');
    expect(html).toContain('menos R$');
    expect(html).toContain('retificador-confere');
    expect(html).toContain('retificador-nao-confere-botao');
    expect(html).toContain('conferencia-qtd-l1');
    expect(html).not.toContain('conferencia-confere-l1');
    expect(html).not.toContain('conferencia-ponto-');
    expect(html).not.toContain('Não bate: gerar nova minuta');
  });

  it('os outros pedidos da mesma emenda descontam da sobra', () => {
    const outro = { ...pedido({ etapa: 'CONTRATACAO', oficioValor: 100 }), id: 'outro', siopEmenda: '28630004' };
    const html = render(pedido({ siopValor: 1000, oficioValor: 950 }), [outro]);
    expect(html).toContain('menos R$');
    expect(html).toContain('Não cabe');
  });

  it('o preço que mudou depois da minuta só informa e diz a ata', () => {
    const html = render(pedido({ siopValor: 5000, oficioValor: 950, minutaPrecos: { [`${A}-00001`]: 90, [`${B}-00001`]: 50 } }));
    expect(html).toContain('conferencia-preco-mudou');
    expect(html).toContain('ata 00031/2025');
    expect(html).toContain('data-testid="conferencia-cabe">Cabe<');
  });

  it('nº da emenda: o código de autor de outro parlamentar acende o aviso, com o nome dele', () => {
    const html = render(pedido(), [{ ...pedido({ etapa: 'CONTRATACAO' }), id: 'outro', autorId: 'B2', siopEmenda: '28630011' }]);
    expect(html).toContain('conferencia-emenda-ano');
    expect(html).toContain('value="2863 0004"');
    expect(html).toContain('conferencia-emenda-outro-autor');
    expect(html).toContain('Dep. B');
    expect(html).not.toContain('conferencia-emenda-outro-pedido');
  });

  it('a mesma emenda em outro pedido do mesmo parlamentar só informa, com o processo uma vez só', () => {
    const outro = { ...pedido({ etapa: 'CONTRATACAO' }), siopEmenda: '28630004', oficioProcessoSei: '08027.000001/2026-01' };
    const html = render(pedido(), [
      { ...outro, id: 'outro' },
      { ...outro, id: 'outro2' }
    ]);
    expect(html).toContain('conferencia-emenda-outro-pedido');
    expect(html).toContain('2 outros pedidos');
    expect(html).toContain('todos do Processo 08027.000001/2026-01');
    expect(html).not.toContain('conferencia-emenda-outro-autor');
  });

  it('aberta pelo "Ofício com divergência", já começa pedindo o motivo da nova minuta', () => {
    const html = renderToStaticMarkup(
      <ConferenciaDoOficio
        pedido={pedido()}
        pedidos={[]}
        itens={itens}
        itensLista={itensLista}
        beneficiarios={new Map()}
        beneficiariosLista={[]}
        autor={undefined}
        nomeDoAutor="Deputado"
        precos={undefined}
        reservadoFora={new Map()}
        hoje="2026-10-28"
        iniciarDevolvendo
        onSair={() => {}}
        onNovaMinuta={() => {}}
      />
    );
    expect(html).toContain('conferencia-motivo');
    expect(html).toContain('conferencia-confirmar-nova-minuta');
  });
});
