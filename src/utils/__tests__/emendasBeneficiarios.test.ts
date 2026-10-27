import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/supabaseClient', () => ({ supabase: null }));

import {
  beneficiarioRepetido,
  casaBusca,
  chaveDaIdentidade,
  chaveDoNome,
  daUfDoParlamentar,
  faltasDoBeneficiario,
  linkDoWhatsapp,
  naturezaNaoPublica,
  paresParecidos,
  parecidosCom,
  pendenciasDoBeneficiario,
  saoParecidos,
  textoDeBuscaDoBeneficiario,
  type FormularioBeneficiario
} from '../emendasBeneficiarios';
import { cnpjValido, consultarCep, consultarCnpj, localDoBeneficiario, rotuloBeneficiario, type BeneficiarioEmenda } from '../../services/emendasService';

const ok: FormularioBeneficiario = {
  nome: 'MJSP',
  sigla: '',
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
const vazio: FormularioBeneficiario = Object.fromEntries(Object.keys(ok).map((k) => [k, ''])) as unknown as FormularioBeneficiario;

const ben = (id: string, nome: string, municipio: string | null, uf: string | null, extra: Partial<BeneficiarioEmenda> = {}): BeneficiarioEmenda =>
  ({ id, nome, nomeCurto: null, entregaMunicipio: municipio, entregaUf: uf, outrosNomes: [], ativo: true, cnpj: null, entregaCep: null, entregaLogradouro: null, responsavelNome: null, ...extra }) as BeneficiarioEmenda;

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });

describe('pendenciasDoBeneficiario', () => {
  it('completo não tem pendência', () => {
    expect(pendenciasDoBeneficiario(ok)).toEqual([]);
  });

  it('só o nome e a UF são obrigatórios', () => {
    expect(pendenciasDoBeneficiario({ ...vazio, nome: 'Polícia Civil', entregaUf: 'BA' })).toEqual([]);
    expect(pendenciasDoBeneficiario({ ...vazio, nome: 'Polícia Civil' })).toEqual(['UF']);
    expect(pendenciasDoBeneficiario({ ...vazio, nome: 'Polícia Civil', entregaUf: '  ' })).toEqual(['UF']);
    expect(pendenciasDoBeneficiario(vazio)).toEqual(['nome da unidade', 'UF']);
    expect(pendenciasDoBeneficiario({ ...vazio, nome: ' - ', entregaUf: 'BA' })).toEqual(['nome da unidade']);
  });

  it('o que vier preenchido vem certo', () => {
    expect(pendenciasDoBeneficiario({ ...ok, entregaCep: '7006', entregaUf: 'XX', responsavelTelefone: '9999', responsavelEmail: 'fulano' })).toEqual([
      'CEP com 8 números',
      'UF válida',
      'telefone com DDD (10 ou 11 números)',
      'e-mail válido'
    ]);
  });
});

describe('daUfDoParlamentar', () => {
  it('só os órgãos da UF do parlamentar; sem UF de um dos lados, entra', () => {
    expect(daUfDoParlamentar(ben('1', 'PM', 'Salvador', 'BA'), 'BA')).toBe(true);
    expect(daUfDoParlamentar(ben('1', 'PM', 'São Paulo', 'SP'), 'BA')).toBe(false);
    expect(daUfDoParlamentar(ben('1', 'PM', null, null), 'BA')).toBe(true);
    expect(daUfDoParlamentar(ben('1', 'PM', 'São Paulo', 'SP'), null)).toBe(true);
  });
});

describe('naturezaNaoPublica', () => {
  it('avisa associação e empresa, não órgão público', () => {
    expect(naturezaNaoPublica('Associação Privada')).toBe(true);
    expect(naturezaNaoPublica('Sociedade Empresária Limitada')).toBe(true);
    expect(naturezaNaoPublica('Órgão Público do Poder Executivo Estadual ou do Distrito Federal')).toBe(false);
    expect(naturezaNaoPublica('Município')).toBe(false);
    expect(naturezaNaoPublica('Autarquia Estadual ou do Distrito Federal')).toBe(false);
    expect(naturezaNaoPublica(null)).toBe(false);
  });
});

