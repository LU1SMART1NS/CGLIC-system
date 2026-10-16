#!/usr/bin/env node
/**
 * Estudo (14/10/2026): o saldo contábil do Tesouro (STA) como fonte do valor pago e dos restos a pagar por empenho.
 *
 * Uso: node scripts/estudo-saldo-contabil.mjs <empenhos.json> [saida.json]
 *   empenhos.json: saída de scripts/estudo-saldo-contabil.sql (empenhos do banco com o pago calculado pelas faturas).
 *
 * Só lê APIs abertas e o arquivo informado; não grava no banco.
 */
import fs from 'node:fs';

const UGS = ['200330', '200331'];
const ANOS = Array.from({ length: 2026 - 2016 + 1 }, (_, i) => String(2016 + i));
// Contas de controle da execução da despesa (conta corrente = NE + subitem, ex.: 2025NE00047152)
const CONTAS = {
  '622920101': ['exercicio', 'a_liquidar'],
  '622920102': ['exercicio', 'em_liquidacao'],
  '622920103': ['exercicio', 'liquidado_a_pagar'],
  '622920104': ['exercicio', 'pago'],
  '631100000': ['rpnp', 'a_liquidar'],
  '631200000': ['rpnp', 'em_liquidacao'],
  '631300000': ['rpnp', 'liquidado_a_pagar'],
  '631400000': ['rpnp', 'pago'],
  '632100000': ['rpp', 'a_pagar'],
  '632200000': ['rpp', 'pago']
};
const ANO_ATUAL = ANOS.at(-1);

async function lerConta(ano, ug, conta) {
  const url = `https://sta.api.gov.br/api/saldocontabil/ano/${ano}/ug/${ug}/gestao/00001/contacontabil/${conta}`;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (tentativa === 3) throw new Error(`${url}: ${e.message}`);
    }
  }
}

const [arqEmpenhos, arqSaida] = process.argv.slice(2);
if (!arqEmpenhos) {
  console.error('Uso: node scripts/estudo-saldo-contabil.mjs <empenhos.json> [saida.json]');
  process.exit(1);
}
const empenhosDb = JSON.parse(fs.readFileSync(arqEmpenhos, 'utf8'));

// ug|NE -> { pagoTotal, pagoPorAno, situacaoAtual: {...}, subitens:Set }
const porNe = new Map();
let linhas = 0;
let atualizadoEm = '';
const t0 = Date.now();
for (const ug of UGS) {
  for (const ano of ANOS) {
    for (const [conta, [grupo, campo]] of Object.entries(CONTAS)) {
      const lista = await lerConta(ano, ug, conta);
      for (const x of lista) {
        linhas++;
        if (ano === ANO_ATUAL && x.created_at > atualizadoEm) atualizadoEm = x.created_at;
        const cc = String(x.conta_corrente);
        const ne = cc.slice(0, 12);
        if (!/^\d{4}NE\d{6}$/.test(ne)) continue;
        const chave = `${ug}|${ne}`;
        const reg = porNe.get(chave) ?? { pagoTotal: 0, pagoPorAno: {}, atual: {}, subitens: new Set() };
        reg.subitens.add(cc.slice(12));
        const saldo = Number(x.saldo) || 0;
        if (campo === 'pago') {
          reg.pagoTotal += saldo;
          reg.pagoPorAno[ano] = (reg.pagoPorAno[ano] ?? 0) + saldo;
        }
        if (ano === ANO_ATUAL) reg.atual[`${grupo}_${campo}`] = (reg.atual[`${grupo}_${campo}`] ?? 0) + saldo;
        porNe.set(chave, reg);
      }
    }
  }
}
const segundos = Math.round((Date.now() - t0) / 1000);

