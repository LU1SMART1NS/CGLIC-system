/**
 * Emendas parlamentares — entrega 1 (migration 155): autores, beneficiários, kits e os itens alocados à CAEP.
 *
 * Leitura direto das tabelas (RLS: emendas.view, só coordenador, gestor de emendas e consulta). Gravação só pelas
 * RPCs salvar_beneficiario_emenda e salvar_kit_emenda (emendas.manage), com conferência de versão.
 *
 * CNPJ e CEP são consultados no navegador na hora do cadastro (BrasilAPI, aberta e com CORS; ViaCEP como
 * reserva do CEP). Nada disso é sincronização: o que a pessoa confere é o que grava.
 */
import type { ExecucaoNoPortal } from '../utils/emendasSobra';
import { supabase } from './supabaseClient';
import { lerTodasAsPaginas } from './lerTodasAsPaginas';
import { mensagemDeErro } from './sincronizacaoFontesService';

export type TipoAutor = 'DEPUTADO' | 'SENADOR' | 'BANCADA';

export interface AutorEmenda {
  id: string;
  tipo: TipoAutor;
  nome: string;
  nomeCivil: string | null;
  partido: string | null;
  uf: string | null;
  emExercicio: boolean | null;
  legislatura: number | null;
  lidoEm: string | null;
  /** M ou F, das fontes (migration 176); null enquanto não lido. */
  sexo?: 'M' | 'F' | null;
}

export interface BeneficiarioEmenda {
  id: string;
  versao: number;
  ativo: boolean;
  /** Nome curto do beneficiário, sem a cidade e a UF (ficam no endereço de entrega). Nome curto + município + UF não
   *  repetem (migrations 166 e 167). O nome do beneficiário é a razão social, da Receita. */
  nome: string;
  /** Sigla da unidade ("27º BPM/M"), opcional (migration 168); aparece ao lado do nome. Não entra na identidade. */
  sigla: string | null;
  /** Outras grafias do mesmo beneficiário (planilhas da CAEP e cadastros juntados). */
  outrosNomes: string[];
  /** PLANILHA = criado pela carga das planilhas da CAEP (migration 166). */
  origem: 'CADASTRO' | 'PLANILHA';
  /** Opcional desde a migration 166, e não único: unidades do mesmo órgão usam o CNPJ dele. */
  cnpj: string | null;
  razaoSocial: string | null;
  naturezaJuridica: string | null;
  enteFederativo: string | null;
  situacaoCadastral: string | null;
  sedeEndereco: string | null;
  sedeMunicipio: string | null;
  sedeUf: string | null;
  sedeCep: string | null;
  sedeTelefone: string | null;
  sedeEmail: string | null;
  receitaLidaEm: string | null;
  /** Sem uso desde a migration 167 (o nome curto é `nome`). */
  nomeCurto: string | null;
  entregaCep: string | null;
  entregaLogradouro: string | null;
  entregaNumero: string | null;
  entregaComplemento: string | null;
  entregaBairro: string | null;
  entregaMunicipio: string | null;
  entregaUf: string | null;
  /** Contato do beneficiário final (o responsável pelo recebimento é uma comissão definida depois). */
  responsavelNome: string | null;
  responsavelCargo: string | null;
  responsavelTelefone: string | null;
  responsavelWhatsapp: boolean;
  responsavelEmail: string | null;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
}

/** Nome da unidade por extenso (coluna nome). Nas listas a sigla vem ao lado, mais clara (NomeComSigla). */
export const rotuloBeneficiario = (b: Pick<BeneficiarioEmenda, 'nome'>): string => b.nome;

/** "27º Batalhão de Polícia Militar Metropolitano · 27º BPM/M" em texto corrido (opções de seleção, avisos). */
export const nomeESigla = (b: Pick<BeneficiarioEmenda, 'nome' | 'sigla'>): string => (b.sigla ? `${b.nome} · ${b.sigla}` : b.nome);

/** "Limeira - SP", só "SP" ou nada. */
export function localDoBeneficiario(b: Pick<BeneficiarioEmenda, 'entregaMunicipio' | 'entregaUf'>): string | null {
  return [b.entregaMunicipio, b.entregaUf].filter(Boolean).join(' - ') || null;
}

/** Par de beneficiários parecidos que a CAEP confirmou serem unidades diferentes (migration 166). */
export interface ParDiferente {
  aId: string;
  bId: string;
}

export interface ItemCaep {
  itemKey: string;
  numeroAta: string;
  codigoUasg: string;
  numeroItem: string;
  descricao: string;
  codigoPdm: number | null;
  valorUnitario: number;
  vigenciaFinal: string | null;
  ataEncerrada: boolean;
  alocado: number;
  /** Informados pela CAEP para o quadro da reserva (migration 165): nome na ata assinada, GND e versão desses dados. */
  nomeCurto?: string | null;
  gnd?: 'GND-3' | 'GND-4' | null;
  dadosVersao?: number | null;
  /** Fornecedor do item na ata (migration 178), para a lista das atas do pedido. */
  fornecedor?: string | null;
}

export interface ItemDoKit {
  itemKey: string;
  quantidade: number;
}

export interface KitEmenda {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  versao: number;
  itens: ItemDoKit[];
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
}

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export async function fetchAutoresEmendas(): Promise<AutorEmenda[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) =>
    db().from('emenda_autores').select('id, tipo, nome, nome_civil, partido, uf, em_exercicio, legislatura, lido_em, sexo').order('id').range(de, ate)
  );
  return linhas.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    nome: r.nome,
    nomeCivil: r.nome_civil ?? null,
    sexo: r.sexo === 'M' || r.sexo === 'F' ? r.sexo : null,
    partido: r.partido ?? null,
    uf: r.uf ?? null,
    emExercicio: r.em_exercicio ?? null,
    legislatura: r.legislatura ?? null,
    lidoEm: r.lido_em ?? null
  }));
}

function beneficiarioDoBanco(r: Record<string, any>): BeneficiarioEmenda {
  return {
    id: r.id,
    versao: r.versao,
    ativo: r.ativo,
    nome: r.nome,
    sigla: r.sigla ?? null,
    outrosNomes: r.outros_nomes ?? [],
    origem: r.origem === 'PLANILHA' ? 'PLANILHA' : 'CADASTRO',
    cnpj: r.cnpj ?? null,
    razaoSocial: r.razao_social ?? null,
    naturezaJuridica: r.natureza_juridica ?? null,
    enteFederativo: r.ente_federativo ?? null,
    situacaoCadastral: r.situacao_cadastral ?? null,
    sedeEndereco: r.sede_endereco ?? null,
    sedeMunicipio: r.sede_municipio ?? null,
    sedeUf: r.sede_uf ?? null,
    sedeCep: r.sede_cep ?? null,
    sedeTelefone: r.sede_telefone ?? null,
    sedeEmail: r.sede_email ?? null,
    receitaLidaEm: r.receita_lida_em ?? null,
    nomeCurto: r.nome_curto ?? null,
    entregaCep: r.entrega_cep ?? null,
    entregaLogradouro: r.entrega_logradouro ?? null,
    entregaNumero: r.entrega_numero ?? null,
    entregaComplemento: r.entrega_complemento ?? null,
    entregaBairro: r.entrega_bairro ?? null,
    entregaMunicipio: r.entrega_municipio ?? null,
    entregaUf: r.entrega_uf ?? null,
    responsavelNome: r.responsavel_nome ?? null,
    responsavelCargo: r.responsavel_cargo ?? null,
    responsavelTelefone: r.responsavel_telefone ?? null,
    responsavelWhatsapp: Boolean(r.responsavel_whatsapp),
    responsavelEmail: r.responsavel_email ?? null,
    atualizadoPorNome: r.atualizado_por_nome ?? null,
    atualizadoEm: r.atualizado_em ?? null
  };
}

