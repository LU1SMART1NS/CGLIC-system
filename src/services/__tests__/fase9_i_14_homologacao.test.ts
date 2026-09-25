import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { calculateFinancialSummary } from '../dashboardService';

const SUPABASE_URL = 'https://bouutpmxexvwppcmmhdi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5nqKXMxqJnldoT4Wy5w-gg_T85JiyuT';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Detecta se há conectividade de rede externa
async function isNetworkAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: controller.signal
    });
    clearTimeout(timeout);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

describe('FASE 9-I.14 — Homologação Funcional dos Dados Reais de Empenhos', () => {
  it('1. Deve validar que a base remota possui exatamente 2.416 empenhos e 2.432 vínculos', async (ctx) => {
    if (!(await isNetworkAvailable())) {
      ctx.skip();
      return;
    }
    const { count: empenhosCount, error: empErr } = await supabase
      .from('empenhos')
      .select('*', { count: 'exact', head: true });
    expect(empErr).toBeNull();
    expect(empenhosCount).toBe(2416);

    const { count: linksCount, error: linkErr } = await supabase
      .from('contrato_empenhos')
      .select('*', { count: 'exact', head: true });
    expect(linkErr).toBeNull();
    expect(linksCount).toBe(2432);

    const { count: arpEmpenhosCount, error: arpErr } = await supabase
      .from('arp_item_empenhos')
      .select('*', { count: 'exact', head: true });
    expect(arpErr).toBeNull();
    expect(arpEmpenhosCount).toBe(0);
  });

  it('2. Deve validar o cálculo dos KPIs financeiros oficiais sem Double Counting', async (ctx) => {
    if (!(await isNetworkAvailable())) {
      ctx.skip();
      return;
    }
    // Busca paginada em v_empenhos_resumo
    const allEmpenhos: any[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('v_empenhos_resumo')
        .select('*')
        .range(from, from + pageSize - 1);
      expect(error).toBeNull();
      if (!data || data.length === 0) break;
      allEmpenhos.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    expect(allEmpenhos.length).toBe(2416);

    const summary = calculateFinancialSummary(allEmpenhos);

    // Validação matemática soberana
    expect(summary.totalEmpenhado).toBe(2520533522.34);
    expect(summary.totalLiquidado).toBe(3283600.34);
    expect(summary.totalPago).toBe(370768095.78);
    expect(summary.saldoALiquidar).toBe(2517249922.00);
    expect(summary.saldoAPagar).toBe(0.00);
    expect(summary.saldoNaoExecutado).toBe(2149765426.56);
    expect(summary.totalRpInscrito).toBe(1773855311.78);
    expect(summary.totalRpPago).toBe(0.00);
    expect(summary.saldoRpPendente).toBe(1773855311.78);

    // Fórmulas de consistência
    expect(summary.saldoALiquidar).toBeCloseTo(Math.max(0, summary.totalEmpenhado - summary.totalLiquidado), 2);
    expect(summary.saldoAPagar).toBeCloseTo(Math.max(0, summary.totalLiquidado - summary.totalPago), 2);
    expect(summary.saldoNaoExecutado).toBeCloseTo(Math.max(0, summary.totalEmpenhado - summary.totalPago), 2);
    expect(summary.saldoRpPendente).toBeCloseTo(Math.max(0, summary.totalRpInscrito - summary.totalRpPago), 2);
  });

  it('3. Deve validar os 5 cenários representativos de contratos no read model', async (ctx) => {
    if (!(await isNetworkAvailable())) {
      ctx.skip();
      return;
    }
    // Busca links paginados
    const linksByContract = new Map<string, string[]>();
    let linkFrom = 0;
    const pageSize = 1000;

    while (true) {
      const { data: links, error } = await supabase
        .from('contrato_empenhos')
        .select('empenho_id, contract_key')
        .range(linkFrom, linkFrom + pageSize - 1);
      expect(error).toBeNull();
      if (!links || links.length === 0) break;
      for (const l of links) {
        if (!linksByContract.has(l.contract_key)) {
          linksByContract.set(l.contract_key, []);
        }
        linksByContract.get(l.contract_key)!.push(l.empenho_id);
      }
      if (links.length < pageSize) break;
      linkFrom += pageSize;
    }

    // (A) Simples (1 empenho): 200331-00132-2024
    const cSimples = linksByContract.get('200331-00132-2024');
    expect(cSimples).toBeDefined();
    expect(cSimples!.length).toBe(1);

    // (B) Multi-empenho: 200331-00051-2023 (89 NEs)
    const cMulti = linksByContract.get('200331-00051-2023');
    expect(cMulti).toBeDefined();
    expect(cMulti!.length).toBe(89);

    // (C) Cross-UASG: 200331-00008-2026
    const cCross = linksByContract.get('200331-00008-2026');
    expect(cCross).toBeDefined();
    expect(cCross!.length).toBeGreaterThan(0);

    // (D) RP/exercício anterior: 200331-00005-2019
    const cRp = linksByContract.get('200331-00005-2019');
    expect(cRp).toBeDefined();
    expect(cRp!.length).toBeGreaterThan(0);

    // (E) N:N compartilhado: 200331-00065-2021 e 200331-00025-2024
    const cNn1 = linksByContract.get('200331-00065-2021');
    const cNn2 = linksByContract.get('200331-00025-2024');
    expect(cNn1).toBeDefined();
    expect(cNn2).toBeDefined();
    // Devem compartilhar ao menos 1 empenho
    const intersection = cNn1!.filter(id => cNn2!.includes(id));
    expect(intersection.length).toBeGreaterThan(0);
  });

  it('4. Deve validar a blindagem contra Double Counting na cardinalidade N:N', () => {
    // Dados com 1 empenho compartilhado entre 2 contratos
    const sharedEmpenho = {
      canonical_key: '200331-2024NE000245',
      empenho_key: '200331-2024NE000245',
      numero_empenho: '2024NE000245',
      valor_empenhado: 1000000.00,
      valor_liquidado: 200000.00,
      valor_pago: 100000.00,
      valor_rpinscrito: 0.00,
      valor_rp_pago: 0.00
    };

    // Duas ocorrências do mesmo empenho como viriam da agregação ingênua de links
    const empenhosComDuplicacao = [sharedEmpenho, { ...sharedEmpenho }];

    // calculateFinancialSummary usa Set de canonical_key/empenho_key
    const summary = calculateFinancialSummary(empenhosComDuplicacao);

    // Deve computar apenas uma vez!
    expect(summary.totalEmpenhado).toBe(1000000.00);
    expect(summary.totalLiquidado).toBe(200000.00);
    expect(summary.totalPago).toBe(100000.00);
    expect(summary.topEmpenhos?.length).toBe(1);
  });
});
