import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuantitativosTab } from '../QuantitativosTab';
import { vazioDoItem, type OrgaoQuantitativo, type QuantitativosDoItem } from '../../../services/quantitativosService';
import type { UnidadeItemRecord } from '../../../types';

// Tablet, ata 00059/2025 item 1 (registrado real; ata assinada de exemplo do protótipo).
const org = (p: Partial<OrgaoQuantitativo> & { uasg: string }): OrgaoQuantitativo => ({
  nomeOrgao: null, tipoUnidade: 'PARTICIPANTE', ehSenasp: false, quantidadeAssinada: 0, quantidadeRegistrada: 0, semRegistro: false,
  situacao: 'IGUAL', falta: 0, acima: 0, remanejadoConfirmado: 0, resto: 0, continuaDoOrgao: null, gerenciado: 0, mudou: false,
  mudouEm: null, atualizadoEm: null, ataDaSenasp: true, ...p
});
const unidade = (codigoUnidade: string, nomeUnidade: string, quantidadeRegistrada: number, tipoUnidade = 'PARTICIPANTE') =>
  ({ codigoUnidade, nomeUnidade, quantidadeRegistrada, tipoUnidade } as UnidadeItemRecord);
const UNIDADES = [
  unidade('200331', 'SECRETARIA NACIONAL DE SEGURANCA PUBLICA - SENASP', 801, 'GERENCIADORA'),
  unidade('200109', 'POLICIA RODOVIARIA FEDERAL', 70),
  unidade('453079', 'SECRETARIA DE ESTADO DA SEGURANCA PUBLICA', 464),
  unidade('450955', 'SECRETARIA DE ESTADO DA SEGURANCA CIDADA', 0)
];
const INFORMADO: QuantitativosDoItem = {
  ...vazioDoItem(),
  informado: true, documentoSei: '12345678', informadoPorNome: 'Maria Souza', informadoEm: '2026-10-13T12:00:00Z',
  homologado: 4863, totalAssinada: 4863, totalRegistrado: 4863, assinadaSenasp: 755, registradoSenasp: 801, gerenciadoParticipantes: 66, cotaPropria: 735, alocado: 690,
  orgaos: [
    org({ uasg: '200331', ehSenasp: true, situacao: 'SENASP', quantidadeAssinada: 755, quantidadeRegistrada: 801 }),
    org({ uasg: '200109', quantidadeAssinada: 70, quantidadeRegistrada: 70 }),
    org({ uasg: '453079', situacao: 'GERENCIADO', quantidadeAssinada: 500, quantidadeRegistrada: 464, falta: 36, resto: 36, gerenciado: 36 }),
    org({ uasg: '450955', situacao: 'REMANEJADO_A_MENOS', quantidadeAssinada: 30, quantidadeRegistrada: 0, falta: 30, resto: 30, mudou: true, mudouEm: '2026-03-31T18:17:56', atualizadoEm: '2026-03-31T18:17:56' }),
    org({ uasg: '926016', nomeOrgao: 'POLÍCIA MILITAR DO DISTRITO FEDERAL', situacao: 'GERENCIADO', quantidadeAssinada: 30, quantidadeRegistrada: null, semRegistro: true, falta: 30, resto: 30, gerenciado: 30 })
  ],
  registros: [{ id: 'r1', documentoSei: '12345678', justificativa: null, informadoPorNome: 'Maria Souza', informadoEm: '2026-10-13T12:00:00Z', total: 4863 }],
  contratos: [{ uasg: '200109', contratoId: '9', numero: '00059/2026', tipo: 'Contrato', situacao: 'Ativo', quantidade: 20, valorUnitario: 1394, valorGlobal: 27880, vigenciaFim: '2027-01-10', vistoEm: '2026-10-13' }],
  leituras: new Map([['200109', { lidoEm: 'x', contratosNaUg: 686 }], ['453079', { lidoEm: 'x', contratosNaUg: 0 }]])
};

const base: React.ComponentProps<typeof QuantitativosTab> = {
  itemKey: '00059/2025-200331-00001',
  tituloItem: 'Ata 00059/2025 · item 00001',
  ataDaCglic: true,
  homologado: 4863,
  unidades: UNIDADES,
  loading: false,
  error: null,
  origem: 'API',
  copiadoEm: null,
  registradoSenasp: 801,
  baseSaldo: 735,
  contratadoSenasp: 690,
  quantitativos: INFORMADO,
  podeInformar: false,
  podeRemanejar: true,
  alocado: 690,
  totalUnidadesInternas: 2,
  unidadesInternas: <div data-testid="unidades-internas-stub">DIOPI e CAEP</div>
};