export async function fetchBeneficiariosEmendas(): Promise<BeneficiarioEmenda[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) =>
    db().from('emenda_beneficiarios').select('*').order('id').range(de, ate)
  );
  return linhas.map(beneficiarioDoBanco).sort((a, b) => rotuloBeneficiario(a).localeCompare(rotuloBeneficiario(b), 'pt-BR'));
}

export type BeneficiarioParaSalvar = Omit<BeneficiarioEmenda, 'id' | 'versao' | 'atualizadoPorNome' | 'atualizadoEm' | 'outrosNomes' | 'origem'> & { id?: string; versao?: number };

export async function salvarBeneficiarioEmenda(b: BeneficiarioParaSalvar): Promise<{ id: string; versao: number }> {
  const { data, error } = await db().rpc('salvar_beneficiario_emenda', {
    p_beneficiario: {
      id: b.id ?? null,
      versao: b.versao ?? null,
      ativo: b.ativo,
      nome: b.nome,
      sigla: b.sigla,
      cnpj: b.cnpj,
      razao_social: b.razaoSocial,
      natureza_juridica: b.naturezaJuridica,
      ente_federativo: b.enteFederativo,
      situacao_cadastral: b.situacaoCadastral,
      sede_endereco: b.sedeEndereco,
      sede_municipio: b.sedeMunicipio,
      sede_uf: b.sedeUf,
      sede_cep: b.sedeCep,
      sede_telefone: b.sedeTelefone,
      sede_email: b.sedeEmail,
      receita_lida_em: b.receitaLidaEm,
      nome_curto: b.nomeCurto,
      entrega_cep: b.entregaCep,
      entrega_logradouro: b.entregaLogradouro,
      entrega_numero: b.entregaNumero,
      entrega_complemento: b.entregaComplemento,
      entrega_bairro: b.entregaBairro,
      entrega_municipio: b.entregaMunicipio,
      entrega_uf: b.entregaUf,
      responsavel_nome: b.responsavelNome,
      responsavel_cargo: b.responsavelCargo,
      responsavel_telefone: b.responsavelTelefone,
      responsavel_whatsapp: b.responsavelWhatsapp,
      responsavel_email: b.responsavelEmail
    }
  });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { id: string; versao: number };
}

export async function fetchBeneficiariosDiferentes(): Promise<ParDiferente[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) =>
    db().from('emenda_beneficiarios_diferentes').select('a_id, b_id').order('a_id').range(de, ate)
  );
  return linhas.map((r) => ({ aId: r.a_id, bId: r.b_id }));
}

/** Junta dois cadastros do mesmo beneficiário: as linhas das emendas passam para o que fica e o outro é apagado. */
export async function juntarBeneficiariosEmenda(p: { fica: BeneficiarioEmenda; sai: BeneficiarioEmenda; motivo: string }): Promise<{ linhas: number }> {
  const { data, error } = await db().rpc('juntar_beneficiarios_emenda', {
    p_fica: p.fica.id,
    p_fica_versao: p.fica.versao,
    p_sai: p.sai.id,
    p_sai_versao: p.sai.versao,
    p_motivo: p.motivo
  });
  if (error) throw new Error(mensagemDoBanco(error));
  return { linhas: Number((data as { linhas?: number } | null)?.linhas ?? 0) };
}

/** Marca (ou desmarca) dois beneficiários parecidos como unidades diferentes. */
export async function marcarBeneficiariosDiferentes(aId: string, bId: string, diferentes = true): Promise<void> {
  const { error } = await db().rpc('marcar_beneficiarios_diferentes', { p_a: aId, p_b: bId, p_diferentes: diferentes });
  if (error) throw new Error(mensagemDoBanco(error));
}

export async function fetchItensCaep(): Promise<ItemCaep[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) =>
    db().from('v_emendas_itens_caep').select('*').order('item_key').range(de, ate)
  );
  return linhas.map((r) => ({
    itemKey: r.item_key,
    numeroAta: r.numero_ata,
    codigoUasg: r.codigo_uasg,
    numeroItem: r.numero_item,
    descricao: r.descricao_item,
    codigoPdm: r.codigo_pdm ?? null,
    valorUnitario: num(r.valor_unitario),
    vigenciaFinal: r.data_vigencia_final ?? null,
    ataEncerrada: Boolean(r.ata_encerrada),
    alocado: num(r.alocado),
    nomeCurto: r.nome_curto ?? null,
    gnd: r.gnd ?? null,
    dadosVersao: r.dados_versao ?? null,
    fornecedor: r.fornecedor ?? null
  }));
}

