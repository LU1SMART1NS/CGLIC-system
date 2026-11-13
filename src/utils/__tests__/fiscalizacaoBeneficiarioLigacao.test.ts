import { describe, it, expect, vi } from 'vitest';
import type { EntregaFiscalizacao } from '../../services/fiscalizacaoService';
import { linhaParaEntrega } from '../../services/fiscalizacaoService';
import type { BeneficiarioEmenda } from '../../services/emendasService';
import { escolhaInicial, gruposSemCadastro, nomeParaCadastro, semUfNoFim, sugestoesDoCadastro } from '../fiscalizacaoBeneficiarioLigacao';
import { linhaDeCadastro } from '../fiscalizacaoMesa';

const base = linhaParaEntrega({ id: 'e1', contract_key: '200331-00030-2025', contrato_numero: '00030/2025', quantidade: 1, origem: 'CARGA', responsavel: 'SFC', etapa: 'ORDEM', fiscalizacao: 'SFC' });
const e = (p: Partial<EntregaFiscalizacao>): EntregaFiscalizacao => ({ ...base, ...p });
const ben = (id: string, nome: string, uf: string, p: Partial<BeneficiarioEmenda> = {}): BeneficiarioEmenda =>
  ({ id, nome, sigla: null, razaoSocial: null, outrosNomes: [], ativo: true, entregaUf: uf, entregaMunicipio: null, ...p }) as BeneficiarioEmenda;

const CADASTRO = [
  ben('pcdf', 'Polícia Civil do Distrito Federal', 'DF', { sigla: 'PCDF' }),
  ben('pmdf', 'Polícia Militar do Distrito Federal', 'DF', { sigla: 'PMDF' }),
  ben('sepm', 'Secretaria de Estado de Polícia Militar do Rio de Janeiro', 'RJ', { outrosNomes: ['Secretaria de Estado de Polícia Militar-RJ'] }),
  ben('pmmg', 'Polícia Militar de Minas Gerais', 'MG', { sigla: 'PMMG', entregaMunicipio: 'Belo Horizonte' }),
  ben('63bpm', '63º Batalhão de Polícia Militar', 'MG', { sigla: '63º BPM', entregaMunicipio: 'Formiga' }),
  ben('pcmg', 'Polícia Civil de Minas Gerais', 'MG', { sigla: 'PCMG' }),
  ben('inativo', 'Polícia Civil do Distrito Federal (antigo)', 'DF', { ativo: false, outrosNomes: ['Polícia Civil - DF'] })
];

describe('nome escrito na planilha', () => {
  it('tira a UF do fim e normaliza', () => {
    expect(semUfNoFim('Polícia Civil - DF')).toBe('policia civil');
    expect(semUfNoFim('Guarda Municipal de Goiânia')).toBe('guarda municipal de goiania');
    expect(nomeParaCadastro('Guarda Municipal de Jandira - SP')).toBe('Guarda Municipal de Jandira');
    expect(nomeParaCadastro('Polícia Militar - MG (Cidade de Formiga)')).toBe('Polícia Militar - MG (Cidade de Formiga)');
  });

  it('agrupa grafias do mesmo nome na mesma UF; ignora os já ligados; maiores primeiro', () => {
    const gs = gruposSemCadastro([
      e({ id: 'a', beneficiarioTexto: 'Guarda Municipal de Goiânia - GO', uf: 'GO' }),
      e({ id: 'b', beneficiarioTexto: 'GUARDA MUNICIPAL DE GOIANIA', uf: 'GO' }),
      e({ id: 'c', beneficiarioTexto: 'Polícia Civil - DF', uf: 'DF' }),
      e({ id: 'd', beneficiarioTexto: 'Polícia Civil - DF', uf: 'DF', beneficiarioId: 'pcdf' }),
      e({ id: 'x', beneficiarioTexto: null, uf: 'DF' })
    ]);
    expect(gs.map((g) => g.es.map((x) => x.id))).toEqual([['a', 'b'], ['c']]);
  });
});

describe('sugestões do cadastro', () => {
  it('outra grafia igual: "Mesmo nome" e já escolhido', () => {
    const s = sugestoesDoCadastro('Secretaria de Estado de Polícia Militar-RJ', 'RJ', CADASTRO);
    expect(s[0]).toMatchObject({ igual: true });
    expect(escolhaInicial(s)).toBe('sepm');
  });

  it('parecido nunca vem escolhido; inativo e outra UF ficam de fora', () => {
    const s = sugestoesDoCadastro('Polícia Civil - DF', 'DF', CADASTRO);
    expect(s.map((x) => x.b.id)).toEqual(['pcdf']);
    expect(s[0].igual).toBe(false);
    expect(escolhaInicial(s)).toBeNull();
  });

  it('unidade com a cidade no nome: a unidade da cidade primeiro, depois o órgão; Polícia Civil não entra', () => {
    const s = sugestoesDoCadastro('Polícia Militar - MG (Cidade de Formiga)', 'MG', CADASTRO);
    expect(s.map((x) => x.b.id)).toEqual(['63bpm', 'pmmg']);
  });

  it('sem nada parecido: lista vazia', () => {
    expect(sugestoesDoCadastro('Guarda Municipal de Jandira - SP', 'SP', CADASTRO)).toEqual([]);
  });
});

describe('passo da mesa', () => {
  it('com nomes fora do cadastro: com o fiscal, uma ação', () => {
    const ligar = vi.fn();
    const l = linhaDeCadastro([e({ id: 'a', beneficiarioTexto: 'Polícia Civil - DF', uf: 'DF' }), e({ id: 'b', beneficiarioTexto: 'PCDF', uf: 'DF' })], ligar);
    expect(l).toMatchObject({ tom: 'eu', titulo: 'Ligar ao cadastro de beneficiários · 2 itens', detalhe: '2 nomes sem cadastro · sem endereço de entrega até ligar' });
    l?.acoes[0].faz();
    expect(ligar).toHaveBeenCalled();
  });
  it('tudo no cadastro: sem passo', () => {
    expect(linhaDeCadastro([e({ beneficiarioId: 'pcdf', beneficiarioTexto: 'x' })], vi.fn())).toBeNull();
  });
});
