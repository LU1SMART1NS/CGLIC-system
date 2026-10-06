import { describe, it, expect } from 'vitest';
import { itensSeUmFornecedor } from '../api';

const item = (niFornecedor: string, numeroItem = '1', nomeRazaoSocialFornecedor = '') => ({ niFornecedor, numeroItem, nomeRazaoSocialFornecedor });

describe('itensSeUmFornecedor', () => {
  it('mantém os itens quando todos são do mesmo fornecedor', () => {
    const itens = [item('92249150000151', '1'), item('92249150000151', '2')];
    expect(itensSeUmFornecedor(itens)).toEqual(itens);
  });

  it('matriz e filial (mesma raiz de CNPJ) contam como um fornecedor', () => {
    const itens = [item('57494031000163', '1'), item('57494031001054', '81')];
    expect(itensSeUmFornecedor(itens)).toEqual(itens);
  });

  it('com mais de um fornecedor não escolhe nenhum: a compra tem várias atas', () => {
    expect(itensSeUmFornecedor([item('31884155000161', '4'), item('45296313000177', '6'), item('13992333000196', '9')])).toEqual([]);
  });

  it('fornecedor estrangeiro: compara pelo identificador, sem confundir com CNPJ', () => {
    expect(itensSeUmFornecedor([item('ESTRANG0000494', '2'), item('18685467000188', '5')])).toEqual([]);
    const mesmo = [item('ESTRANG0000494', '2'), item('ESTRANG0000494', '3')];
    expect(itensSeUmFornecedor(mesmo)).toEqual(mesmo);
  });

  it('sem identificador, compara pelo nome', () => {
    const itens = [item('', '1', 'ACME LTDA'), item('', '2', 'acme ltda')];
    expect(itensSeUmFornecedor(itens)).toEqual(itens);
    expect(itensSeUmFornecedor([item('', '1', 'ACME LTDA'), item('', '2', 'OUTRA LTDA')])).toEqual([]);
  });

  it('lista vazia continua vazia', () => {
    expect(itensSeUmFornecedor([])).toEqual([]);
  });
});
