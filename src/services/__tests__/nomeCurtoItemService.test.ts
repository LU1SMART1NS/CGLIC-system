import { describe, it, expect, vi } from 'vitest';

const respostas: Record<string, { data: unknown; error: unknown }> = {};
vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (tabela: string) => ({ select: () => ({ not: async () => respostas[tabela] }) })
  }
}));
import { fetchNomesCurtosItens } from '../nomeCurtoItemService';

describe('fetchNomesCurtosItens', () => {
  it('usa o nome da CAEP primeiro e, sem ele, o nome da ata assinada', async () => {
    respostas.emenda_itens_dados = { data: [{ item_key: 'A-1', nome_curto: 'Computador de Mergulho' }], error: null };
    respostas.itens_nome_na_ata = {
      data: [
        { item_key: 'A-1', nome: 'Computador de mergulho autônomo' },
        { item_key: 'A-2', nome: 'Bússola submersível' }
      ],
      error: null
    };
    const nomes = await fetchNomesCurtosItens();
    expect(nomes.get('A-1')).toBe('Computador de Mergulho');
    expect(nomes.get('A-2')).toBe('Bússola submersível');
  });

  it('segue só com a CAEP enquanto a tabela da ata não existe', async () => {
    respostas.emenda_itens_dados = { data: [{ item_key: 'A-1', nome_curto: 'Capa de chuva' }], error: null };
    respostas.itens_nome_na_ata = { data: null, error: { code: 'PGRST205' } };
    const nomes = await fetchNomesCurtosItens();
    expect([...nomes]).toEqual([['A-1', 'Capa de chuva']]);
  });

  it('outra falha de leitura vai para a faixa "não carregou"', async () => {
    respostas.itens_nome_na_ata = { data: null, error: { code: '500', message: 'falhou' } };
    await expect(fetchNomesCurtosItens()).rejects.toBeTruthy();
  });
});
