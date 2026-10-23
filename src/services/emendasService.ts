/**
 * Emendas parlamentares — entrega 1 (migration 155): autores, beneficiários, kits e os itens alocados à CAEP.
 *
 * Leitura direto das tabelas (RLS: emendas.view, só coordenador, gestor de emendas e consulta). Gravação só pelas
 * RPCs salvar_beneficiario_emenda e salvar_kit_emenda (emendas.manage), com conferência de versão.
 *
 * CNPJ e CEP são consultados no navegador na hora do cadastro (BrasilAPI, aberta e com CORS; ViaCEP como
 * reserva do CEP). Nada disso é sincronização: o que a pessoa confere é o que grava.
 */
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
}

export interface BeneficiarioEmenda {
  id: string;
  versao: number;
  ativo: boolean;
  cnpj: string;
  razaoSocial: string;
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
  nomeCurto: string;
  entregaCep: string;
  entregaLogradouro: string;
  entregaNumero: string;
  entregaComplemento: string | null;
  entregaBairro: string | null;
  entregaMunicipio: string;
  entregaUf: string;
  responsavelNome: string;
  responsavelCargo: string | null;
  responsavelTelefone: string | null;
  responsavelWhatsapp: boolean;
  responsavelEmail: string | null;
  /** Coluna ÓRGÃO do Anexo da reserva (migration 165), de uma lista fixa; vazio nos cadastros de antes. */
  orgao: string | null;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
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
  /** Informados pela CAEP para o quadro da reserva (migration 165): nome curto, GND e versão desses dados. */
  nomeCurto?: string | null;
  gnd?: 'GND-3' | 'GND-4' | null;
  dadosVersao?: number | null;
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
    db().from('emenda_autores').select('id, tipo, nome, nome_civil, partido, uf, em_exercicio, legislatura, lido_em').order('id').range(de, ate)
  );
  return linhas.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    nome: r.nome,
    nomeCivil: r.nome_civil ?? null,
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
    cnpj: r.cnpj,
    razaoSocial: r.razao_social,
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
    nomeCurto: r.nome_curto,
    entregaCep: r.entrega_cep,
    entregaLogradouro: r.entrega_logradouro,
    entregaNumero: r.entrega_numero,
    entregaComplemento: r.entrega_complemento ?? null,
    entregaBairro: r.entrega_bairro ?? null,
    entregaMunicipio: r.entrega_municipio,
    entregaUf: r.entrega_uf,
    responsavelNome: r.responsavel_nome,
    responsavelCargo: r.responsavel_cargo ?? null,
    responsavelTelefone: r.responsavel_telefone ?? null,
    responsavelWhatsapp: Boolean(r.responsavel_whatsapp),
    responsavelEmail: r.responsavel_email ?? null,
    orgao: r.orgao ?? null,
    atualizadoPorNome: r.atualizado_por_nome ?? null,
    atualizadoEm: r.atualizado_em ?? null
  };
}

export async function fetchBeneficiariosEmendas(): Promise<BeneficiarioEmenda[]> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) =>
    db().from('emenda_beneficiarios').select('*').order('id').range(de, ate)
  );
  return linhas.map(beneficiarioDoBanco).sort((a, b) => a.nomeCurto.localeCompare(b.nomeCurto, 'pt-BR'));
}

export type BeneficiarioParaSalvar = Omit<BeneficiarioEmenda, 'id' | 'versao' | 'atualizadoPorNome' | 'atualizadoEm'> & { id?: string; versao?: number };

