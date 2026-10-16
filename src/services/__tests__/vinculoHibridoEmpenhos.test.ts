import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { avisoEmpenhosDescartados, mensagemParaRegistro } from '../contratoEmpenhosSincronizacaoService';
import { orchestrateContractEmpenhoSync } from '../empenhoOrchestrationService';
import * as contratosAdapter from '../../adapters/contratosGovEmpenhoAdapter';
import * as syncService from '../empenhoSyncService';

// O vínculo à mão saiu das telas (migration 117); a sincronização continua respeitando os descartes antigos.
describe('sincronização com empenho descartado', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('o resultado e a mensagem gravada dizem que a NE descartada continua fora', async () => {
    vi.spyOn(contratosAdapter, 'fetchAndNormalizeContratosGovEmpenhos').mockResolvedValue([
      { canonical_key: '200331-2024-2024NE765', uasg: '200331', ano: 2024, numero_oficial: '2024NE000765', numero_normalizado: '2024NE765', data_emissao: '2024-12-30', valor_empenhado: 567513.93, fonte_origem: 'CONTRATOSNET', contract_links: [{ contract_key: '200331-00145-2025', valor_vinculado: 567513.93 }] }
    ] as any);
    vi.spyOn(syncService, 'syncReconciledBatch').mockResolvedValue({
      total_processados: 1, total_salvos: 1, total_itens_vinculados: 0, total_contratos_vinculados: 0, total_conflitos: 0, erros: [], reconciliados: [], ids_por_chave: { '200331-2024-2024NE765': 'hpe' }
    } as any);
    vi.spyOn(syncService, 'syncContractEmpenhosM17').mockResolvedValue({
      inseridos: 0, atualizados: 0, removidos: 0, removidos_numeros: [], remocao_bloqueada: 0, ignorados_descartados: 1, ignorados_numeros: ['2024NE000765'], promovidos: 0
    });

    const r = await orchestrateContractEmpenhoSync({ tipo: 'CONTRATO', contractKey: '200331-00145-2025', contratoId: 748175, uasg: '200331' } as any);

    expect(r.vinculos_ignorados_numeros).toEqual(['2024NE000765']);
    expect(avisoEmpenhosDescartados(r)).toBe('O Contratos.gov.br lista 2024NE000765 neste contrato, mas a equipe a descartou; ela continua fora do contrato.');
    expect(mensagemParaRegistro(r)).toMatch(/a equipe a descartou/);
  });

  it('vários descartados: um aviso só, com a lista', () => {
    expect(avisoEmpenhosDescartados({ vinculos_ignorados_numeros: ['2024NE000765', '2024NE000766'] })).toMatch(/2 empenhos .*2024NE000765, 2024NE000766/);
    expect(avisoEmpenhosDescartados({ vinculos_ignorados_numeros: [] })).toBeUndefined();
  });
});