export async function fetchKitsEmendas(): Promise<KitEmenda[]> {
  const [kits, itens] = await Promise.all([
    lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_kits').select('*').order('id').range(de, ate)),
    lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_kit_itens').select('kit_id, item_key, quantidade').order('kit_id').order('item_key').range(de, ate))
  ]);
  const porKit = new Map<string, ItemDoKit[]>();
  for (const i of itens) {
    const lista = porKit.get(i.kit_id) ?? [];
    lista.push({ itemKey: i.item_key, quantidade: num(i.quantidade) });
    porKit.set(i.kit_id, lista);
  }
  return kits
    .map((k) => ({
      id: k.id,
      nome: k.nome,
      descricao: k.descricao ?? null,
      ativo: k.ativo,
      versao: k.versao,
      itens: porKit.get(k.id) ?? [],
      atualizadoPorNome: k.atualizado_por_nome ?? null,
      atualizadoEm: k.atualizado_em ?? null
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface KitParaSalvar {
  id?: string;
  versao?: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  itens: ItemDoKit[];
}

export async function salvarKitEmenda(k: KitParaSalvar): Promise<{ id: string; versao: number }> {
  const { data, error } = await db().rpc('salvar_kit_emenda', {
    p_kit: {
      id: k.id ?? null,
      versao: k.versao ?? null,
      nome: k.nome,
      descricao: k.descricao,
      ativo: k.ativo,
      itens: k.itens.map((i) => ({ item_key: i.itemKey, quantidade: i.quantidade }))
    }
  });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { id: string; versao: number };
}

/** "CONFLITO: Outra pessoa…" → "Outra pessoa…": a mensagem do banco já é a frase para o usuário. */
export function mensagemDoBanco(error: unknown): string {
  const msg = mensagemDeErro(error);
  return msg.replace(/^[A-Z_]+:\s*/, '');
}

// ------------------------------------------------------------------------------
// CNPJ e CEP
// ------------------------------------------------------------------------------

export const soDigitos = (v: string | null | undefined): string => (v ?? '').replace(/\D/g, '');

/** Mesma conta da função cnpj_valido do banco (migration 155). */
export function cnpjValido(valor: string): boolean {
  const v = soDigitos(valor);
  if (v.length !== 14 || /^(\d)\1{13}$/.test(v)) return false;
  const dv = (base: string, pesos: number[]) => {
    const s = pesos.reduce((t, p, i) => t + Number(base[i]) * p, 0) % 11;
    return s < 2 ? 0 : 11 - s;
  };
  const d1 = dv(v, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(v, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(v[12]) && d2 === Number(v[13]);
}

export function formatarCnpj(v: string | null | undefined): string {
  if (!v) return '';
  const d = soDigitos(v);
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : v;
}

export function formatarCep(v: string | null | undefined): string {
  const d = soDigitos(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : v ?? '';
}

export function formatarTelefone(v: string | null | undefined): string {
  const d = soDigitos(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? '';
}

export interface DadosDaReceita {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  naturezaJuridica: string | null;
  enteFederativo: string | null;
  situacaoCadastral: string | null;
  sedeEndereco: string | null;
  sedeMunicipio: string | null;
  sedeUf: string | null;
  sedeCep: string | null;
  sedeTelefone: string | null;
  sedeEmail: string | null;
}

const titulo = (s: string | null | undefined) =>
  (s ?? '')
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && ['de', 'da', 'do', 'das', 'dos', 'e'].includes(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)))
    .join(' ');

/** Lê o CNPJ na Receita pela BrasilAPI. Lança com frase para o usuário. */
export async function consultarCnpj(cnpj: string, fetcher: typeof fetch = fetch): Promise<DadosDaReceita> {
  const d = soDigitos(cnpj);
  if (!cnpjValido(d)) throw new Error('CNPJ inválido. Confira os 14 números.');
  let resposta: Response;
  try {
    resposta = await fetcher(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
  } catch {
    throw new Error('A consulta da Receita não respondeu. Tente de novo em instantes.');
  }
  if (resposta.status === 404) throw new Error('CNPJ não encontrado na Receita.');
  if (!resposta.ok) throw new Error(`A consulta da Receita respondeu ${resposta.status}. Tente de novo em instantes.`);
  const r = (await resposta.json()) as Record<string, any>;
  const endereco = [
    [r.descricao_tipo_de_logradouro && !String(r.logradouro ?? '').startsWith(r.descricao_tipo_de_logradouro) ? r.descricao_tipo_de_logradouro : '', r.logradouro].filter(Boolean).join(' '),
    r.numero,
    r.complemento,
    r.bairro
  ]
    .map((x) => (x ?? '').toString().trim())
    .filter(Boolean)
    .join(', ');
  const tel = soDigitos(r.ddd_telefone_1);
  return {
    cnpj: d,
    razaoSocial: String(r.razao_social ?? '').trim(),
    nomeFantasia: (r.nome_fantasia ?? '').trim() || null,
    naturezaJuridica: r.natureza_juridica ?? null,
    enteFederativo: r.ente_federativo_responsavel || null,
    situacaoCadastral: r.descricao_situacao_cadastral ?? null,
    sedeEndereco: endereco || null,
    sedeMunicipio: titulo(r.municipio) || null,
    sedeUf: r.uf ? String(r.uf).toUpperCase() : null,
    sedeCep: soDigitos(r.cep).length === 8 ? soDigitos(r.cep) : null,
    sedeTelefone: tel.length >= 10 ? formatarTelefone(tel) : null,
    sedeEmail: (r.email ?? '').toLowerCase() || null
  };
}

export interface EnderecoDoCep {
  cep: string;
  logradouro: string;
  bairro: string;
  municipio: string;
  uf: string;
}

/** Endereço pelo CEP: BrasilAPI e, se ela falhar, ViaCEP. Lança com frase para o usuário. */
export async function consultarCep(cep: string, fetcher: typeof fetch = fetch): Promise<EnderecoDoCep> {
  const d = soDigitos(cep);
  if (d.length !== 8) throw new Error('O CEP tem 8 números.');
  try {
    const r = await fetcher(`https://brasilapi.com.br/api/cep/v2/${d}`);
    if (r.ok) {
      const j = (await r.json()) as Record<string, any>;
      return { cep: d, logradouro: j.street ?? '', bairro: j.neighborhood ?? '', municipio: j.city ?? '', uf: (j.state ?? '').toUpperCase() };
    }
  } catch {
    // tenta o ViaCEP
  }
  let r: Response;
  try {
    r = await fetcher(`https://viacep.com.br/ws/${d}/json/`);
  } catch {
    throw new Error('A consulta do CEP não respondeu. Preencha o endereço à mão.');
  }
  const j = r.ok ? ((await r.json()) as Record<string, any>) : { erro: true };
  if (j.erro) throw new Error('CEP não encontrado. Confira o número ou preencha o endereço à mão.');
  return { cep: d, logradouro: j.logradouro ?? '', bairro: j.bairro ?? '', municipio: j.localidade ?? '', uf: (j.uf ?? '').toUpperCase() };
}

// ------------------------------------------------------------------------------
// Pedidos dos parlamentares (migration 157)
// ------------------------------------------------------------------------------

export type EtapaPedido = 'RESERVADO' | 'MINUTA' | 'OFICIO' | 'CONFERIDO' | 'SOLICITADO' | 'AUTORIZADO' | 'CGOFI' | 'EMPENHADO' | 'CONTRATACAO' | 'CANCELADO';

export interface LinhaPedido {
  id: string;
  ordem: number;
  tipo: 'ITEM' | 'KIT';
  itemKey: string | null;
  kitId: string | null;
  kitNome: string | null;
  kitVersao: number | null;
  /** Composição do kit no dia do pedido. */
  kitComposicao: ItemDoKit[] | null;
  quantidade: number;
  beneficiarioId: string | null;
  /** Nome do beneficiário como veio do controle anterior da CAEP (migration 160), quando a linha não tem cadastro. */
  beneficiarioNome?: string | null;
  cancelada: boolean;
  canceladaMotivo: string | null;
  /** Documento SEI do empenho; a nota é achada pelo sistema (emenda_linha_notas: pelo SEI, pelo contrato ou pelo plano interno). */
  empenhoDocumentoSei: string | null;
  /** Contrato citado na planilha, como 00138/2026. */
  contratoNumero: string | null;
  /** Documento SEI do despacho para contratação da nota desta linha (planilha de execução). */
  despachoDocumentoSei: string | null;
}

/** Etapa dos documentos SEI do pedido (migration 177): AUTORIZACAO é a solicitação de empenho, que a DGFNSP assina. */
export type EtapaDoDocumento = 'OFICIO' | 'AUTORIZACAO' | 'CGOFI' | 'EMPENHO' | 'CONTRATACAO';

/** Linha do pedido que uma solicitação de empenho cobre, com a quantidade (migration 180). */
export interface LinhaDaSolicitacao {
  linhaId: string;
  quantidade: number;
}

/** Um documento SEI de uma etapa do pedido: o número e a data que o gestor informa (migrations 177 e 178). */
export interface DocumentoSeiDoPedido {
  id: string;
  etapa: EtapaDoDocumento;
  numero: string;
  data: string | null;
  /** Só na solicitação: a ata que ela cobre e o dia em que a Diretora do FNSP assinou. */
  ataKey: string | null;
  assinadaEm: string | null;
  /** Só na solicitação: as linhas do pedido que ela cobre (migration 180). */
  linhas: LinhaDaSolicitacao[];
  /** Só na solicitação: os envios à CGOFI que a levaram (migration 193), do mais antigo ao mais novo. */
  enviosCgofi?: Array<{ numero: string; data: string | null }>;
  /** Só no envio à CGOFI: as solicitações (ids dos documentos) que ele leva (migration 193). */
  solicitacoes?: string[];
}

/** Tentativa devolvida: a minuta e o ofício com divergência (migration 174). */
export interface DevolucaoPedido {
  rodada: number;
  minutaEm: string | null;
  oficioEm: string | null;
  oficioDocumentoSei: string | null;
  oficioProcessoSei: string | null;
  motivo: string;
  devolvidoEm: string;
  criadoPorNome: string | null;
}

/** Anulação de empenho registrada no pedido (migration 203). */
export interface AnulacaoPedido {
  id: string;
  /** Total: todas as linhas ativas do pedido; parcial: parte delas. */
  total: boolean;
  /**
   * INTERLOCUCAO: total, o próprio pedido voltou a "Itens reservados"; parcial, as linhas foram para o pedido novo.
   * CANCELAR (migration 208): os itens só foram cancelados (total: o pedido inteiro).
   */
  destino: 'INTERLOCUCAO' | 'CANCELAR';
  novoPedidoId: string | null;
  novoPedidoNumero: number | null;
  notas: string[];
  linhas: Array<{ linhaId: string; novaLinhaId: string | null; itemKey: string | null; kitNome: string | null; quantidade: number }>;
  documentoSei: string;
  anuladoEm: string;
  motivo: string;
  criadoPorNome: string | null;
}

export interface PedidoEmenda {
  id: string;
  numero: number;
  /** Vazio = reserva para um órgão (o beneficiário final), com o parlamentar a definir (migration 163). */
  autorId: string | null;
  etapa: EtapaPedido;
  origem: 'SISTEMA' | 'PLANILHA';
  observacao: string | null;
  /** Contato da assessoria com quem a CAEP combinou a reserva (a reserva não é documento). */
  contatoNome: string | null;
  contatoTelefone: string | null;
  contatoEmail: string | null;
  reservadoEm: string;
  minutaEm: string | null;
  /** Sem uso desde a migration 174 (a minuta não tem documento SEI). */
  minutaDocumentoSei: string | null;
  /** Sem uso desde a migration 174 (o pedido é identificado pelo processo SEI). */
  oficioNumero: string | null;
  oficioDocumentoSei: string | null;
  oficioProcessoSei: string | null;
  oficioEm: string | null;
  /** O que não bateu no último ofício devolvido; some quando chega o novo ofício. */
  divergencia: string | null;
  /** Data da última devolução do ofício (o aviso "sem ofício" conta daqui). */
  devolvidoEm: string | null;
  /** Nº da emenda: 8 dígitos, os 4 do autor e os 4 da emenda (migration 186). */
  siopEmenda: string | null;
  /** Ano da emenda: o número se repete entre anos (migration 186). */
  siopEmendaAno: number | null;
  siopValor: number | null;
  siopGnd: string | null;
  conferidoEm: string | null;
  /** Solicitação de empenho (CAEP → DGFNSP). */
  solicitadoEm: string | null;
  solicitadoDocumentoSei: string | null;
  /** Autorização de empenho (DGFNSP). */
  autorizadoEm: string | null;
  autorizadoDocumentoSei: string | null;
  /** Envio à CGOFI para o empenho. */
  cgofiEm: string | null;
  cgofiDocumentoSei: string | null;
  empenhadoEm: string | null;
  /** Documentos SEI do empenho: um por nota. */
  empenhadoDocumentosSei: string[];
  /** Envio para contratação (CAEP → CCGA). */
  contratacaoEm: string | null;
  /** Documentos SEI do despacho para contratação: um por nota. */
  contratacaoDocumentosSei: string[];
  canceladoEm: string | null;
  canceladoMotivo: string | null;
  versao: number;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
  linhas: LinhaPedido[];
  /** Tentativas devolvidas, da primeira à última. */
  devolucoes: DevolucaoPedido[];
  /** Todos os documentos SEI das etapas (migration 177), com a ata de cada solicitação (migration 178). */
  documentos: DocumentoSeiDoPedido[];
  /** Pedido de onde vieram os itens, quando este foi aberto por uma anulação parcial de empenho (migration 203). */
  pedidoOrigemId: string | null;
  pedidoOrigemNumero: number | null;
  /** Anulações de empenho registradas neste pedido, da mais antiga à mais nova (migration 203). */
  anulacoes: AnulacaoPedido[];
  /** Emenda registrada de onde o pedido nasceu, ou a do nº conferido no SIOP (migration 205). */
  emendaId: string | null;
  /** Outras emendas do pedido, além da conferida (migration 211): a sobra de uma emenda antiga que completou o pedido. */
  outrasEmendas: OutraEmendaDoPedido[];
}

export interface OutraEmendaDoPedido {
  id: string;
  ano: number;
  /** 8 dígitos, como siopEmenda. */
  numero: string;
  documentoSei: string | null;
  observacao: string | null;
  criadoPorNome: string | null;
  criadoEm: string;
}

export async function fetchPedidosEmendas(): Promise<PedidoEmenda[]> {
  const [pedidos, linhas, devolucoes, documentos, solicitacaoLinhas, cgofiSolicitacoes, anulacoes, outras] = await Promise.all([
    lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_pedidos').select('*').order('numero').range(de, ate)),
    lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_pedido_linhas').select('*').order('id').range(de, ate)),
    lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_pedido_devolucoes').select('*').order('id').range(de, ate)),
    // Só o que o gestor informa: a hora e quem assinou, lidos no SEI uma vez, não aparecem nas telas.
    lerTodasAsPaginas<Record<string, any>>((de, ate) =>
      db().from('emenda_pedido_documentos_sei').select('id, pedido_id, etapa, documento_sei, data_documento, ata_key, assinado_em').order('id').range(de, ate)
    ),
    // Linhas que cada solicitação cobre (migration 180). Antes da migration a tabela não existe: segue sem ela.
    lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_solicitacao_linhas').select('documento_id, linha_id, quantidade').order('linha_id').range(de, ate)).catch(() => []),
    // Solicitações que cada envio à CGOFI leva (migration 193). Antes da migration a tabela não existe: segue sem ela.
    lerTodasAsPaginas<Record<string, any>>((de, ate) =>
      db().from('emenda_cgofi_solicitacoes').select('cgofi_id, solicitacao_id').order('cgofi_id').order('solicitacao_id').range(de, ate)
    ).catch(() => []),
    // Anulações de empenho (migration 203). Antes da migration a tabela não existe: segue sem ela.
    lerTodasAsPaginas<Record<string, any>>((de, ate) =>
      db().from('emenda_pedido_anulacoes').select('*').order('id').range(de, ate)
    ).catch(() => []),
    // Outras emendas dos pedidos (migration 211). Antes da migration a tabela não existe: segue sem ela.
    lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_pedido_emendas').select('*').order('id').range(de, ate)).catch(() => [])
  ]);
  const numeroPorId = new Map(pedidos.map((p) => [p.id as string, p.numero as number]));
  const anulacoesPorPedido = new Map<string, AnulacaoPedido[]>();
  for (const a of anulacoes) {
    const lista = anulacoesPorPedido.get(a.pedido_id) ?? [];
    lista.push({
      id: a.id,
      total: Boolean(a.total),
      destino: a.destino === 'CANCELAR' ? 'CANCELAR' : 'INTERLOCUCAO',
      novoPedidoId: a.novo_pedido_id ?? null,
      novoPedidoNumero: a.novo_pedido_id ? numeroPorId.get(a.novo_pedido_id) ?? null : null,
      notas: Array.isArray(a.notas) ? a.notas : [],
      linhas: (Array.isArray(a.linhas) ? a.linhas : []).map((l: any) => ({
        linhaId: l.linha_id,
        novaLinhaId: l.nova_linha_id ?? null,
        itemKey: l.item_key ?? null,
        kitNome: l.kit_nome ?? null,
        quantidade: num(l.quantidade)
      })),
      documentoSei: a.documento_sei,
      anuladoEm: a.anulado_em,
      motivo: a.motivo,
      criadoPorNome: a.criado_por_nome ?? null
    });
    anulacoesPorPedido.set(a.pedido_id, lista);
  }
  const outrasPorPedido = new Map<string, OutraEmendaDoPedido[]>();
  for (const o of outras) {
    const lista = outrasPorPedido.get(o.pedido_id) ?? [];
    lista.push({
      id: o.id,
      ano: Number(o.ano),
      numero: String(o.numero),
      documentoSei: o.documento_sei ?? null,
      observacao: o.observacao ?? null,
      criadoPorNome: o.criado_por_nome ?? null,
      criadoEm: o.criado_em
    });
    outrasPorPedido.set(o.pedido_id, lista);
  }
  const linhasPorDocumento = new Map<string, LinhaDaSolicitacao[]>();
  for (const s of solicitacaoLinhas) {
    const lista = linhasPorDocumento.get(s.documento_id) ?? [];
    lista.push({ linhaId: s.linha_id, quantidade: num(s.quantidade) });
    linhasPorDocumento.set(s.documento_id, lista);
  }
  const solicitacoesPorEnvio = new Map<string, string[]>();
  const enviosPorSolicitacao = new Map<string, string[]>();
  for (const x of cgofiSolicitacoes) {
    solicitacoesPorEnvio.set(x.cgofi_id, [...(solicitacoesPorEnvio.get(x.cgofi_id) ?? []), x.solicitacao_id]);
    enviosPorSolicitacao.set(x.solicitacao_id, [...(enviosPorSolicitacao.get(x.solicitacao_id) ?? []), x.cgofi_id]);
  }
  const documentoPorId = new Map(documentos.map((d) => [d.id as string, d]));
  const documentosPorPedido = new Map<string, DocumentoSeiDoPedido[]>();
  for (const d of documentos) {
    const lista = documentosPorPedido.get(d.pedido_id) ?? [];
    lista.push({
      id: d.id,
      etapa: d.etapa,
      numero: d.documento_sei,
      data: d.data_documento ?? null,
      ataKey: d.ata_key ?? null,
      assinadaEm: d.assinado_em ? diaEmBrasilia(d.assinado_em) : null,
      linhas: linhasPorDocumento.get(d.id) ?? [],
      enviosCgofi: (enviosPorSolicitacao.get(d.id) ?? [])
        .map((id) => documentoPorId.get(id))
        .filter((e): e is Record<string, any> => Boolean(e))
        .map((e) => ({ numero: e.documento_sei as string, data: (e.data_documento as string | null) ?? null }))
        .sort((a, b) => (a.data ?? '9999').localeCompare(b.data ?? '9999')),
      solicitacoes: solicitacoesPorEnvio.get(d.id) ?? []
    });
    documentosPorPedido.set(d.pedido_id, lista);
  }
  const devolucoesPorPedido = new Map<string, DevolucaoPedido[]>();
  for (const d of devolucoes) {
    const lista = devolucoesPorPedido.get(d.pedido_id) ?? [];
    lista.push({
      rodada: d.rodada,
      minutaEm: d.minuta_em ?? null,
      oficioEm: d.oficio_em ?? null,
      oficioDocumentoSei: d.oficio_documento_sei ?? null,
      oficioProcessoSei: d.oficio_processo_sei ?? null,
      motivo: d.motivo,
      devolvidoEm: d.devolvido_em,
      criadoPorNome: d.criado_por_nome ?? null
    });
    devolucoesPorPedido.set(d.pedido_id, lista);
  }
  const porPedido = new Map<string, LinhaPedido[]>();
  for (const l of linhas) {
    const lista = porPedido.get(l.pedido_id) ?? [];
    lista.push({
      id: l.id,
      ordem: l.ordem,
      tipo: l.tipo,
      itemKey: l.item_key ?? null,
      kitId: l.kit_id ?? null,
      kitNome: l.kit_nome ?? null,
      kitVersao: l.kit_versao ?? null,
      kitComposicao: Array.isArray(l.kit_composicao) ? l.kit_composicao.map((c: any) => ({ itemKey: c.item_key, quantidade: num(c.quantidade) })) : null,
      quantidade: num(l.quantidade),
      beneficiarioId: l.beneficiario_id ?? null,
      beneficiarioNome: l.beneficiario_nome ?? null,
      cancelada: Boolean(l.cancelada),
      canceladaMotivo: l.cancelada_motivo ?? null,
      empenhoDocumentoSei: l.empenho_documento_sei ?? null,
      contratoNumero: l.contrato_numero ?? null,
      despachoDocumentoSei: l.despacho_documento_sei ?? null
    });
    porPedido.set(l.pedido_id, lista);
  }
  return pedidos
    .map((p) => ({
      id: p.id,
      numero: p.numero,
      autorId: p.autor_id ?? null,
      etapa: p.etapa,
      origem: p.origem,
      observacao: p.observacao ?? null,
      contatoNome: p.contato_nome ?? null,
      contatoTelefone: p.contato_telefone ?? null,
      contatoEmail: p.contato_email ?? null,
      reservadoEm: p.reservado_em,
      minutaEm: p.minuta_em ?? null,
      minutaDocumentoSei: p.minuta_documento_sei ?? null,
      oficioNumero: p.oficio_numero ?? null,
      oficioDocumentoSei: p.oficio_documento_sei ?? null,
      oficioProcessoSei: p.oficio_processo_sei ?? null,
      oficioEm: p.oficio_em ?? null,
      divergencia: p.divergencia ?? null,
      devolvidoEm: p.devolvido_em ?? null,
      siopEmenda: p.siop_emenda ?? null,
      siopEmendaAno: p.siop_emenda_ano ?? null,
      siopValor: p.siop_valor == null ? null : num(p.siop_valor),
      siopGnd: p.siop_gnd ?? null,
      conferidoEm: p.conferido_em ?? null,
      solicitadoEm: p.solicitado_em ?? null,
      solicitadoDocumentoSei: p.solicitado_documento_sei ?? null,
      autorizadoEm: p.autorizado_em ?? null,
      autorizadoDocumentoSei: p.autorizado_documento_sei ?? null,
      cgofiEm: p.cgofi_em ?? null,
      cgofiDocumentoSei: p.cgofi_documento_sei ?? null,
      empenhadoEm: p.empenhado_em ?? null,
      empenhadoDocumentosSei: Array.isArray(p.empenhado_documentos_sei) ? p.empenhado_documentos_sei : [],
      contratacaoEm: p.contratacao_em ?? null,
      contratacaoDocumentosSei: Array.isArray(p.contratacao_documentos_sei) ? p.contratacao_documentos_sei : [],
      canceladoEm: p.cancelado_em ?? null,
      canceladoMotivo: p.cancelado_motivo ?? null,
      versao: p.versao,
      atualizadoPorNome: p.atualizado_por_nome ?? null,
      atualizadoEm: p.atualizado_em ?? null,
      linhas: (porPedido.get(p.id) ?? []).sort((a, b) => a.ordem - b.ordem),
      devolucoes: (devolucoesPorPedido.get(p.id) ?? []).sort((a, b) => a.rodada - b.rodada),
      documentos: (documentosPorPedido.get(p.id) ?? []).sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '') || a.numero.localeCompare(b.numero)),
      pedidoOrigemId: p.pedido_origem_id ?? null,
      pedidoOrigemNumero: p.pedido_origem_id ? numeroPorId.get(p.pedido_origem_id) ?? null : null,
      anulacoes: (anulacoesPorPedido.get(p.id) ?? []).sort((a, b) => a.anuladoEm.localeCompare(b.anuladoEm)),
      emendaId: p.emenda_id ?? null,
      outrasEmendas: (outrasPorPedido.get(p.id) ?? []).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
    }))
    .sort((a, b) => b.numero - a.numero);
}

export interface LinhaParaSalvar {
  id?: string;
  tipo: 'ITEM' | 'KIT';
  itemKey?: string | null;
  kitId?: string | null;
  quantidade: number;
  beneficiarioId: string | null;
}

export async function salvarPedidoEmenda(p: {
  id?: string;
  versao?: number;
  /** Vazio na reserva para um órgão; numa reserva sem autor, informar o autor o indica (uma vez só). */
  autorId: string | null;
  /** Reserva nova para um órgão, sem parlamentar (toda linha com beneficiário). */
  paraOrgao?: boolean;
  observacao: string | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  contatoEmail: string | null;
  motivo?: string | null;
  /** Só no pedido novo: a emenda registrada de onde ele nasce (migration 205). */
  emendaId?: string | null;
  linhas: LinhaParaSalvar[];
  /** Pedido novo com a sobra de uma emenda do mesmo parlamentar (migration 204): nasce com o número e o ano dela. */
  emendaDaSobra?: { numero: string; ano: number } | null;
}): Promise<{ id: string; versao: number; numero: number }> {
  const { data, error } = await db().rpc('salvar_pedido_emenda', {
    p_pedido: {
      id: p.id ?? null,
      versao: p.versao ?? null,
      autor_id: p.autorId,
      para_orgao: p.paraOrgao ?? false,
      observacao: p.observacao,
      contato_nome: p.contatoNome,
      contato_telefone: p.contatoTelefone,
      contato_email: p.contatoEmail,
      motivo: p.motivo ?? null,
      emenda_id: p.emendaId ?? null,
      emenda_da_sobra: p.emendaDaSobra ?? null,
      linhas: p.linhas.map((l) => ({ id: l.id ?? null, tipo: l.tipo, item_key: l.itemKey ?? null, kit_id: l.kitId ?? null, quantidade: l.quantidade, beneficiario_id: l.beneficiarioId }))
    }
  });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { id: string; versao: number; numero: number };
}

export type AcaoPedido = 'MINUTA' | 'OFICIO' | 'DIVERGENCIA' | 'CONFERIDO' | 'SOLICITADO' | 'AUTORIZADO' | 'CGOFI' | 'EMPENHADO' | 'CONTRATACAO' | 'ACRESCENTAR_SEI';

export async function avancarPedidoEmenda(id: string, versao: number, acao: AcaoPedido, dados: Record<string, unknown>): Promise<{ id: string; versao: number }> {
  const { data, error } = await db().rpc('avancar_pedido_emenda', { p_id: id, p_versao: versao, p_acao: acao, p_dados: dados });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { id: string; versao: number };
}

/** Dia (AAAA-MM-DD) de um instante no horário de Brasília. */
const diaEmBrasilia = (instante: string): string => new Date(instante).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/**
 * Solicitação de autorização de empenho de uma ata do pedido (migrations 178 a 180): o número SEI, se a Diretora do
 * FNSP já assinou, o dia, e as linhas do pedido que ela cobre. Com `substitui`, troca essa solicitação da ata (a nova
 * herda as linhas); sem ele, entra a mais (nova rodada). Sem `linhas`, a solicitação única da ata cobre todas as
 * linhas da ata. O banco recusa número já ligado a outra ata e linha de outra ata.
 */
export async function informarSolicitacaoDaAta(v: {
  pedidoId: string;
  ataKey: string;
  documentoSei: string;
  assinadaEm: string | null;
  substitui?: string | null;
  linhas?: Array<{ linhaId: string; quantidade?: number }> | null;
}): Promise<void> {
  const { error } = await db().rpc('informar_solicitacao_da_ata', {
    p_id: v.pedidoId,
    p_ata: v.ataKey,
    p_documento_sei: v.documentoSei,
    p_assinada_em: v.assinadaEm,
    p_substitui: v.substitui ?? null,
    p_linhas: v.linhas ? v.linhas.map((l) => ({ linha_id: l.linhaId, quantidade: l.quantidade ?? null })) : null
  });
  if (error) throw new Error(mensagemDoBanco(error));
}

/** Envio à CGOFI de uma ou mais solicitações assinadas (migration 193); o primeiro leva o pedido a "Enviado à CGOFI". */
export async function registrarEnvioCgofi(v: { pedidoId: string; documentoSei: string; enviadoEm: string; solicitacoes: string[] }): Promise<void> {
  const { error } = await db().rpc('registrar_envio_cgofi', {
    p_id: v.pedidoId,
    p_documento_sei: v.documentoSei,
    p_enviado_em: v.enviadoEm,
    p_solicitacoes: v.solicitacoes
  });
  if (error) throw new Error(mensagemDoBanco(error));
}

/**
 * Anulação de empenho (migration 203): as linhas marcadas voltam à interlocução. Se são todas as linhas ativas, o pedido
 * volta a "Itens reservados"; senão, vão para um pedido novo ligado a este. Com destino CANCELAR (migration 208), as
 * linhas só são canceladas (todas: o pedido inteiro).
 */
export async function registrarAnulacaoEmpenho(v: {
  pedidoId: string;
  versao: number;
  linhas: string[];
  documentoSei: string;
  data: string;
  motivo: string;
  destino: 'INTERLOCUCAO' | 'CANCELAR';
}): Promise<{ id: string; versao: number; total: boolean; novoPedidoId: string | null; novoNumero: number | null }> {
  const { data, error } = await db().rpc('registrar_anulacao_empenho', {
    p_id: v.pedidoId,
    p_versao: v.versao,
    p_dados: { linhas: v.linhas, documento_sei: v.documentoSei, data: v.data, motivo: v.motivo, destino: v.destino }
  });
  if (error) throw new Error(mensagemDoBanco(error));
  const r = data as Record<string, any>;
  return { id: r.id, versao: r.versao, total: Boolean(r.total), novoPedidoId: r.novo_pedido_id ?? null, novoNumero: r.novo_numero ?? null };
}

export async function cancelarPedidoEmenda(id: string, versao: number, motivo: string): Promise<{ id: string; versao: number }> {
  const { data, error } = await db().rpc('cancelar_pedido_emenda', { p_id: id, p_versao: versao, p_motivo: motivo });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { id: string; versao: number };
}

/** Execução de cada emenda pelo Portal da Transparência (migration 204). Antes da migration a tabela não existe: lista vazia. */
export async function fetchExecucaoEmendas(): Promise<ExecucaoNoPortal[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) =>
    db().from('emenda_execucao_portal').select('*').order('codigo').range(de, ate)
  ).catch(() => []);
  return linhas.map((l) => ({
    codigo: l.codigo,
    encontrada: Boolean(l.encontrada),
    valorEmpenhado: l.valor_empenhado == null ? null : num(l.valor_empenhado),
    valorLiquidado: l.valor_liquidado == null ? null : num(l.valor_liquidado),
    valorPago: l.valor_pago == null ? null : num(l.valor_pago),
    lidoEm: l.lido_em ?? null,
    notasSenasp: Array.isArray(l.notas_senasp) ? l.notas_senasp.length : null,
    empenhadoSenasp: l.empenhado_senasp == null ? null : num(l.empenhado_senasp),
    notasSemValor: l.notas_sem_valor == null ? null : num(l.notas_sem_valor)
  }));
}

/** O que os quadros da autorização de empenho usam da ata (Compras.gov.br e ata assinada). */
export interface DadosDaAtaParaAutorizacao {
  numeroAta: string;
  codigoUasg: string;
  modalidade: string | null;
  numeroCompra: string | null;
  anoCompra: string | null;
  papelSenasp: string | null;
  fornecedorNome: string | null;
  fornecedorDocumento: string | null;
  /** Documento SEI da ata assinada (informado na quantidade da ata assinada). */
  ataAssinadaSei: string | null;
}

/** Dados da ata para os quadros da autorização (ataKey = "00031/2025-200331"). */
export async function fetchDadosDaAtaParaAutorizacao(ataKey: string): Promise<DadosDaAtaParaAutorizacao> {
  const [numeroAta, codigoUasg] = ataKey.split('-');
  const { data: ata, error } = await db()
    .from('atas_registro_preco')
    .select('id, numero_ata, codigo_uasg, modalidade, numero_compra, ano_compra, papel_senasp')
    .eq('numero_ata', numeroAta)
    .eq('codigo_uasg', codigoUasg)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(mensagemDoBanco(error));
  const [{ data: item }, { data: assinada }] = await Promise.all([
    ata
      ? db().from('itens_ata').select('fornecedor_razao_social, fornecedor_cnpj_cpf').eq('ata_id', ata.id).not('fornecedor_razao_social', 'is', null).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    db().from('ata_item_assinada_registros').select('documento_sei, informado_em').like('item_key', `${ataKey}-%`).order('informado_em', { ascending: false }).limit(1).maybeSingle()
  ]);
  return {
    numeroAta,
    codigoUasg,
    modalidade: ata?.modalidade ?? null,
    numeroCompra: ata?.numero_compra ?? null,
    anoCompra: ata?.ano_compra ?? null,
    papelSenasp: ata?.papel_senasp ?? null,
    fornecedorNome: (item as Record<string, any> | null)?.fornecedor_razao_social ?? null,
    fornecedorDocumento: (item as Record<string, any> | null)?.fornecedor_cnpj_cpf ?? null,
    ataAssinadaSei: (assinada as Record<string, any> | null)?.documento_sei ?? null
  };
}

/** Reservado a parlamentares por item (pedidos não cancelados, kits abertos). */
export async function fetchReservadoPorItem(): Promise<Map<string, number>> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('v_emendas_reservado_por_item').select('item_key, reservado').order('item_key').range(de, ate));
  return new Map(linhas.map((r) => [r.item_key as string, num(r.reservado)]));
}

/**
 * Como a nota da linha foi achada: pelo documento SEI da nota no pedido (migration 177), pelo plano interno da nota
 * (migration 164) ou, sem contrato, pela emenda e pelo fornecedor da ata (migration 188).
 */
export type RegraDaNota = 'SEI' | 'CONTRATO' | 'ITEM' | 'FORNECEDOR' | 'AUTOR';
/** Por que a linha empenhada ainda não tem nota. */
export type MotivoSemNota = 'SEM_CONTRATO' | 'CONTRATO_FORA' | 'CONTRATO_SEM_NOTA' | 'OUTRAS_EMENDAS' | 'VARIAS' | 'SEM_EMENDA';

export interface NotaDaLinha {
  linhaId: string;
  nota: string | null;
  regra: RegraDaNota | null;
  motivo: MotivoSemNota | null;
  contractKey: string | null;
  empenhoId: string | null;
  valorEmpenhado: number | null;
  valorLiquidado: number | null;
  valorPago: number | null;
  entregaPrevista: string | null;
  entregaPrevistaValor: number | null;
  /** Data de emissão da nota ligada (migration 189). */
  emitidaEm: string | null;
  atualizadoEm: string | null;
}

const numOuNulo = (v: unknown) => (v == null ? null : num(v));

/**
 * Nota de empenho e execução de cada linha empenhada, refeitas de hora em hora (migration 164). Desde a migration 189,
 * também a linha de pedido ainda sem o empenho registrado cuja nota a CGOFI já emitiu.
 */
export async function fetchNotasDasLinhas(): Promise<Map<string, NotaDaLinha>> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_linha_notas').select('*').order('linha_id').range(de, ate));
  return new Map(
    linhas.map((r) => [
      r.linha_id as string,
      {
        linhaId: r.linha_id,
        nota: r.nota ?? null,
        regra: r.regra ?? null,
        motivo: r.motivo ?? null,
        contractKey: r.contract_key ?? null,
        empenhoId: r.empenho_id ?? null,
        valorEmpenhado: numOuNulo(r.valor_empenhado),
        valorLiquidado: numOuNulo(r.valor_liquidado),
        valorPago: numOuNulo(r.valor_pago),
        entregaPrevista: r.entrega_prevista ?? null,
        entregaPrevistaValor: numOuNulo(r.entrega_prevista_valor),
        emitidaEm: r.emitida_em ?? null,
        atualizadoEm: r.atualizado_em ?? null
      }
    ])
  );
}