export async function salvarBeneficiarioEmenda(b: BeneficiarioParaSalvar): Promise<{ id: string; versao: number }> {
  const { data, error } = await db().rpc('salvar_beneficiario_emenda', {
    p_beneficiario: {
      id: b.id ?? null,
      versao: b.versao ?? null,
      ativo: b.ativo,
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
      responsavel_email: b.responsavelEmail,
      orgao: b.orgao
    }
  });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { id: string; versao: number };
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
    dadosVersao: r.dados_versao ?? null
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

export function formatarCnpj(v: string): string {
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

export type EtapaPedido = 'RESERVADO' | 'MINUTA' | 'OFICIO' | 'CONFERIDO' | 'AUTORIZADO' | 'EMPENHADO' | 'CANCELADO';

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
  notaEmpenho: string | null;
  cancelada: boolean;
  canceladaMotivo: string | null;
  /** Carga das planilhas da CAEP (migration 160): beneficiário pelo nome até o cadastro com CNPJ. */
  beneficiarioNome: string | null;
  /** Documento SEI do empenho; a nota (notaEmpenho) é achada pelo contrato ou pelo Portal. */
  empenhoDocumentoSei: string | null;
  /** Contrato citado na planilha, como 00138/2026. */
  contratoNumero: string | null;
  /** O que não bate entre as planilhas da CAEP nesta linha. */
  aConferir: string | null;
  planilhaRef: string | null;
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
  minutaDocumentoSei: string | null;
  oficioNumero: string | null;
  oficioProcessoSei: string | null;
  oficioEm: string | null;
  divergencia: string | null;
  siopEmenda: string | null;
  siopValor: number | null;
  siopGnd: string | null;
  conferidoEm: string | null;
  autorizadoEm: string | null;
  autorizadoDocumentoSei: string | null;
  empenhadoEm: string | null;
  canceladoEm: string | null;
  canceladoMotivo: string | null;
  versao: number;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
  linhas: LinhaPedido[];
}

export async function fetchPedidosEmendas(): Promise<PedidoEmenda[]> {
  const [pedidos, linhas] = await Promise.all([
    lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_pedidos').select('*').order('numero').range(de, ate)),
    lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('emenda_pedido_linhas').select('*').order('id').range(de, ate))
  ]);
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
      notaEmpenho: l.nota_empenho ?? null,
      cancelada: Boolean(l.cancelada),
      canceladaMotivo: l.cancelada_motivo ?? null,
      beneficiarioNome: l.beneficiario_nome ?? null,
      empenhoDocumentoSei: l.empenho_documento_sei ?? null,
      contratoNumero: l.contrato_numero ?? null,
      aConferir: l.a_conferir ?? null,
      planilhaRef: l.planilha_ref ?? null
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
      oficioProcessoSei: p.oficio_processo_sei ?? null,
      oficioEm: p.oficio_em ?? null,
      divergencia: p.divergencia ?? null,
      siopEmenda: p.siop_emenda ?? null,
      siopValor: p.siop_valor == null ? null : num(p.siop_valor),
      siopGnd: p.siop_gnd ?? null,
      conferidoEm: p.conferido_em ?? null,
      autorizadoEm: p.autorizado_em ?? null,
      autorizadoDocumentoSei: p.autorizado_documento_sei ?? null,
      empenhadoEm: p.empenhado_em ?? null,
      canceladoEm: p.cancelado_em ?? null,
      canceladoMotivo: p.cancelado_motivo ?? null,
      versao: p.versao,
      atualizadoPorNome: p.atualizado_por_nome ?? null,
      atualizadoEm: p.atualizado_em ?? null,
      linhas: (porPedido.get(p.id) ?? []).sort((a, b) => a.ordem - b.ordem)
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
  linhas: LinhaParaSalvar[];
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
      linhas: p.linhas.map((l) => ({ id: l.id ?? null, tipo: l.tipo, item_key: l.itemKey ?? null, kit_id: l.kitId ?? null, quantidade: l.quantidade, beneficiario_id: l.beneficiarioId }))
    }
  });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { id: string; versao: number; numero: number };
}

export type AcaoPedido = 'MINUTA' | 'OFICIO' | 'DIVERGENCIA' | 'CONFERIDO' | 'AUTORIZADO' | 'EMPENHADO';

export async function avancarPedidoEmenda(id: string, versao: number, acao: AcaoPedido, dados: Record<string, unknown>): Promise<{ id: string; versao: number }> {
  const { data, error } = await db().rpc('avancar_pedido_emenda', { p_id: id, p_versao: versao, p_acao: acao, p_dados: dados });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { id: string; versao: number };
}

export async function cancelarPedidoEmenda(id: string, versao: number, motivo: string): Promise<{ id: string; versao: number }> {
  const { data, error } = await db().rpc('cancelar_pedido_emenda', { p_id: id, p_versao: versao, p_motivo: motivo });
  if (error) throw new Error(mensagemDoBanco(error));
  return data as { id: string; versao: number };
}

/** Reservado a parlamentares por item (pedidos não cancelados, kits abertos). */
export async function fetchReservadoPorItem(): Promise<Map<string, number>> {
  const linhas = await lerTodasAsPaginas<Record<string, any>>((de, ate) => db().from('v_emendas_reservado_por_item').select('item_key, reservado').order('item_key').range(de, ate));
  return new Map(linhas.map((r) => [r.item_key as string, num(r.reservado)]));
}

/** Como a nota da linha foi achada pelo plano interno da nota (migration 164). */
export type RegraDaNota = 'CONTRATO' | 'ITEM' | 'AUTOR';
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
  atualizadoEm: string | null;
}

const numOuNulo = (v: unknown) => (v == null ? null : num(v));

/** Nota de empenho e execução de cada linha empenhada, refeitas de hora em hora (migration 164). */
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
        atualizadoEm: r.atualizado_em ?? null
      }
    ])
  );
}
