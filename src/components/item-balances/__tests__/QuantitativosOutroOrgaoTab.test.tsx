import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuantitativosOutroOrgaoTab } from '../QuantitativosOutroOrgaoTab';
import { vazioDoItem, type OrgaoQuantitativo, type QuantitativosDoItem } from '../../../services/quantitativosService';
import type { AdesaoItemRecord, UnidadeItemRecord } from '../../../types';

// Dados reais lidos em 13/10/2026: ata 00010/2025 da UASG 200342 item 7 (SENASP participante, registrado 2.003)
// e ata 00003/2025 da UASG 200334 item 2 (SENASP em adesão: 1 + 4). A ata assinada (2.400) é exemplo.
const unidade = (codigoUnidade: string, nomeUnidade: string, quantidadeRegistrada: number, tipoUnidade = 'PARTICIPANTE', dataHoraAtualizacao = '2025-10-30T14:53:00', dataHoraInclusao = '2025-10-30T14:52:41') =>
  ({ codigoUnidade, nomeUnidade, quantidadeRegistrada, tipoUnidade, dataHoraAtualizacao, dataHoraInclusao } as UnidadeItemRecord);
const UNID_PART = [
  unidade('200342', 'DIRETORIA DE TECNOLOGIA DA INFORM.E INOVACAO', 4325, 'GERENCIADORA', '2026-07-09T17:12:22'),
  unidade('200005', 'COORDENACAO-GERAL DE LOGISTICA E CONTRATOS/MJ', 3246, 'PARTICIPANTE', '2026-10-06T16:47:39'),
  unidade('200331', 'SECRETARIA NACIONAL DE SEGURANCA PUBLICA - SE', 2003, 'PARTICIPANTE', '2026-10-06T16:47:39'),
  unidade('200350', 'SUPERINTENDENCIA REG DE POLICIA FEDERAL EM MG', 1944)
];
const senasp = (p: Partial<OrgaoQuantitativo>): OrgaoQuantitativo => ({
  uasg: '200331', nomeOrgao: null, tipoUnidade: 'PARTICIPANTE', ehSenasp: true, quantidadeAssinada: 2400, quantidadeRegistrada: 2003, semRegistro: false,
  situacao: 'REMANEJADO_A_MENOS', falta: 397, acima: 0, remanejadoConfirmado: 0, resto: 397, continuaDoOrgao: null, gerenciado: 0, mudou: true,
  mudouEm: '2026-10-06T16:47:39', atualizadoEm: '2026-10-06T16:47:39', ataDaSenasp: false,
  remanejadoNaoParticipante: 0, saidaNaoParticipante: 0, naoParticipanteAguardaFonte: 0, ...p
});
const informado = (o: OrgaoQuantitativo): QuantitativosDoItem => ({
  ...vazioDoItem(),
  informado: true, documentoSei: '12345678', informadoPorNome: 'Maria Souza', informadoEm: '2026-10-13T12:00:00Z',
  orgaos: [o],
  registros: [{ id: 'r1', documentoSei: '12345678', justificativa: null, informadoPorNome: 'Maria Souza', informadoEm: '2026-10-13T12:00:00Z', total: o.quantidadeAssinada }]
});
const adesao = (dataAprovacaoAnalise: string, quantidadeAprovadaAdesao: number | null, uasg = '200331 - SECRETARIA NACIONAL DE SEGURANCA PUBLICA - SENASP'): AdesaoItemRecord =>
  ({ numeroAta: '00003/2025', unidadeGerenciadora: '200334', unidadeNaoParticipante: uasg, dataAprovacaoAnalise, quantidadeAprovadaAdesao });
const ADESOES = [adesao('2025-07-07T10:57:31', 5, '200326 - DEPEN - DIRETORIA EXECUTIVA'), adesao('2026-07-10T11:29:13', 1), adesao('2026-10-02T09:57:35', 4)];
const UNID_ADES = [
  unidade('200334', 'COORDENACAO GERAL DE ADMINISTRACAO CGAD/DLOG/', 8, 'GERENCIADORA'),
  unidade('380206', 'ESP-DEPARTAMENTO DE ADMINISTRACAO ADM.PENIT5', 2),
  unidade('200346', 'SUPERINTENDENCIA REGIONAL NO ESTADO DA BA', 0)
];

const base: React.ComponentProps<typeof QuantitativosOutroOrgaoTab> = {
  itemKey: '00010/2025-200342-00007',
  tituloItem: 'Ata 00010/2025 · item 00007',
  papel: 'PARTICIPANTE',
  uasgGerenciadora: '200342',
  uasgSenasp: '200331',
  unidades: UNID_PART,
  loading: false,
  error: null,
  origem: 'API',
  copiadoEm: null,
  quantidadeSenasp: 2003,
  contratadoSenasp: 0,
  quantitativos: vazioDoItem(),
  adesoes: [],
  podeInformar: true,
  podeRemanejar: false,
  alocado: 2003,
  totalUnidadesInternas: 1,
  unidadesInternas: <div data-testid="unidades-internas-stub">CAEP</div>
};
const ADES_BASE: Partial<typeof base> = {
  itemKey: '00003/2025-200334-00002', papel: 'ADESAO', uasgGerenciadora: '200334', unidades: UNID_ADES,
  quantidadeSenasp: 5, contratadoSenasp: 1, alocado: 0, totalUnidadesInternas: 0, adesoes: ADESOES
};

