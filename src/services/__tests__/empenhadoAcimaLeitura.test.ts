import { describe, it, expect, vi, beforeEach } from 'vitest';

// Banco simulado: a view sem as colunas do período (migration 137 ainda não aplicada) na 1ª leitura.
const chamadas: string[] = [];
vi.mock('../supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      select: (colunas: string) => {
        chamadas.push(colunas);
        if (colunas.includes('periodo_inicio')) {
          return Promise.resolve({ data: null, error: { code: '42703', message: 'column v_contrato_itens_empenhado_acima.periodo_inicio does not exist' } });
        }
        return Promise.resolve({
          data: [{ contract_key: '200331-00119-2025', numero_item: 1, quantidade_contratada: 12, quantidade_empenhada: 24, quantidade_acima: 12, notas: 2 }],
          error: null
        });
      }
    })
  }
}));

import { fetchEmpenhadoAcima } from '../empenhadoAcimaService';

describe('leitura do empenhado acima do contratado', () => {
  beforeEach(() => {
    chamadas.length = 0;
  });

  it('sem a migration 137, lê de novo sem o período', async () => {
    const linhas = await fetchEmpenhadoAcima();
    expect(chamadas).toHaveLength(2);
    expect(chamadas[1]).not.toContain('periodo_');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ quantidadeAcima: 12, periodoInicio: null, periodoFim: null });
  });
});