const html = (over: Partial<typeof base> = {}) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <QuantitativosTab {...base} {...over} />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('QuantitativosTab', () => {
  it('ata assinada informada: faixa da SENASP com a cota própria e o saldo dela', () => {
    const h = html();
    expect(h).toContain('SENASP neste item');
    expect(h).toContain('Gerenciado p/ participantes');
    expect(h).toContain('Cota própria');
    expect(h).toContain('livre para alocar 45');
    expect(h).toContain('Saldo da cota própria');
    expect(h).toContain('registrado − contratado: 111');
    expect(h).toContain('data-testid="ata-assinada-sei"');
    expect(h).toContain('12345678');
  });

  it('a linha da SENASP já vem aberta com as unidades internas', () => {
    const h = html();
    expect(h).toContain('data-testid="unidades-internas-stub"');
    expect(h).toContain('Gerencia 66 para participantes');
  });

  it('situações e contratado dos participantes com os nomes aprovados', () => {
    const h = html();
    expect(h).toContain('Gerenciado pela SENASP · 36');
    expect(h).toContain('Remanejado · 30 a menos');
    expect(h).toContain('órgão sem registro no Compras.gov');
    expect(h).toContain('POLÍCIA MILITAR DO DISTRITO FEDERAL');
    expect(h).toContain('1 contrato no Contratos.gov.br');
    expect(h).toContain('sem dado');
  });

  it('gestor de saldo vê o menu de ações; gestor da ata não, mas pode corrigir a ata assinada', () => {
    expect(html()).toContain('data-testid="acoes-453079"');
    expect(html()).not.toContain('corrigir-ata-assinada');
    const gestorDaAta = html({ podeRemanejar: false, podeInformar: true });
    expect(gestorDaAta).not.toContain('data-testid="acoes-453079"');
    expect(gestorDaAta).toContain('Corrigir qtd. da ata assinada');
  });

  it('sem a ata assinada: aviso para informar e a faixa com a quantidade SENASP', () => {
    const h = html({ quantitativos: vazioDoItem(), baseSaldo: 801, podeInformar: true });
    expect(h).toContain('Não informado');
    expect(h).toContain('Informar qtd. da ata assinada');
    expect(h).toContain('Quantidade SENASP');
    expect(h).not.toContain('Qtd. na ata assinada');
    expect(h).toContain('POLICIA RODOVIARIA FEDERAL');
  });

  it('ata de outro órgão: não oferece informar a ata assinada', () => {
    const h = html({ quantitativos: vazioDoItem(), ataDaCglic: false, podeInformar: true });
    expect(h).not.toContain('Informar qtd. da ata assinada');
  });

  it('cota própria negativa e somas que não fecham ganham aviso', () => {
    const h = html({ baseSaldo: -15, quantitativos: { ...INFORMADO, totalAssinada: 4800, totalRegistrado: 4900 } });
    expect(h).toContain('data-testid="cota-negativa"');
    expect(h).toContain('data-testid="soma-assinada-nao-fecha"');
    // Soma do registrado acima do homologado tem aviso próprio (migration 142); a barra fica só para a soma abaixo.
    expect(h).not.toContain('data-testid="soma-registrado-nao-fecha"');
    expect(html({ quantitativos: { ...INFORMADO, totalRegistrado: 4800 } })).toContain('data-testid="soma-registrado-nao-fecha"');
  });

  // 00065/2024 item 5 (dados reais de 16/10/2026): homologado 1.782 × soma do registrado 2.081; SENASP 96 × ata assinada 89.
  const AVISO = {
    homologado: 1782, somaRegistrado: 2081, excedente: 299, excedenteSenasp: 7, desconto: 7,
    chave: 'SALDO::00065/2024-200331::5::REGISTRADO-ACIMA-2081.00-1782.00', resolvido: false, ataAssinadaInformada: true
  };
  const MERGULHO: QuantitativosDoItem = {
    ...INFORMADO,
    homologado: 1782, totalAssinada: 1782, totalRegistrado: 2081, assinadaSenasp: 89, registradoSenasp: 96, gerenciadoParticipantes: 0, cotaPropria: 96, alocado: 0,
    orgaos: [
      org({ uasg: '200331', ehSenasp: true, situacao: 'SENASP', quantidadeAssinada: 89, quantidadeRegistrada: 96 }),
      org({ uasg: '200334', situacao: 'ACIMA_DA_ATA', quantidadeAssinada: 272, quantidadeRegistrada: 544, acima: 272 }),
      org({ uasg: '927032', quantidadeAssinada: 134, quantidadeRegistrada: 134 })
    ]
  };
  const mergulho = { quantitativos: MERGULHO, registradoSenasp: 96, baseSaldo: 89, contratadoSenasp: 64, alocado: 0, registradoAcima: AVISO, pregaoItem: 'Pregão 90023/2024 · item 5', pdfDaAta: 'https://pncp.gov.br/pncp-api/v1/orgaos/00394494000136/compras/2024/1130/atas/1/arquivos/1' };

  it('registrado acima do homologado: aviso com órgãos acima, efeito no saldo e link do PDF; ✓ só para quem resolve', () => {
    const h = html({ ...mergulho, podeInformar: true });
    expect(h).toContain('data-testid="registrado-acima-aviso"');
    expect(h).toContain('Pregão 90023/2024 · item 5. Homologado <b>1.782</b> × soma do registrado no Compras.gov.br <b>2.081</b>');
    expect(h).toContain('data-testid="registrado-acima-orgaos"');
    expect(h).toContain('+272');
    expect(h).toContain('+7');
    expect(h).not.toContain('+0');
    expect(h).toContain('cota própria <b>89</b> em vez de 96');
    expect(h).toContain('saldo <b>25</b> em vez de 32');
    expect(h).toContain('O excedente dos participantes (292) não mexe no saldo da SENASP.');
    expect(h).toContain('Confira a IRP e o cadastro da ata no Compras.gov.br.');
    expect(h).toContain('arquivos/1');
    expect(h).toContain('data-testid="registrado-acima-resolver"');
    expect(h).toContain('menor entre registrado (96) e ata assinada (89)');
    expect(h).toContain('7 acima da ata assinada fora do saldo');
  });

  it('gestor de saldo vê o aviso sem o ✓', () => {
    const h = html({ ...mergulho, podeInformar: false });
    expect(h).toContain('data-testid="registrado-acima-aviso"');
    expect(h).not.toContain('data-testid="registrado-acima-resolver"');
    expect(h).toContain('Quem confere, corrige e resolve este aviso é o gestor da ata.');
  });

  it('sem a ata assinada: desconto provisório de todo o excedente', () => {
    const h = html({
      quantitativos: vazioDoItem(), registradoSenasp: 121600, baseSaldo: 60800, contratadoSenasp: 60800, podeInformar: true,
      registradoAcima: { ...AVISO, homologado: 116200, somaRegistrado: 177000, excedente: 60800, excedenteSenasp: 60800, desconto: 60800, ataAssinadaInformada: false }
    });
    expect(h).toContain('A ata assinada ainda não foi informada');
    expect(h).toContain('quantidade SENASP <b>60.800</b> em vez de 121.600');
    expect(h).toContain('registrado 121.600 − excedente 60.800 (provisório)');
  });

  it('aviso resolvido: some o aviso e fica a linha de resolvido', () => {
    const h = html({ ...mergulho, baseSaldo: 96, registradoAcima: { ...AVISO, desconto: 0, resolvido: true }, podeInformar: true });
    expect(h).not.toContain('data-testid="registrado-acima-aviso"');
    expect(h).toContain('data-testid="registrado-acima-resolvido"');
    expect(h).toContain('registrado − gerenciado');
  });

  it('nome, cidade e UF do cadastro de UASGs; o nome da ata fica no título', () => {
    const client = new QueryClient();
    const codigos = ['200331', '200109', '453079', '450955', '926016'].sort().join(',');
    client.setQueryData(['cadastro-uasgs', codigos], new Map([
      ['453079', { uasg: '453079', nome: 'SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA-PR', municipio: 'CURITIBA', siglaUf: 'PR' }]
    ]));
    const h = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter><QuantitativosTab {...base} /></MemoryRouter>
      </QueryClientProvider>
    );
    expect(h).toContain('SECRETARIA DE ESTADO DE SEGURANÇA PÚBLICA-PR');
    expect(h).toContain('UASG 453079 · Curitiba/PR');
    expect(h).toContain('title="Nome na ata: SECRETARIA DE ESTADO DA SEGURANCA PUBLICA"');
    // Sem cadastro: segue o nome da ata, sem cidade.
    expect(h).toContain('POLICIA RODOVIARIA FEDERAL');
    expect(h).toContain('UASG 200109<');
  });
});