describe('faltasDoBeneficiario', () => {
  it('aponta CNPJ, endereço e contato que faltam', () => {
    expect(faltasDoBeneficiario(ben('1', 'X', 'Limeira', 'SP'))).toEqual(['CNPJ', 'endereço', 'contato']);
    expect(faltasDoBeneficiario(ben('1', 'X', null, null, { cnpj: '00394494000136', entregaCep: '70064900', entregaLogradouro: 'Rua', responsavelNome: 'Fulano' }))).toEqual([]);
  });
});

describe('chave do nome', () => {
  it('é a mesma conta do banco (chave_nome_beneficiario)', () => {
    // Saída do banco no ensaio: 'policia militar estado sao paulo 4o batalhao policiamento choque 4o bpchq'
    expect(chaveDoNome('Polícia Militar do Estado de São Paulo 4º Batalhão de Policiamento de Choque - 4ºBPChq')).toBe('policia militar estado sao paulo 4o batalhao policiamento choque 4o bpchq');
    expect(chaveDoNome('Secretaria de Estado da Polícia Militar-RJ')).toBe(chaveDoNome('Secretaria de Estado de Polícia Militar - RJ'));
    expect(chaveDoNome('13° Grupamento')).toBe(chaveDoNome('13º Grupamento'));
  });

  it('identidade = nome + cidade + UF, igual à grafia da planilha', () => {
    expect(chaveDaIdentidade('Corpo de Bombeiros Militar do Estado de São Paulo 16° Grupamento', 'Limeira', 'SP')).toBe(
      chaveDoNome('Corpo de Bombeiros Militar do Estado de São Paulo 16º Grupamento (Cidade de Limeira - SP)')
    );
  });
});

