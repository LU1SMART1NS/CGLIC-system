/**
 * Nome sugerido para um módulo do plano quando o mesmo modelo é aplicado de novo.
 *
 * O nome fica gravado no módulo (o usuário pode trocá-lo), então a sugestão só precisa de um
 * número que ainda não esteja em uso: "Termo aditivo" já aplicado → "2º Termo aditivo".
 * Se o 1º módulo foi excluído e só resta o "2º", a próxima sugestão é "3º", nunca um "2º" repetido.
 */

const ORDINAL_NO_INICIO = /^\s*(\d+)\s*[ºo°]\s+/i;

export function semOrdinal(nome: string): string {
  return nome.replace(ORDINAL_NO_INICIO, '').trim();
}

export function sugerirNomeModulo(nomeModelo: string, nomesDosModulosDoModelo: string[]): string {
  const base = semOrdinal(nomeModelo) || nomeModelo.trim();
  const emUso = new Set(nomesDosModulosDoModelo.map((n) => n.trim().toLowerCase()));
  const maiorOrdinal = nomesDosModulosDoModelo.reduce((max, n) => {
    const m = ORDINAL_NO_INICIO.exec(n);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);

  let proximo = Math.max(nomesDosModulosDoModelo.length, maiorOrdinal) + 1;
  let sugestao = `${proximo}º ${base}`;
  while (emUso.has(sugestao.toLowerCase())) {
    proximo += 1;
    sugestao = `${proximo}º ${base}`;
  }
  return sugestao;
}
