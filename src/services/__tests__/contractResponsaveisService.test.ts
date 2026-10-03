import { describe, it, expect } from 'vitest';
import type { ContratosGovGarantiaRecord, ContratosGovResponsavelRecord } from '../../types/contractResponsaveis';
import {
  contratosGovId,
  fiscaisAtivos,
  garantiaAviso,
  garantiaMaisLonga,
  parseResponsavelNome
} from '../contractResponsaveisService';

/**
 * Estrutura do /responsaveis de um contrato real (00009/2024): gestor e substituto ativos, fiscal técnico
 * anterior (inativo) e o atual (ativo), cada um com o seu substituto. Os nomes aqui são fictícios.
 */
const RESPONSAVEIS: ContratosGovResponsavelRecord[] = [
  { id: 1, usuario: '***.111.111-** - ANA GESTORA', funcao_id: 'Gestor', situacao: 'Ativo', data_inicio: '2024-09-17', data_fim: null, portaria: '96-2024' },
  { id: 2, usuario: '***.222.222-** - BRUNO SUBSTITUTO', funcao_id: 'Gestor Substituto', situacao: 'Ativo', data_inicio: '2024-09-17', data_fim: null },
  { id: 3, usuario: '***.333.333-** - CARLOS ANTIGO', funcao_id: 'Fiscal Técnico', situacao: 'Inativo', data_inicio: '2025-03-05', data_fim: '2026-06-28' },
  { id: 4, usuario: '***.444.444-** - DIANA ANTIGA', funcao_id: 'Fiscal Técnico Substituto', situacao: 'Inativo', data_inicio: '2025-03-05', data_fim: '2026-06-28' },
  { id: 5, usuario: '***.555.555-** - ELIANA FISCAL', funcao_id: 'Fiscal Técnico', situacao: 'Ativo', data_inicio: '2026-06-29', data_fim: null },
  { id: 6, usuario: '***.666.666-** - FABIO SUPLENTE', funcao_id: 'Fiscal Técnico Substituto', situacao: 'Ativo', data_inicio: '2026-06-29', data_fim: null }
];

const GARANTIAS: ContratosGovGarantiaRecord[] = [
  { id: 10, tipo: 'Depósito Caução', valor: '16.518,66', vencimento: '2029-11-22' },
  { id: 11, tipo: 'Fiança Bancária', valor: '66.074,64', vencimento: '2024-11-19' }
];

describe('parseResponsavelNome', () => {
  it('tira o CPF mascarado e fica só com o nome', () => {
    expect(parseResponsavelNome('***.550.961-** - MARIA DA SILVA')).toBe('MARIA DA SILVA');
    expect(parseResponsavelNome('MARIA DA SILVA')).toBe('MARIA DA SILVA');
    expect(parseResponsavelNome('***.550.961-** - ANA-LUCIA SOUZA')).toBe('ANA-LUCIA SOUZA');
    expect(parseResponsavelNome(null)).toBe('');
    expect(parseResponsavelNome(undefined)).toBe('');
  });
});