describe('repetidos e parecidos', () => {
  const lista = [
    ben('a', 'Polícia Militar do Estado de São Paulo BPM', 'Mairinque', 'SP'),
    ben('b', 'Polícia Militar do Estado de São Paulo BPM', 'Colômbia', 'SP'),
    ben('c', 'Polícia Militar do Estado de São Paulo', 'Mairinque', 'SP'),
    ben('d', 'Polícia Militar - SP 5º Batalhão de Polícia Militar Metropolitano', 'São Paulo', 'SP'),
    ben('e', 'Polícia Militar - SP 9º Batalhão de Polícia Militar Metropolitano', 'São Paulo', 'SP'),
    ben('f', 'Corpo de Bombeiros Militar', null, 'BA'),
    ben('g', 'Corpo de Bombeiros Militar', null, 'PA'),
    ben('h', 'Guarda Municipal de Teste', null, 'SP', { outrosNomes: ['Guarda Municipal de Teste (Cidade de Itu - SP)'] })
  ];

  it('mesmo nome na mesma cidade é repetido; em outra cidade, não', () => {
    expect(beneficiarioRepetido(lista, 'POLICIA MILITAR DO ESTADO DE SAO PAULO - BPM', 'Mairinque', 'sp')?.id).toBe('a');
    expect(beneficiarioRepetido(lista, 'Polícia Militar do Estado de São Paulo BPM', 'Itu', 'SP')).toBeUndefined();
    expect(beneficiarioRepetido(lista, 'Polícia Militar do Estado de São Paulo BPM', 'Mairinque', 'SP', 'a')).toBeUndefined();
  });

  it('grafia guardada também conta como repetido', () => {
    expect(beneficiarioRepetido(lista, 'Guarda Municipal de Teste', 'Itu', 'SP')?.id).toBe('h');
  });

  it('parecido: mesmos números, mesmo lugar, mais de 3/4 das palavras', () => {
    expect(saoParecidos(lista[0], lista[2])).toBe(true);
    expect(saoParecidos(lista[0], lista[1])).toBe(false); // cidades diferentes
    expect(saoParecidos(lista[3], lista[4])).toBe(false); // 5º e 9º
    expect(saoParecidos(lista[5], lista[6])).toBe(false); // UFs diferentes
    expect(saoParecidos(lista[5], ben('z', 'Corpo de Bombeiros Militar de Alagoas', null, null))).toBe(false); // 3 de 4 palavras não basta
  });

  it('pares sem os marcados como diferentes', () => {
    expect(paresParecidos(lista, []).map(([x, y]) => x.id + y.id)).toEqual(['ac']);
    expect(paresParecidos(lista, [{ aId: 'a', bId: 'c' }])).toEqual([]);
    expect(paresParecidos(lista.map((b) => (b.id === 'c' ? { ...b, ativo: false } : b)), [])).toEqual([]);
  });

  it('parecidos com o nome digitado', () => {
    expect(parecidosCom(lista, 'Polícia Militar do Estado de São Paulo BPM', 'Mairinque', 'SP').map((b) => b.id)).toEqual(['a', 'c']);
    expect(parecidosCom(lista, 'PM', '', '')).toEqual([]);
  });

  it('rótulo e local', () => {
    expect(rotuloBeneficiario({ nome: '14º GB Adamantina' })).toBe('14º GB Adamantina');
    expect(localDoBeneficiario({ entregaMunicipio: 'Limeira', entregaUf: 'SP' })).toBe('Limeira - SP');
    expect(localDoBeneficiario({ entregaMunicipio: null, entregaUf: 'RJ' })).toBe('RJ');
    expect(localDoBeneficiario({ entregaMunicipio: null, entregaUf: null })).toBeNull();
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

describe('busca de beneficiários', () => {
  const cbmma = ben('1', 'Corpo de Bombeiros Militar do Maranhão', 'São Luís', 'MA', {
    sigla: 'CBMMA',
    razaoSocial: 'ESTADO DO MARANHAO - CORPO DE BOMBEIROS MILITARES DO MARANHAO'
  });
  const generico = ben('2', 'Corpo de Bombeiros Militar', null, 'AL', { sigla: 'CBMAL' });
  const texto = (b: BeneficiarioEmenda) => textoDeBuscaDoBeneficiario(b);

  it('acha pelo começo do nome, sem acento e sem maiúsculas', () => {
    expect(casaBusca(texto(cbmma), 'Corpo de Bomb')).toBe(true);
    expect(casaBusca(texto(cbmma), 'corpo de bombeiros militar do maranhao')).toBe(true);
  });

  it('acha com as palavras em qualquer ordem e com "do Estado do"', () => {
    expect(casaBusca(texto(cbmma), 'bombeiros maranhão')).toBe(true);
    expect(casaBusca(texto(cbmma), 'Corpo de Bombeiros Militar do Estado do Maranhão')).toBe(true);
  });

  it('acha pelo estado por extenso quando o nome só tem a UF', () => {
    expect(casaBusca(texto(generico), 'bombeiros alagoas')).toBe(true);
    expect(casaBusca(texto(generico), 'bombeiros maranhao')).toBe(false);
  });

  it('acha pela sigla e pela cidade; palavra que não existe derruba', () => {
    expect(casaBusca(texto(cbmma), 'cbmma')).toBe(true);
    expect(casaBusca(texto(cbmma), 'sao luis')).toBe(true);
    expect(casaBusca(texto(cbmma), 'bombeiros piaui')).toBe(false);
  });

  it('busca vazia ou só com "de/do" acha todos', () => {
    expect(casaBusca(texto(cbmma), '  ')).toBe(true);
    expect(casaBusca(texto(cbmma), 'do')).toBe(true);
  });

  it('número ordinal: "16º" e "16" acham "16º Grupamento"', () => {
    const gb = ben('3', '16º Grupamento de Bombeiro Militar', 'Limeira', 'SP');
    expect(casaBusca(texto(gb), '16º grupamento')).toBe(true);
    expect(casaBusca(texto(gb), '16 limeira')).toBe(true);
  });
});