/**
 * Empenhado × pedido (migration 187): por emenda e item, a soma das linhas dos pedidos já empenhados e a soma das
 * notas da emenda lidas no Portal da Transparência. A_MAIS é certeza; A_MENOS só quando todas as notas do SEI estão no
 * sistema e lidas; A_CONFERIR quando falta nota, há nota não lida, nota por valor ou item sem ata.
 */
export type SituacaoConferencia = 'IGUAL' | 'A_MAIS' | 'A_MENOS' | 'A_CONFERIR' | 'SEM_NOTA';

export interface ConferenciaEmpenho {
  emenda: string;
  itemKey: string;
  qtdPedido: number;
  qtdNasNotas: number;
  notas: string[];
  pedidos: number[];
  pedidoIds: string[];
  situacao: SituacaoConferencia;
  notasFora: string[];
  notasNaoLidas: string[];
  notasPorValor: string[];
  notasComItemSemAta: string[];
}

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export async function fetchConferenciaEmpenho(): Promise<ConferenciaEmpenho[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) =>
    db().from('v_emendas_empenho_x_pedido').select('*').order('emenda').order('item_key').range(de, ate)
  );
  return linhas.map((r) => ({
    emenda: r.emenda,
    itemKey: r.item_key,
    qtdPedido: num(r.qtd_pedido),
    qtdNasNotas: num(r.qtd_nas_notas),
    notas: lista(r.notas),
    pedidos: Array.isArray(r.pedidos) ? r.pedidos.map(Number) : [],
    pedidoIds: lista(r.pedido_ids),
    situacao: r.situacao,
    notasFora: lista(r.notas_fora),
    notasNaoLidas: lista(r.notas_nao_lidas),
    notasPorValor: lista(r.notas_por_valor),
    notasComItemSemAta: lista(r.notas_com_item_sem_ata)
  }));
}