const r2 = (v) => Math.round(v * 100) / 100;
const comparacao = empenhosDb.map((e) => {
  const sta = porNe.get(`${e.ug}|${e.ne}`);
  const pagoSta = sta ? r2(sta.pagoTotal) : null;
  const a = sta?.atual ?? {};
  return {
    ug: e.ug, ne: e.ne, ano: e.ano, contratos: e.contratos, faturado: e.faturado, empenhado: e.valor_empenhado,
    pagoConfirmadoFaturas: r2(e.pago_confirmado), aConferirFaturas: r2(e.a_conferir), pagoFonteContratos: e.pago_fonte_contratos,
    noSta: Boolean(sta), pagoSta,
    rpALiquidar: r2((a.rpnp_a_liquidar ?? 0) + (a.rpnp_em_liquidacao ?? 0)),
    rpLiquidadoAPagar: r2((a.rpnp_liquidado_a_pagar ?? 0) + (a.rpp_a_pagar ?? 0)),
    exercicioALiquidar: r2((a.exercicio_a_liquidar ?? 0) + (a.exercicio_em_liquidacao ?? 0)),
    exercicioLiquidadoAPagar: r2(a.exercicio_liquidado_a_pagar ?? 0)
  };
});

const soma = (l, k) => r2(l.reduce((s, x) => s + (Number(x[k]) || 0), 0));
const comFatura = comparacao.filter((c) => c.faturado > 0);
const iguais = comFatura.filter((c) => c.noSta && Math.abs(c.pagoSta - c.pagoConfirmadoFaturas) <= Math.max(1, 0.01 * c.pagoSta));
const staMaior = comFatura.filter((c) => c.noSta && c.pagoSta - c.pagoConfirmadoFaturas > Math.max(1, 0.01 * c.pagoSta));
const faturasMaior = comFatura.filter((c) => c.noSta && c.pagoConfirmadoFaturas - c.pagoSta > Math.max(1, 0.01 * c.pagoSta));
const resumo = {
  geradoEm: new Date().toISOString(),
  dadosDoTesouroAtualizadosEm: atualizadoEm,
  consulta: { ugs: UGS, anos: `${ANOS[0]}-${ANO_ATUAL}`, chamadas: UGS.length * ANOS.length * Object.keys(CONTAS).length, linhas, segundos },
  empenhosNoBanco: comparacao.length,
  encontradosNoTesouro: comparacao.filter((c) => c.noSta).length,
  naoEncontrados: comparacao.filter((c) => !c.noSta).map((c) => `${c.ug} ${c.ne} (${c.ano})`),
  empenhosNoTesouroForaDoBanco: [...porNe.keys()].filter((k) => !comparacao.some((c) => `${c.ug}|${c.ne}` === k)).length,
  comFatura: {
    empenhos: comFatura.length,
    pagoConfirmadoPelasFaturas: soma(comFatura, 'pagoConfirmadoFaturas'),
    aConferirPelasFaturas: soma(comFatura, 'aConferirFaturas'),
    pagoNoTesouro: soma(comFatura.filter((c) => c.noSta), 'pagoSta'),
    iguais: iguais.length,
    tesouroPagouMais: { empenhos: staMaior.length, diferenca: r2(staMaior.reduce((s, c) => s + c.pagoSta - c.pagoConfirmadoFaturas, 0)) },
    faturasPagaramMais: { empenhos: faturasMaior.length, diferenca: r2(faturasMaior.reduce((s, c) => s + c.pagoConfirmadoFaturas - c.pagoSta, 0)) }
  },
  restosAPagarHoje: {
    aLiquidar: soma(comparacao, 'rpALiquidar'),
    liquidadoAPagar: soma(comparacao, 'rpLiquidadoAPagar'),
    empenhosComRp: comparacao.filter((c) => c.rpALiquidar + c.rpLiquidadoAPagar > 0).length
  },
  exercicioHoje: { aLiquidar: soma(comparacao, 'exercicioALiquidar'), liquidadoAPagar: soma(comparacao, 'exercicioLiquidadoAPagar') }
};
const maioresDiferencas = [...staMaior, ...faturasMaior]
  .map((c) => ({ ...c, diferenca: r2(c.pagoSta - c.pagoConfirmadoFaturas) }))
  .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
  .slice(0, 25);
const saida = { resumo, maioresDiferencas, comparacao };
if (arqSaida) fs.writeFileSync(arqSaida, JSON.stringify(saida, null, 2));
console.log(JSON.stringify(resumo, (k, v) => (k === 'naoEncontrados' && v.length > 15 ? [...v.slice(0, 15), `... e mais ${v.length - 15}`] : v), 2));