const html = (over: Partial<typeof base> = {}) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <QuantitativosOutroOrgaoTab {...base} {...over} />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('QuantitativosOutroOrgaoTab — SENASP participante', () => {
  it('sem a ata assinada: o gestor da ata vê o botão de informar', () => {
    const h = html();
    expect(h).toContain('Não informado');
    expect(h).toContain('Informar qtd. da ata assinada');
    expect(h).toContain('gerenciadora UASG 200342');
    expect(h).toContain('Quantidade SENASP');
  });

  it('quem não informa lê quem informa', () => {
    const h = html({ podeInformar: false });
    expect(h).not.toContain('data-testid="informar-ata-assinada"');
    expect(h).toContain('Quem informa é o gestor da ata.');
  });

  it('a linha da SENASP vem primeiro, aberta com as unidades internas; os outros órgãos só com o registrado', () => {
    const h = html();
    expect(h.indexOf('SECRETARIA NACIONAL DE SEGURANCA PUBLICA')).toBeLessThan(h.indexOf('DIRETORIA DE TECNOLOGIA'));
    expect(h).toContain('data-testid="unidades-internas-stub"');
    expect(h).toContain('Limite da alocação: registrado da SENASP, 2.003');
    expect(h).toContain('4.325');
    expect(h).not.toContain('ainda não lido');
    expect(h).not.toContain('sem contratado');
    expect(h).not.toContain('data-testid="quantitativos-tabela-expand-200342"');
    expect(h).toContain('data-testid="quantitativos-tabela-expand-200331"');
  });

  it('informada maior que o registrado e mudou: remanejado a menos, com quem mudou no mesmo segundo', () => {
    const h = html({ quantitativos: informado(senasp({})) });
    expect(h).toContain('Remanejado · 397 a menos');
    expect(h).toContain('redução definitiva');
    expect(h).toContain('Qtd. na ata assinada');
    expect(h).toContain('2.400');
    expect(h).toContain('No mesmo segundo também mudou: <b>COORDENACAO-GERAL DE LOGISTICA E CONTRATOS/MJ</b>');
    expect(h).toContain('Corrigir qtd. da ata assinada');
    expect(h).not.toContain('data-testid="continua-senasp"');
  });

  it('gestor de saldo marca "continua da SENASP" no remanejado a menos', () => {
    expect(html({ quantitativos: informado(senasp({})), podeRemanejar: true, podeInformar: false })).toContain('data-testid="continua-senasp"');
  });

  it('sem mudança: gerenciado pela gerenciadora, no cartão e no saldo', () => {
    const h = html({ quantitativos: informado(senasp({ situacao: 'GERENCIADO', gerenciado: 397, mudou: false, mudouEm: null })) });
    expect(h).toContain('Gerenciado pela UASG 200342 · 397');
    expect(h).toContain('a SENASP pode pedir o remanejamento');
    expect(h).toContain('+ 397 na gerenciadora');
    expect(h).toContain('Para contratar acima do registrado, a SENASP pede o remanejamento à gerenciadora.');
  });

  it('igual à ata assinada: nada a pedir', () => {
    const h = html({ quantitativos: informado(senasp({ situacao: 'IGUAL', quantidadeAssinada: 2003, falta: 0, resto: 0 })) });
    expect(h).toContain('Igual à ata assinada');
    expect(h).toContain('nada a pedir à gerenciadora');
  });
});

describe('QuantitativosOutroOrgaoTab — SENASP em adesão', () => {
  it('nada a informar; a linha da SENASP vem das adesões aprovadas e abre as unidades internas', () => {
    const h = html(ADES_BASE);
    expect(h).toContain('A SENASP entrou nesta ata por adesão');
    expect(h).not.toContain('Informar qtd. da ata assinada');
    expect(h).toContain('Aprovado na adesão');
    expect(h).toContain('2 adesões aprovadas');
    expect(h).toContain('aprovado − contratado');
    expect(h).toContain('>Adesão<');
    expect(h).toContain('Adesões aprovadas da SENASP (2)');
    expect(h).toContain('data-testid="unidades-internas-stub"');
    expect(h).toContain('Limite da alocação: aprovado nas adesões, 5');
    expect(h).not.toContain('DEPEN');
  });

  it('adesão sem quantidade na fonte: aviso e botão de informar para o gestor da ata', () => {
    const h = html({ ...ADES_BASE, quantidadeSenasp: 1, adesoes: [ADESOES[1], adesao('2026-10-02T09:57:35', null)] });
    expect(h).toContain('O Compras.gov.br não trouxe a quantidade aprovada de uma adesão da SENASP');
    expect(h).toContain('conta 0 no saldo');
    expect(h).toContain('Informar qtd. aprovada da adesão');
    expect(h).toContain('Sem quantidade na fonte');
    expect(h).toContain('1 sem quantidade, contam 0');
  });

  it('adesão informada à mão mostra quem informou e permite corrigir', () => {
    const q: QuantitativosDoItem = {
      ...vazioDoItem(),
      adesoesInformadas: [{ uasg: '200331', aprovadaEm: '2026-10-02T09:57:35', quantidade: 4, documentoSei: '87654321', justificativa: null, informadoPorNome: 'Maria Souza', informadoEm: '2026-10-13T12:00:00Z' }]
    };
    const h = html({ ...ADES_BASE, quantitativos: q, adesoes: [ADESOES[1], adesao('2026-10-02T09:57:35', null)] });
    expect(h).toContain('Informada por <b>Maria Souza</b>');
    expect(h).toContain('data-testid="adesao-sei"');
    expect(h).toContain('87654321');
    expect(h).toContain('>Corrigir<');
    expect(h).not.toContain('Quantidade não informada');
  });
});