/** Linha cuja nota ligada tem credor diferente do fornecedor da ata do item, pela raiz do CNPJ (migration 190). */
export interface CredorDiferente {
  linhaId: string;
  pedidoId: string;
  pedido: number;
  emenda: string | null;
  itemKey: string;
  nota: string;
  ug: string;
  credorNome: string | null;
  credorDoc: string | null;
  fornecedorNome: string | null;
  fornecedorDoc: string | null;
}

export async function fetchCredorDiferente(): Promise<CredorDiferente[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) =>
    db().from('v_emendas_credor_diferente').select('*').order('pedido').order('nota').order('linha_id').range(de, ate)
  );
  return linhas.map((r) => ({
    linhaId: r.linha_id,
    pedidoId: r.pedido_id,
    pedido: Number(r.pedido),
    emenda: r.emenda ?? null,
    itemKey: r.item_key,
    nota: r.nota,
    ug: r.ug,
    credorNome: r.credor_nome ?? null,
    credorDoc: r.credor_doc ?? null,
    fornecedorNome: r.fornecedor_nome ?? null,
    fornecedorDoc: r.fornecedor_doc ?? null
  }));
}

/** Pedido com itens do fornecedor da nota sem pedido (migration 211): só sugestão. */
export interface PedidoProvavel {
  pedidoId: string;
  pedidoNumero: number;
  autorId: string | null;
  pedidoEmenda: string | null;
  pedidoEmendaAno: number | null;
  /** Valor dos itens do fornecedor no pedido (quantidade × preço da ata). */
  valorItens: number;
  /** Só dos itens ainda sem nota: é o que a nota pode pagar. */
  valorSemNota: number;
  /** A emenda conferida do pedido tem o mesmo código de autor (4 primeiros dígitos). */
  mesmoCodigo: boolean;
}

