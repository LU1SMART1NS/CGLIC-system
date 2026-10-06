#!/usr/bin/env node
/**
 * Empacota a Edge Function sincronizar-fontes.
 *
 * A função reaproveita os serviços de sincronização do app (src/services), que são TypeScript com imports
 * sem extensão, o que o Deno não resolve. Por isso o código é empacotado num único arquivo JavaScript:
 *   entrada:  server/sincronizar-fontes/index.ts
 *   saída:    supabase/functions/sincronizar-fontes/index.ts   (gerado, fora do git; é JavaScript puro, com
 *             o nome que a CLI do Supabase procura por padrão)
 *
 * No pacote, src/services/supabaseClient.ts (cliente do navegador, que lê import.meta.env e usa a sessão do
 * usuário) é SUBSTITUÍDO por server/sincronizar-fontes/supabaseServidor.ts (chave de service role). Assim os
 * serviços gravam no banco como servidor, sem nenhuma mudança neles.
 *
 * Modos:
 *   (padrão)  supabase-js fica como `npm:@supabase/supabase-js@<versão>` (o Deno baixa na implantação).
 *   --local   embute o supabase-js e roda em Node; serve para testar o pacote real (ver --out).
 *   --out <arquivo>   saída diferente da padrão.
 */
import { rolldown } from 'rolldown';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const local = args.includes('--local');
const indiceOut = args.indexOf('--out');
const saida = resolve(raiz, indiceOut >= 0 ? args[indiceOut + 1] : 'supabase/functions/sincronizar-fontes/index.ts');

const entrada = resolve(raiz, 'server/sincronizar-fontes/index.ts');
const clienteDoServidor = resolve(raiz, 'server/sincronizar-fontes/supabaseServidor.ts');
const versaoSupabase = JSON.parse(readFileSync(resolve(raiz, 'node_modules/@supabase/supabase-js/package.json'), 'utf8')).version;

const plugins = [
  {
    name: 'cliente-supabase-do-servidor',
    resolveId(origem, importador) {
      // O cliente do navegador (qualquer import terminado em supabaseClient) vira o cliente do servidor.
      if (/(^|\/)supabaseClient$/.test(origem) && importador && !importador.includes('/server/')) return clienteDoServidor;
      if (!local && origem === '@supabase/supabase-js') return { id: `npm:@supabase/supabase-js@${versaoSupabase}`, external: true };
      return null;
    }
  }
];

const pacote = await rolldown({
  input: entrada,
  platform: local ? 'node' : 'neutral',
  tsconfig: resolve(raiz, 'tsconfig.server.json'),
  plugins,
  logLevel: 'warn'
});
await pacote.write({
  file: saida,
  format: 'esm',
  sourcemap: false,
  banner: '// @ts-nocheck\n// Arquivo GERADO por scripts/build-sincronizar-fontes.mjs a partir de server/ e src/. Não edite.'
});
await pacote.close();

const codigo = readFileSync(saida, 'utf8');
const problemas = [];
if (codigo.includes('import.meta.env')) problemas.push('contém import.meta.env (o cliente do navegador entrou no pacote)');
if (!codigo.includes('Deno.serve')) problemas.push('não contém Deno.serve');
// A gravação de atas e itens só vale no servidor (ehServidor = true). Se a trava do navegador (false) entrar
// no pacote, a sincronização rodaria sem gravar nada. O empacotador troca a constante pelo valor, então o
// teste é: cacheArpsInDb não pode ter sobrado com um "!false" ou com a constante falsa.
if (/ehServidor\s*=\s*false/.test(codigo) || /ehServidor/.test(codigo.match(/async function cacheArpsInDb[\s\S]{0,200}/)?.[0] ?? '')) {
  problemas.push('a trava de gravação do navegador (ehServidor = false) entrou no pacote');
}
if (!local && !codigo.includes(`npm:@supabase/supabase-js@${versaoSupabase}`)) problemas.push('o supabase-js não ficou como npm:');
// A chave pública do navegador (valor padrão de supabaseClient.ts) não pode ir para o servidor.
const chavePublicaDoNavegador = /DEFAULT_SUPABASE_ANON_KEY\s*=\s*'([^']+)'/.exec(readFileSync(resolve(raiz, 'src/services/supabaseClient.ts'), 'utf8'))?.[1];
if (/VITE_SUPABASE/.test(codigo) || (chavePublicaDoNavegador && codigo.includes(chavePublicaDoNavegador))) {
  problemas.push('contém a configuração do cliente do navegador');
}
if (problemas.length > 0) {
  console.error(`Pacote inválido (${saida}):\n- ${problemas.join('\n- ')}`);
  process.exit(1);
}
console.log(`${local ? 'Pacote local' : 'Pacote da Edge Function'} gerado: ${saida} (${Math.round(statSync(saida).size / 1024)} KB)`);
