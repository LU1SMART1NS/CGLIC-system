/** Repartir um item entre beneficiários (migration 286): a conta da janela, como o "Repartir" da Reserva. */

export interface ParteDaRepartição { beneficiarioId: string; qtd: string; atual: boolean }

const fmt = (n: number) => n.toLocaleString('pt-BR');

export function resumoDaRepartição<P extends ParteDaRepartição>(partes: P[], total: number) {
  const num = (p: P) => Number(p.qtd || 0);
  const soma = partes.reduce((s, p) => s + num(p), 0);
  const comQtd = partes.filter((p) => num(p) > 0);
  const fecha = soma === total;
  return {
    soma,
    fecha,
    comQtd: comQtd.length,
    /** A parte de hoje sem cadastro não pode ficar com unidades (o banco exige beneficiário do cadastro). */
    semCadastro: comQtd.some((p) => !p.beneficiarioId),
    texto: `Soma ${fmt(soma)} de ${fmt(total)}${soma < total ? ` · faltam ${fmt(total - soma)}` : soma > total ? ` · sobram ${fmt(soma - total)}` : ''}`,
    /** O que vai ao banco: só partes com unidades, a de hoje primeiro (ela fica no item de hoje). */
    paraGravar: [...comQtd].sort((a, b) => Number(b.atual) - Number(a.atual)).map((p) => ({ beneficiarioId: p.beneficiarioId, quantidade: num(p) }))
  };
}