/** Nota de material de emenda da UG 200330, do ano, cuja emenda nenhum pedido tem (migrations 190 e 211). */
export interface NotaSemPedido {
  empenhoId: string;
  nota: string;
  ug: string;
  dataEmissao: string | null;
  valorEmpenhado: number;
  credorNome: string | null;
  planoInterno: string | null;
  emenda: string;
  emendaAno: number | null;
  /** Parlamentares dos pedidos com o mesmo código de autor (4 primeiros dígitos da emenda). */
  autoresDoCodigo: string[];
  pedidosDoCodigo: string[];
  /** Pedidos com itens do mesmo fornecedor (migration 211). */
  pedidosProvaveis: PedidoProvavel[];
}

export async function fetchNotasSemPedido(): Promise<NotaSemPedido[]> {
  const [linhas, provaveis] = await Promise.all([
    lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('v_emendas_notas_sem_pedido').select('*').order('emenda').order('nota').range(de, ate)),
    // Antes da migration 211 a view não existe: segue sem os pedidos prováveis.
    lerTodasAsPaginas<Record<string, any>>((de, ate) =>
      db().from('v_emendas_notas_sem_pedido_pedidos').select('*').order('empenho_id').order('pedido_numero').range(de, ate)
    ).catch(() => [])
  ]);
  const provaveisPorNota = new Map<string, PedidoProvavel[]>();
  for (const c of provaveis) {
    provaveisPorNota.set(c.empenho_id, [
      ...(provaveisPorNota.get(c.empenho_id) ?? []),
      {
        pedidoId: c.pedido_id,
        pedidoNumero: Number(c.pedido_numero),
        autorId: c.autor_id ?? null,
        pedidoEmenda: c.pedido_emenda ?? null,
        pedidoEmendaAno: c.pedido_emenda_ano == null ? null : Number(c.pedido_emenda_ano),
        valorItens: num(c.valor_itens),
        valorSemNota: num(c.valor_sem_nota),
        mesmoCodigo: Boolean(c.mesmo_codigo)
      }
    ]);
  }
  return linhas.map((r) => ({
    empenhoId: r.empenho_id,
    nota: r.nota,
    ug: r.ug,
    dataEmissao: r.data_emissao ?? null,
    valorEmpenhado: num(r.valor_empenhado),
    credorNome: r.credor_nome ?? null,
    planoInterno: r.plano_interno ?? null,
    emenda: r.emenda,
    emendaAno: r.emenda_ano == null ? null : Number(r.emenda_ano),
    autoresDoCodigo: lista(r.autores_do_codigo),
    pedidosDoCodigo: lista(r.pedidos_do_codigo),
    pedidosProvaveis: provaveisPorNota.get(r.empenho_id) ?? []
  }));
}

