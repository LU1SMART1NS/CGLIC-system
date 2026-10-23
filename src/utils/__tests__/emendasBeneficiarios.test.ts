import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

import { linkDoWhatsapp, pendenciasDoBeneficiario, type FormularioBeneficiario } from '../emendasBeneficiarios';
import { cnpjValido, consultarCep, consultarCnpj } from '../../services/emendasService';

const receita = { cnpj: '00394494000136', razaoSocial: 'MJSP' } as any;
const ok: FormularioBeneficiario = {
  nomeCurto: 'MJSP',
  entregaCep: '70064-900',
  entregaLogradouro: 'Esplanada dos Ministérios Bloco T',
  entregaNumero: 'S/N',
  entregaComplemento: '',
  entregaBairro: '',
  entregaMunicipio: 'Brasília',
  entregaUf: 'DF',
  responsavelNome: 'Fulano',
  responsavelCargo: '',
  responsavelTelefone: '(61) 99999-0000',
  responsavelEmail: 'fulano@mj.gov.br'
};

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

describe('pendenciasDoBeneficiario', () => {
  it('completo não tem pendência', () => {
    expect(pendenciasDoBeneficiario(receita, ok)).toEqual([]);
  });

  it('aponta o que falta, inclusive a busca na Receita', () => {
    expect(pendenciasDoBeneficiario(null, { ...ok, entregaNumero: '', entregaUf: 'XX', responsavelTelefone: '9999', responsavelEmail: 'fulano' })).toEqual([
      'busque o CNPJ na Receita',
      'número (use S/N se não houver)',
      'UF',
      'telefone com DDD (10 ou 11 números)',
      'e-mail válido'
    ]);
  });
});

describe('CNPJ e CEP', () => {
  it('confere os dígitos do CNPJ como o banco', () => {
    expect(cnpjValido('00.394.494/0001-36')).toBe(true);
    expect(cnpjValido('00.394.494/0001-37')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
  });

  it('lê a Receita pela BrasilAPI e monta a sede', async () => {
    const fetcher = vi.fn(async () =>
      json({ razao_social: 'MINISTERIO DA JUSTICA E SEGURANCA PUBLICA', natureza_juridica: 'Órgão Público do Poder Executivo Federal', ente_federativo_responsavel: 'UNIÃO', descricao_situacao_cadastral: 'ATIVA', descricao_tipo_de_logradouro: 'ESPLANADA', logradouro: 'ESPLANADA DOS MINISTERIOS BLOCO T', numero: 'S/N', complemento: 'ANDAR 4', bairro: 'ZONA CIVICO-ADMINISTRATIVA', municipio: 'BRASILIA', uf: 'DF', cep: '70064900', ddd_telefone_1: '6120253069' })
    ) as unknown as typeof fetch;
    const r = await consultarCnpj('00.394.494/0001-36', fetcher);
    expect(r).toMatchObject({ cnpj: '00394494000136', sedeMunicipio: 'Brasilia', sedeUf: 'DF', sedeCep: '70064900', sedeTelefone: '(61) 2025-3069' });
    expect(r.sedeEndereco).toBe('ESPLANADA DOS MINISTERIOS BLOCO T, S/N, ANDAR 4, ZONA CIVICO-ADMINISTRATIVA');
  });

  it('CNPJ inexistente vira frase para o usuário', async () => {
    const fetcher = vi.fn(async () => json({}, 404)) as unknown as typeof fetch;
    await expect(consultarCnpj('00394494000136', fetcher)).rejects.toThrow('CNPJ não encontrado na Receita.');
  });

  it('CEP: BrasilAPI e, se falhar, ViaCEP', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.includes('brasilapi') ? json({}, 500) : json({ logradouro: 'Rua Frei Caneca', bairro: 'Centro', localidade: 'Rio de Janeiro', uf: 'RJ' })
    ) as unknown as typeof fetch;
    expect(await consultarCep('20211-030', fetcher)).toEqual({ cep: '20211030', logradouro: 'Rua Frei Caneca', bairro: 'Centro', municipio: 'Rio de Janeiro', uf: 'RJ' });
  });
});

describe('linkDoWhatsapp', () => {
  it('celular vira link do wa.me com o 55; fixo e número incompleto não', () => {
    expect(linkDoWhatsapp('(61) 99999-0000')).toBe('https://wa.me/5561999990000');
    expect(linkDoWhatsapp('(61) 2025-3069')).toBeNull();
    expect(linkDoWhatsapp('99999-0000')).toBeNull();
    expect(linkDoWhatsapp(null)).toBeNull();
  });
});
