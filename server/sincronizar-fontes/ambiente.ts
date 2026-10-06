/**
 * Leitura de variáveis de ambiente que funciona na Edge Function (Deno) e nos testes (Node).
 */
type DenoLike = { env: { get(nome: string): string | undefined } };

export function lerAmbiente(nome: string): string | undefined {
  const deno = (globalThis as { Deno?: DenoLike }).Deno;
  if (deno?.env) return deno.env.get(nome);
  const processo = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processo?.env?.[nome];
}