/** OUTRA: mais uma emenda no pedido. TROCA: o nº conferido estava errado e passa a ser este (migration 211). */
export type ModoLigarEmenda = 'OUTRA' | 'TROCA';

export async function ligarEmendaAoPedido(p: {
  pedidoId: string;
  versao: number;
  numero: string;
  ano: number;
  modo: ModoLigarEmenda;
  documentoSei: string | null;
  observacao: string | null;
}): Promise<{ versao: number; linhasComNotaDaEmenda: number }> {
  const { data, error } = await db().rpc('ligar_emenda_ao_pedido', {
    p_pedido_id: p.pedidoId,
    p_versao: p.versao,
    p: { numero: p.numero, ano: p.ano, modo: p.modo, documento_sei: p.documentoSei, observacao: p.observacao }
  });
  if (error) throw new Error(mensagemDoBanco(error));
  const r = (data ?? {}) as Record<string, unknown>;
  return { versao: Number(r.versao), linhasComNotaDaEmenda: Number(r.linhas_com_nota_da_emenda ?? 0) };
}

export async function removerEmendaDoPedido(id: string, versao: number): Promise<void> {
  const { error } = await db().rpc('remover_emenda_do_pedido', { p_id: id, p_versao: versao });
  if (error) throw new Error(mensagemDoBanco(error));
}


