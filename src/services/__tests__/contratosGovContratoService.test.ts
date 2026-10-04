import { describe, it, expect } from 'vitest';
import { uasgsCandidatasContratosGov, mesclarContratosGov } from '../contratosGovContratoService';
import { encontrarAssinaturaAta, montarConsultaAtaOficial } from '../ataOficialService';
import type { ContractDashboardRecord } from '../../types';

const base = {
  id: '200331-00140-2025',
  numero: '00140/2025',
  ano: '2025',
  numeroFormatado: '00140/2025',
  uasg: '200331',
  objeto: 'Apetrechos táticos',
  processo: '08106.001681/2024-32',
  fornecedorNome: 'LWS TENDAS IND. E COMERCIO LTDA',
  valorGlobal: 3800,
  dataVigenciaInicio: '2025-10-07T00:00:00',
  dataVigenciaFim: '2026-10-07T00:00:00',
  statusVigencia: 'Vigente',
  numeroControlePncp: '00394494000136-2-001665/2025',
  idCompra: '20033105900302024',
  fonteDados: 'Compras.gov.br',
  raw: { nomeCategoria: 'Compras', codigoUnidadeGestoraOrigemContrato: '200330', dataHoraInclusao: '2025-10-06T17:23:29' }
} as unknown as ContractDashboardRecord;

describe('uasgsCandidatasContratosGov', () => {
  it('começa pela UASG de origem do Compras.gov.br, depois a do registro e as da CGLIC, sem repetir', () => {
    expect(uasgsCandidatasContratosGov(base)).toEqual(['200330', '200331']);
  });

  it('sem UASG de origem no registro, tenta a do registro e as da CGLIC', () => {
    expect(uasgsCandidatasContratosGov({ uasg: '110099', raw: {} })).toEqual(['110099', '200330', '200331']);
  });

  it('lê a origem do formato do Contratos.gov.br', () => {
    const raw = { contratante: { orgao_origem: { unidade_gestora_origem: { codigo: '200330' } } } };
    expect(uasgsCandidatasContratosGov({ uasg: '200331', raw })[0]).toBe('200330');
  });
});

describe('mesclarContratosGov', () => {
  const gov = {
    id: 'OUTRA-CHAVE',
    numero: '00140/2025',
    uasg: '200330',
    objeto: '',
    processo: '08106.001681/2024-32',
    valorGlobal: 3800,
    valorInicial: 3800,
    dataAssinatura: '2025-10-06',
    contratoId: 670960,
    numeroControlePncp: undefined,
    fonteDados: 'Contratos.gov.br',
    sourceSystem: 'Contratos.gov.br',
    raw: { categoria: 'Compras', data_publicacao: null }
  } as unknown as ContractDashboardRecord;

  it('traz assinatura, id e valor inicial do Contratos.gov.br e mantém a identidade da base', () => {
    const r = mesclarContratosGov(base, gov);
    expect(r.id).toBe('200331-00140-2025');
    expect(r.uasg).toBe('200331');
    expect(r.contratoId).toBe(670960);
    expect(r.dataAssinatura).toBe('2025-10-06');
    expect(r.valorInicial).toBe(3800);
    expect(r.fonteDados).toBe('Contratos.gov.br');
  });

  it('o que o Contratos.gov.br não traz fica como na base (Id PNCP, compra, objeto)', () => {
    const r = mesclarContratosGov(base, gov);
    expect(r.numeroControlePncp).toBe('00394494000136-2-001665/2025');
    expect(r.idCompra).toBe('20033105900302024');
    expect(r.objeto).toBe('Apetrechos táticos');
  });

  it('junta os campos brutos das duas fontes', () => {
    const r = mesclarContratosGov(base, gov);
    expect(r.raw).toMatchObject({ categoria: 'Compras', nomeCategoria: 'Compras', codigoUnidadeGestoraOrigemContrato: '200330' });
  });

  it('valor 0 do Contratos.gov.br (campo vazio) não apaga o valor da base', () => {
    const r = mesclarContratosGov(base, { ...gov, valorGlobal: 0, valorInicial: 0 } as ContractDashboardRecord);
    expect(r.valorGlobal).toBe(3800);
  });
});

describe('assinatura da ata no Compras.gov.br', () => {
  it('consulta as atas da UASG que começam a vigir no mesmo dia', () => {
    const url = montarConsultaAtaOficial({ codigoUnidadeGerenciadora: '200331', dataVigenciaInicial: '2025-10-10T00:00:00' });
    expect(url).toContain('/api-arp/modulo-arp/1_consultarARP');
    expect(url).toContain('codigoUnidadeGerenciadora=200331');
    expect(url).toContain('dataVigenciaInicialMin=2025-10-10');
    expect(url).toContain('dataVigenciaInicialMax=2025-10-10');
  });

  it('sem início de vigência ou UASG, não há como consultar', () => {
    expect(montarConsultaAtaOficial({ codigoUnidadeGerenciadora: '200331', dataVigenciaInicial: '' })).toBeNull();
    expect(montarConsultaAtaOficial({ codigoUnidadeGerenciadora: '', dataVigenciaInicial: '2025-10-10' })).toBeNull();
  });

  const lista = [
    { numeroAtaRegistroPreco: '00059/2025', dataAssinatura: '2025-09-30', dataVigenciaInicial: '2025-10-10T00:00:00' },
    { numeroAtaRegistroPreco: '00060/2025', dataAssinatura: '2025-10-01' }
  ];

  it('acha a ata pelo número e devolve a assinatura, não o início da vigência', () => {
    expect(encontrarAssinaturaAta(lista, '00059/2025')).toEqual({ dataAssinatura: '2025-09-30' });
  });

  it('ata fora da lista, número repetido ou resposta sem lista: não adivinha', () => {
    expect(encontrarAssinaturaAta(lista, '00099/2025')).toBeNull();
    expect(encontrarAssinaturaAta([...lista, lista[0]], '00059/2025')).toBeNull();
    expect(encontrarAssinaturaAta(undefined, '00059/2025')).toBeNull();
  });
});
