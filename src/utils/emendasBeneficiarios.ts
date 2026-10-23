/** Regras do cadastro de beneficiários das emendas (migrations 155 e 166), fora das telas para poder testar. */
import { soDigitos, type BeneficiarioEmenda, type ParDiferente } from '../services/emendasService';

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const UFS = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export interface FormularioBeneficiario {
  /** Nome da unidade por extenso (coluna nome). */
  nome: string;
  sigla: string;
  /** Coluna ÓRGÃO do Anexo da reserva (lista fixa de ORGAOS_BENEFICIARIO). */
  orgao: string;
  entregaCep: string;
  entregaLogradouro: string;
  entregaNumero: string;
  entregaComplemento: string;
  entregaBairro: string;
  entregaMunicipio: string;
  entregaUf: string;
  responsavelNome: string;
  responsavelCargo: string;
  responsavelTelefone: string;
  responsavelEmail: string;
}

/** O que impede salvar; vazio = pode salvar. Só o nome é obrigatório (migration 166); o resto, se vier, vem certo. */
export function pendenciasDoBeneficiario(f: FormularioBeneficiario): string[] {
  const p: string[] = [];
  if (!chaveDoNome(f.nome)) p.push('nome da unidade');
  const cep = soDigitos(f.entregaCep);
  if (cep && cep.length !== 8) p.push('CEP com 8 números');
  if (f.entregaUf.trim() && !UFS.has(f.entregaUf.trim().toUpperCase())) p.push('UF válida');
  const tel = soDigitos(f.responsavelTelefone);
  if (tel && (tel.length < 10 || tel.length > 11)) p.push('telefone com DDD (10 ou 11 números)');
  if (f.responsavelEmail.trim() && !EMAIL_VALIDO.test(f.responsavelEmail.trim())) p.push('e-mail válido');
  return p;
}

/** Natureza jurídica da Receita que não é de órgão público (associação, empresa...): o CNPJ provavelmente está errado. */
export function naturezaNaoPublica(natureza: string | null | undefined): boolean {
  if (!natureza?.trim()) return false;
  return !/p[úu]blic|munic[íi]pio|estado|estadual|distrito federal|autarquia|uni[ãa]o/i.test(natureza);
}

/** CNPJ próprio = filial da unidade na Receita (a ordem não é a 0001 da matriz do órgão). */
export const cnpjProprio = (cnpj: string | null | undefined): boolean => Boolean(cnpj && cnpj.length === 14 && cnpj.slice(8, 12) !== '0001');

export type FaltaDoBeneficiario = 'CNPJ' | 'endereço' | 'contato';

/** O que falta completar no cadastro. Não trava nada: a lista mostra e filtra. */
export function faltasDoBeneficiario(b: Pick<BeneficiarioEmenda, 'cnpj' | 'entregaCep' | 'entregaLogradouro' | 'responsavelNome'>): FaltaDoBeneficiario[] {
  const f: FaltaDoBeneficiario[] = [];
  if (!b.cnpj) f.push('CNPJ');
  if (!b.entregaCep || !b.entregaLogradouro) f.push('endereço');
  if (!b.responsavelNome) f.push('contato');
  return f;
}

const LIGACAO = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'cidade', 'o', 'a', 'em']);

/** Palavras do nome sem acento, pontuação, "°/º" e palavras de ligação: a mesma conta de chave_nome_beneficiario do banco. */
function palavras(s: string | null | undefined): string[] {
  return (s ?? '')
    .replace(/[°º]/g, 'o ')
    .replace(/ª/g, 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !LIGACAO.has(w));
}

export const chaveDoNome = (s: string | null | undefined): string => palavras(s).join(' ');

/** Órgão a mostrar embaixo do nome; nada quando repete o nome ("Polícia Civil" / "Polícia Civil"). */
export const orgaoAbaixoDoNome = (b: Pick<BeneficiarioEmenda, 'orgao'>, rotulo: string): string | null =>
  b.orgao && chaveDoNome(b.orgao) !== chaveDoNome(rotulo) ? b.orgao : null;