// ------------------------------------------------------------------------------
// Emendas vistas no SIOP, contatos e ASPAR dos órgãos (migration 205)
// ------------------------------------------------------------------------------

export type Gnd = 'GND-3' | 'GND-4';

/** Emenda que a CAEP viu no SIOP, com ou sem pedido. */
export interface EmendaSiop {
  id: string;
  ano: number;
  /** 8 dígitos: os 4 do autor e os 4 da emenda. */
  numero: string;
  autorId: string;
  valor: number;
  gnd: Gnd;
  beneficiarioId: string | null;
  objeto: string | null;
  /** Dia em que a CAEP viu a emenda no SIOP: o aviso conta daqui. */
  vistaEm: string;
  observacao: string | null;
  versao: number;
  criadoPorNome: string | null;
}

export type MeioDoContato = 'TELEFONE' | 'WHATSAPP' | 'EMAIL' | 'REUNIAO';

export interface ContatoDaEmenda {
  id: string;
  emendaId: string;
  contatoEm: string;
  comQuem: string;
  meio: MeioDoContato;
  resumo: string;
  criadoPorNome: string | null;
  criadoEm: string;
}

export type OrgaoAspar = 'PM' | 'BM' | 'PC' | 'PCI' | 'SSP';

/** Assessoria parlamentar de um órgão estadual. */
export interface AsparDoOrgao {
  uf: string;
  orgao: OrgaoAspar;
  nome: string;
  cargo: string | null;
  telefone: string | null;
  whatsapp: boolean;
  email: string | null;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
}

export async function fetchEmendasSiop(): Promise<EmendaSiop[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emendas_siop').select('*').order('id').range(de, ate));
  return linhas.map((e) => ({
    id: e.id,
    ano: num(e.ano),
    numero: e.numero,
    autorId: e.autor_id,
    valor: num(e.valor),
    gnd: e.gnd,
    beneficiarioId: e.beneficiario_id ?? null,
    objeto: e.objeto ?? null,
    vistaEm: e.vista_em,
    observacao: e.observacao ?? null,
    versao: e.versao,
    criadoPorNome: e.criado_por_nome ?? null
  }));
}

export async function fetchContatosDasEmendas(): Promise<ContatoDaEmenda[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_siop_contatos').select('*').order('id').range(de, ate));
  return linhas
    .map((c) => ({
      id: c.id,
      emendaId: c.emenda_id,
      contatoEm: c.contato_em,
      comQuem: c.com_quem,
      meio: c.meio,
      resumo: c.resumo,
      criadoPorNome: c.criado_por_nome ?? null,
      criadoEm: c.criado_em
    }))
    .sort((a, b) => a.contatoEm.localeCompare(b.contatoEm) || a.criadoEm.localeCompare(b.criadoEm));
}

export async function fetchAsparDosOrgaos(): Promise<AsparDoOrgao[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_aspar').select('*').order('uf').order('orgao').range(de, ate));
  return linhas.map((a) => ({
    uf: a.uf,
    orgao: a.orgao,
    nome: a.nome,
    cargo: a.cargo ?? null,
    telefone: a.telefone ?? null,
    whatsapp: Boolean(a.whatsapp),
    email: a.email ?? null,
    atualizadoPorNome: a.atualizado_por_nome ?? null,
    atualizadoEm: a.atualizado_em ?? null
  }));
}

export interface EmendaParaSalvar {
  id?: string;
  versao?: number;
  /** Como no SIOP: "2026 4268 0021" ou os 8 dígitos com o ano à parte. */
  numero: string;
  ano: number | null;
  autorId: string;
  valor: number;
  gnd: Gnd;
  beneficiarioId: string | null;
  objeto: string | null;
  vistaEm: string;
  observacao: string | null;
}

export async function salvarEmendaSiop(e: EmendaParaSalvar): Promise<{ id: string; versao: number }> {
  const { data, error } = await db().rpc('salvar_emenda_siop', {
    p: {
      id: e.id ?? null,
      versao: e.versao ?? null,
      numero: e.numero,
      ano: e.ano,
      autor_id: e.autorId,
      valor: e.valor,
      gnd: e.gnd,
      beneficiario_id: e.beneficiarioId,
      objeto: e.objeto,
      vista_em: e.vistaEm,
      observacao: e.observacao
    }
  });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { id: string; versao: number };
}

export async function apagarEmendaSiop(id: string, versao: number): Promise<void> {
  const { error } = await db().rpc('apagar_emenda_siop', { p_id: id, p_versao: versao });
  if (error) throw new Error(mensagemDoBanco(error));
}

export async function registrarContatoEmenda(emendaId: string, c: { contatoEm: string; comQuem: string; meio: MeioDoContato; resumo: string }): Promise<void> {
  const { error } = await db().rpc('registrar_contato_emenda', {
    p_emenda_id: emendaId,
    p: { contato_em: c.contatoEm, com_quem: c.comQuem, meio: c.meio, resumo: c.resumo }
  });
  if (error) throw new Error(mensagemDoBanco(error));
}

/** Nome vazio apaga o contato daquele órgão na UF. */
export async function salvarAsparEmenda(a: { uf: string; orgao: OrgaoAspar; nome: string; cargo: string | null; telefone: string | null; whatsapp: boolean; email: string | null }): Promise<void> {
  const { error } = await db().rpc('salvar_aspar_emenda', {
    p: { uf: a.uf, orgao: a.orgao, nome: a.nome, cargo: a.cargo, telefone: a.telefone, whatsapp: a.whatsapp, email: a.email }
  });
  if (error) throw new Error(mensagemDoBanco(error));
}