describe('fiscaisAtivos', () => {
  const hoje = '2026-10-02';

  it('traz só os fiscais com designação ativa, sem gestor nem inativos', () => {
    expect(fiscaisAtivos(RESPONSAVEIS, hoje)).toEqual([
      { label: 'Fiscal técnico', nomes: ['ELIANA FISCAL'] },
      { label: 'Fiscal técnico substituto', nomes: ['FABIO SUPLENTE'] }
    ]);
  });

  it('não mostra o CPF', () => {
    expect(JSON.stringify(fiscaisAtivos(RESPONSAVEIS, hoje))).not.toMatch(/\*\*\*|\d{3}\.\d{3}/);
  });

  it('designação com fim já passado não conta, mesmo marcada como ativa', () => {
    const rows = [{ id: 1, usuario: '***.1** - GUSTAVO', funcao_id: 'Fiscal Técnico', situacao: 'Ativo', data_fim: '2026-09-30' }];
    expect(fiscaisAtivos(rows, hoje)).toEqual([]);
    expect(fiscaisAtivos([{ ...rows[0], data_fim: '2026-10-02' }], hoje)).toHaveLength(1);
  });

  it('agrupa mais de uma pessoa na mesma função e não repete o nome', () => {
    const rows: ContratosGovResponsavelRecord[] = [
      { id: 1, usuario: '***.1** - HELENA', funcao_id: 'Fiscal Técnico', situacao: 'Ativo' },
      { id: 2, usuario: '***.2** - IGOR', funcao_id: 'Fiscal Técnico', situacao: 'Ativo' },
      { id: 3, usuario: '***.1** - HELENA', funcao_id: 'Fiscal Técnico', situacao: 'Ativo' }
    ];
    expect(fiscaisAtivos(rows, hoje)).toEqual([{ label: 'Fiscal técnico', nomes: ['HELENA', 'IGOR'] }]);
  });

  it('mostra outras funções de fiscal na ordem técnico, administrativo, setorial', () => {
    const rows: ContratosGovResponsavelRecord[] = [
      { id: 1, usuario: '***.1** - JOANA', funcao_id: 'Fiscal Setorial', situacao: 'Ativo' },
      { id: 2, usuario: '***.2** - KLEBER', funcao_id: 'Fiscal Administrativo', situacao: 'Ativo' },
      { id: 3, usuario: '***.3** - LUCIA', funcao_id: 'Fiscal Técnico', situacao: 'Ativo' }
    ];
    expect(fiscaisAtivos(rows, hoje).map((g) => g.label)).toEqual(['Fiscal técnico', 'Fiscal administrativo', 'Fiscal setorial']);
  });

  it('lista vazia ou inválida não gera fiscal', () => {
    expect(fiscaisAtivos([], hoje)).toEqual([]);
    expect(fiscaisAtivos(undefined, hoje)).toEqual([]);
  });
});

describe('garantiaMaisLonga e garantiaAviso', () => {
  it('escolhe a de vencimento mais longo e guarda todas em ordem', () => {
    const g = garantiaMaisLonga(GARANTIAS)!;
    expect(g.principal).toEqual({ tipo: 'Depósito Caução', valor: 16518.66, vencimento: '2029-11-22' });
    expect(g.todas.map((x) => x.vencimento)).toEqual(['2029-11-22', '2024-11-19']);
  });

  it('lista vazia não vira garantia: não diz se o contrato exige', () => {
    expect(garantiaMaisLonga([])).toBeNull();
    expect(garantiaMaisLonga(undefined)).toBeNull();
    expect(garantiaMaisLonga([{ id: 1, tipo: 'Seguro', valor: '1,00', vencimento: null }])).toBeNull();
  });

  it('sem aviso quando a garantia cobre a vigência', () => {
    expect(garantiaAviso(garantiaMaisLonga(GARANTIAS), '2029-08-22', '2026-10-02')).toBeUndefined();
  });

  it('avisa quando vence antes do fim da vigência', () => {
    expect(garantiaAviso(garantiaMaisLonga(GARANTIAS), '2030-01-01', '2026-10-02')).toBe('vence antes do fim da vigência');
  });

  it('avisa quando a garantia mais longa já venceu', () => {
    expect(garantiaAviso(garantiaMaisLonga([GARANTIAS[1]]), '2029-08-22', '2026-10-02')).toBe('vencida');
  });

  it('sem garantia, sem aviso', () => {
    expect(garantiaAviso(null, '2029-08-22')).toBeUndefined();
  });
});

describe('contratosGovId', () => {
  it('só há o que consultar para contrato do Contratos.gov.br com id', () => {
    expect(contratosGovId({ contratoId: 299693, fonteDados: 'Contratos.gov.br' })).toBe(299693);
    expect(contratosGovId({ contratoId: '12', fonteDados: 'Contratos.gov.br' })).toBe('12');
    expect(contratosGovId({ contratoId: 299693, fonteDados: 'Compras.gov.br' })).toBeUndefined();
    expect(contratosGovId({ contratoId: undefined, fonteDados: 'Contratos.gov.br' })).toBeUndefined();
    expect(contratosGovId({ contratoId: '', fonteDados: 'Contratos.gov.br' })).toBeUndefined();
    expect(contratosGovId(null)).toBeUndefined();
  });
});
