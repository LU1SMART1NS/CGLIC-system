import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Notas que o Contratos.gov.br não lista em contrato nenhum (migration 256, v_notas_fora_do_contrato). O sistema não
 * vincula à mão (decisão de 04/11/2026): mostra em qual contrato incluir a nota lá, guarda a marca "Vou incluir" do
 * gestor e tira a linha da fila quando a sincronização trouxer a nota num contrato.
 */

export interface ContratoDoFornecedor {
  contractKey: string;
  numero: string;
  assinatura: string | null;
  vigenciaFim: string | null;
  temItemDoPedido: boolean;
  semNotasDaFonte: boolean;
}

export interface NotaForaDoContrato {
  empenhoId: string;
  numero: string;
  uasgEmitente: string;
  ano: number;
  dataEmissao: string | null;
  valorEmpenhado: number;
  credorNome: string | null;
  credorCnpjCpf: string | null;
  /** Contrato em que a Carteira mostra a nota pelo pedido de emenda (origem EMENDA), se houver. */
  contratoPeloPedido: string | null;
  pedidos: Array<{ numero: number; emenda: string | null }>;
  /** Contratos que o pedido aponta e que são de outro fornecedor (o pedido ou a nota estão errados). */
  pedidoDeOutroFornecedor: Array<{ contractKey: string; numero: string; fornecedor: string | null }>;
  /** Contratos do fornecedor (credor da nota), na ordem da sugestão. */
  contratosDoFornecedor: ContratoDoFornecedor[];
  marca: { contractKey: string; observacao: string | null; porNome: string | null; em: string } | null;
}

const PAGINA = 1000;
const COLUNAS =
  'empenho_id, numero_oficial, uasg_emitente, ano_exercicio, data_emissao, valor_empenhado, credor_nome, credor_cnpj_cpf, contrato_pelo_pedido, pedidos, pedido_de_outro_fornecedor, contratos_do_fornecedor, marca_contract_key, marca_observacao, marca_por_nome, marca_em';

const lista = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function linhaNotaForaDoContrato(r: any): NotaForaDoContrato {
  return {
    empenhoId: String(r.empenho_id),
    numero: String(r.numero_oficial),
    uasgEmitente: String(r.uasg_emitente ?? ''),
    ano: Number(r.ano_exercicio ?? 0),
    dataEmissao: r.data_emissao ?? null,
    valorEmpenhado: Number(r.valor_empenhado ?? 0),
    credorNome: r.credor_nome ?? null,
    credorCnpjCpf: r.credor_cnpj_cpf ?? null,
    contratoPeloPedido: r.contrato_pelo_pedido ?? null,
    pedidos: lista(r.pedidos)
      .map((p) => ({ numero: Number(p.numero), emenda: p.emenda ?? null }))
      .sort((a, b) => a.numero - b.numero),
    pedidoDeOutroFornecedor: lista(r.pedido_de_outro_fornecedor).map((c) => ({
      contractKey: String(c.contract_key),
      numero: String(c.numero),
      fornecedor: c.fornecedor ?? null
    })),
    contratosDoFornecedor: lista(r.contratos_do_fornecedor).map((c) => ({
      contractKey: String(c.contract_key),
      numero: String(c.numero),
      assinatura: c.assinatura ?? null,
      vigenciaFim: c.vigencia_fim ?? null,
      temItemDoPedido: Boolean(c.tem_item_do_pedido),
      semNotasDaFonte: Boolean(c.sem_notas_da_fonte)
    })),
    marca: r.marca_contract_key
      ? { contractKey: String(r.marca_contract_key), observacao: r.marca_observacao ?? null, porNome: r.marca_por_nome ?? null, em: String(r.marca_em) }
      : null
  };
}

const semAMigration = (error: { code?: string; message?: string }) =>
  error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find/i.test(error.message ?? '');

/** Linhas da fila. Sem a migration 256 aplicada, a fila fica vazia (e não quebra a tela). */
export async function fetchNotasForaDoContrato(): Promise<NotaForaDoContrato[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const linhas: any[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('v_notas_fora_do_contrato')
      .select(COLUNAS)
      .order('empenho_id', { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) {
      if (semAMigration(error)) return [];
      throw error;
    }
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return linhas.map(linhaNotaForaDoContrato);
}

const mensagem = (error: { message?: string }) => (error.message ?? 'Não foi possível gravar.').replace(/^[A-Z_]+:\s*/, '');

export async function marcarInclusaoNaFonte(p: { empenhoId: string; contractKey: string; observacao: string }): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Banco não configurado.');
  const { error } = await supabase.rpc('marcar_inclusao_nota_na_fonte', {
    p_empenho_id: p.empenhoId,
    p_contract_key: p.contractKey,
    p_observacao: p.observacao || null
  });
  if (error) throw new Error(mensagem(error));
}

export async function desfazerInclusaoNaFonte(p: { empenhoId: string }): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error('Banco não configurado.');
  const { error } = await supabase.rpc('desfazer_inclusao_nota_na_fonte', { p_empenho_id: p.empenhoId });
  if (error) throw new Error(mensagem(error));
}