/** Nome + município + UF: o que não pode repetir (chave_identidade do banco). */
export const chaveDaIdentidade = (nome: string, municipio: string | null | undefined, uf: string | null | undefined): string =>
  chaveDoNome(`${nome} ${municipio ?? ''} ${uf ?? ''}`);

/** Cadastro com o mesmo nome e local, ou com uma grafia igual guardada; o banco recusa o mesmo. */
export function beneficiarioRepetido(
  lista: BeneficiarioEmenda[],
  nome: string,
  municipio: string,
  uf: string,
  id?: string
): BeneficiarioEmenda | undefined {
  const chave = chaveDaIdentidade(nome, municipio.trim(), uf.trim().toUpperCase());
  if (!chaveDoNome(nome)) return undefined;
  return lista.find(
    (b) => b.id !== id && (chaveDaIdentidade(b.nome, b.entregaMunicipio, b.entregaUf) === chave || b.outrosNomes.some((o) => chaveDoNome(o) === chave))
  );
}

const numeros = (ws: string[]) => ws.filter((w) => /\d/.test(w)).sort().join(' ');

/**
 * Nomes parecidos no mesmo lugar: mesmos números ("5º" e "9º Batalhão" são unidades diferentes), mesma UF e mesma
 * cidade quando os dois têm, e mais de 3/4 das palavras em comum. Só aponta: quem decide é a CAEP.
 */
export function saoParecidos(
  a: Pick<BeneficiarioEmenda, 'nome' | 'entregaMunicipio' | 'entregaUf'>,
  b: Pick<BeneficiarioEmenda, 'nome' | 'entregaMunicipio' | 'entregaUf'>
): boolean {
  if (a.entregaUf && b.entregaUf && a.entregaUf !== b.entregaUf) return false;
  if (a.entregaMunicipio && b.entregaMunicipio && chaveDoNome(a.entregaMunicipio) !== chaveDoNome(b.entregaMunicipio)) return false;
  const pa = palavras(a.nome);
  const pb = palavras(b.nome);
  if (numeros(pa) !== numeros(pb)) return false;
  const sa = new Set(pa);
  const sb = new Set(pb);
  const comuns = [...sa].filter((w) => sb.has(w)).length;
  return comuns / new Set([...sa, ...sb]).size > 0.75;
}

const chaveDoPar = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** Pares parecidos entre os ativos, sem os que a CAEP já marcou como diferentes. */
export function paresParecidos(lista: BeneficiarioEmenda[], diferentes: ParDiferente[]): [BeneficiarioEmenda, BeneficiarioEmenda][] {
  const marcados = new Set(diferentes.map((d) => chaveDoPar(d.aId, d.bId)));
  const ativos = lista.filter((b) => b.ativo);
  const pares: [BeneficiarioEmenda, BeneficiarioEmenda][] = [];
  for (let i = 0; i < ativos.length; i++) {
    for (let j = i + 1; j < ativos.length; j++) {
      const a = ativos[i];
      const b = ativos[j];
      if (!marcados.has(chaveDoPar(a.id, b.id)) && saoParecidos(a, b)) pares.push([a, b]);
    }
  }
  return pares;
}

/** Parecidos com um nome digitado na janela de cadastro (até 3), para a pessoa usar o que já existe. */
export function parecidosCom(lista: BeneficiarioEmenda[], nome: string, municipio: string, uf: string, id?: string): BeneficiarioEmenda[] {
  if (palavras(nome).length < 2) return [];
  const alvo = { nome, entregaMunicipio: municipio.trim() || null, entregaUf: uf.trim().toUpperCase() || null };
  return lista.filter((b) => b.id !== id && saoParecidos(alvo, b)).slice(0, 3);
}

/**
 * Link do WhatsApp do contato: só celular brasileiro (DDD + 9 + 8 números) tem WhatsApp; fixo não ganha link.
 * Abre a conversa no WhatsApp Web ou no aplicativo (wa.me).
 */
export function linkDoWhatsapp(telefone: string | null | undefined): string | null {
  const d = soDigitos(telefone);
  return /^[1-9]{2}9\d{8}$/.test(d) ? `https://wa.me/55${d}` : null;
}
