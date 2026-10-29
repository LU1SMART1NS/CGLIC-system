import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { PageContainer } from '../../../design-system/components/PageContainer';
import { PageHeader } from '../../../design-system/components/PageHeader';
import { AppCard } from '../../../design-system/components/AppCard';
import { SectionHeader } from '../../../design-system/components/SectionHeader';
import { NoticeBar } from '../../../design-system/components/NoticeBar';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { AppButton } from '../../../design-system/components/AppButton';
import { SkeletonLoader } from '../../../design-system/components/SkeletonLoader';
import { ErrorState } from '../../../design-system/components/ErrorState';
import { EmptyState } from '../../../design-system/components/EmptyState';
import { useToast } from '../../../design-system/components/Toast';
import { AvisoCarregando } from '../../../design-system';
import { useBackTarget } from '../../../hooks/useDetailOrigin';
import { useCadastroUasgs } from '../../../hooks/useCadastroUasgs';
import { useDepartments } from '../../../hooks/useDepartments';
import { useCompraAMontar, useFornecedorNaReceita, useRascunhoDaAta, useSalvarRascunhoDaAta } from '../../../hooks/useAtasAMontar';
import { controleDaCompra } from '../../../services/atasAMontarService';
import { localDaUasg } from '../../../services/cadastroUasgsSyncService';
import { copiar } from '../../../utils/copiarQuadro';
import { formatCnpj, formatDateBR } from '../../../utils/format';
import { toSentenceCaseIfAllCaps } from '../../../utils/textCase';
import {
  copiaDosQuadros,
  divisaoDoItem,
  ehEstrangeiro,
  emMoeda,
  faltaPreencher,
  formatoDoQuadro3,
  fornecedorDaAta,
  gradeCabe,
  itensDaAta,
  itensQueNaoFecham,
  minimaTexto,
  orgaosDaGrade,
  quadros,
  quantidadeBR,
  somaDosParticipantes,
  sugestaoDaReceita,
  tamanhoDaAta,
  totalDoItem,
  unidadeCurta,
  valorBR,
  type EntradaDosQuadros,
  type ItemDaAta,
  type OrigemDoTexto,
  type RascunhoDaAta
} from '../../../utils/ataAMontarQuadros';
import { SituacaoDaMinuta } from './SituacaoDaMinuta';
import { pregaoDaAta } from './ataAMontarRotas';

/** Sigla da gerenciadora no título do Quadro 2 (como nas atas: "SENASP - UASG 200331 (BRASÍLIA/DF)"). */
const SIGLA_DA_GERENCIADORA: Record<string, string> = { '200331': 'SENASP' };
/** Espera depois da última mudança antes de salvar o rascunho. */
const ESPERA_PARA_SALVAR_MS = 800;

const ORIGEM: Record<OrigemDoTexto, string> = { GESTOR: 'editado', MINUTA: 'minuta do edital', PNCP: 'PNCP', NENHUMA: 'não está na minuta' };

const tabela: React.CSSProperties = { borderCollapse: 'collapse', width: '100%', fontSize: '0.84rem' };
const th: React.CSSProperties = { textAlign: 'center', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'bottom' };
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'middle' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const tdCentro: React.CSSProperties = { ...td, textAlign: 'center', whiteSpace: 'nowrap' };
const tdTotal: React.CSSProperties = { ...tdNum, fontWeight: 700, background: '#f8fafc' };
const fonte: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b' };
const rola: React.CSSProperties = { overflowX: 'auto' };
const grade: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '0.75rem 1rem' };
const opcao: React.CSSProperties = { display: 'flex', gap: '0.4rem', alignItems: 'flex-start', fontSize: '0.86rem' };

/** Campo que grava ao sair (ou com Enter): digitar não salva a cada letra. */
const Campo: React.FC<{
  valor: string;
  onSalvar: (v: string) => void;
  rotulo: string;
  placeholder?: string;
  numero?: boolean;
  largura?: string;
  testId?: string;
  desabilitado?: boolean;
}> = ({ valor, onSalvar, rotulo, placeholder, numero, largura, testId, desabilitado }) => {
  // O valor salvo mudou por fora (ex.: "voltar ao da Receita"): o campo acompanha.
  const [texto, setTexto] = useState(valor);
  const [anterior, setAnterior] = useState(valor);
  if (anterior !== valor) {
    setAnterior(valor);
    setTexto(valor);
  }
  const salvar = () => texto.trim() !== valor && onSalvar(texto.trim());
  return (
    <input
      type="text"
      className="form-input"
      aria-label={rotulo}
      placeholder={placeholder}
      value={texto}
      disabled={desabilitado}
      inputMode={numero ? 'numeric' : undefined}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => e.key === 'Enter' && salvar()}
      data-testid={testId}
      style={{ width: largura ?? '100%', minWidth: numero ? '70px' : '90px', textAlign: numero ? 'right' : undefined, background: valor ? undefined : 'var(--color-warning-bg)' }}
    />
  );
};

const CampoRotulado: React.FC<{ rotulo: string; origem?: React.ReactNode; children: React.ReactNode }> = ({ rotulo, origem, children }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}>
    {rotulo}
    {children}
    {origem && <span style={{ ...fonte, fontWeight: 400 }}>{origem}</span>}
  </label>
);

const inteiro = (s: string) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

/**
 * Montagem da ata antes da publicação (protótipo aprovado em 28/10/2026, D1–D8): fornecedor, os três quadros da ata e
 * a cópia para o SEI. O que o gestor preenche fica no rascunho (salvo sozinho); os números vêm do PNCP.
 */
export const AtaAMontarPage: React.FC = () => {
  const { ano = '', sequencial = '', fornecedor = '' } = useParams();
  const fornecedorNi = decodeURIComponent(fornecedor);
  const controle = controleDaCompra(ano, sequencial);
  const voltar = useBackTarget({ path: '/atas/montar', label: 'Voltar para Atas a montar' });
  const toast = useToast();

  const compraQ = useCompraAMontar(controle);
  const rascunhoQ = useRascunhoDaAta(controle, fornecedorNi);
  const salvar = useSalvarRascunhoDaAta(controle, fornecedorNi);
  const { data: unidadesInternas = [] } = useDepartments();

  // Rascunho em edição: começa do salvo e é gravado sozinho pouco depois de cada mudança.
  const [r, setR] = useState<RascunhoDaAta | null>(null);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [salvoPor, setSalvoPor] = useState<string | null>(null);
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);
  const pendente = useRef(false);
  useEffect(() => {
    if (r === null && rascunhoQ.isSuccess) {
      setR(rascunhoQ.data?.dados ?? {});
      setSalvoEm(rascunhoQ.data?.atualizadoEm ?? null);
      setSalvoPor(rascunhoQ.data?.atualizadoPorNome ?? null);
    }
  }, [r, rascunhoQ.isSuccess, rascunhoQ.data]);
  useEffect(() => {
    if (!r || !pendente.current) return;
    const t = window.setTimeout(() => {
      pendente.current = false;
      salvar.mutate(r, {
        onSuccess: (em) => {
          setSalvoEm(em);
          setSalvoPor(null);
          setErroAoSalvar(null);
        },
        onError: (e) => setErroAoSalvar(e instanceof Error ? e.message : String(e))
      });
    }, ESPERA_PARA_SALVAR_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);
  const mudar = (fn: (atual: RascunhoDaAta) => RascunhoDaAta) => {
    pendente.current = true;
    setR((atual) => fn(atual ?? {}));
  };
  const mudarFornecedor = (campo: keyof NonNullable<RascunhoDaAta['fornecedor']>, valor: string | undefined) =>
    mudar((x) => {
      const f = { ...(x.fornecedor ?? {}) };
      if (valor === undefined) delete f[campo];
      else f[campo] = valor;
      return { ...x, fornecedor: f };
    });
  const mudarItem = (n: number, campo: 'descricao' | 'catmat' | 'marca' | 'valorMoeda', valor: string) =>
    mudar((x) => ({ ...x, itens: { ...(x.itens ?? {}), [n]: { ...(x.itens?.[String(n)] ?? {}), [campo]: valor } } }));
  const mudarQuantidade = (n: number, uasg: string | 'GERENCIADOR', valor: number) =>
    mudar((x) => {
      const atual = x.quantidades?.[String(n)] ?? {};
      const novo = uasg === 'GERENCIADOR' ? { ...atual, gerenciador: valor } : { ...atual, participantes: { ...(atual.participantes ?? {}), [uasg]: valor } };
      return { ...x, quantidades: { ...(x.quantidades ?? {}), [n]: novo } };
    });

  const compra = compraQ.data ?? null;
  const rascunho = useMemo<RascunhoDaAta>(() => r ?? {}, [r]);
  const estrangeiro = ehEstrangeiro(fornecedorNi);
  const cnpjDaReceita = estrangeiro ? rascunho.fornecedor?.cnpjBrasil ?? null : fornecedorNi;
  const receitaQ = useFornecedorNaReceita(cnpjDaReceita);
  const rf = receitaQ.data ?? null;

  const itens = useMemo(() => (compra ? itensDaAta(compra.itens, compra.minuta, fornecedorNi, rascunho) : []), [compra, fornecedorNi, rascunho]);
  const nomePncp = useMemo(() => compra?.itens.flatMap((i) => i.resultados).find((x) => x.fornecedor_ni === fornecedorNi)?.fornecedor_nome ?? '', [compra, fornecedorNi]);
  const uasgs = useMemo(() => [...(compra ? [compra.codigoUasg] : []), ...orgaosDaGrade(itens)], [compra, itens]);
  const cadastro = useCadastroUasgs(uasgs);
  const nomeDoOrgao = (u: string) => cadastro.get(u)?.nome ?? `UASG ${u}`;
  const gerenciadora = useMemo(() => {
    const u = compra?.codigoUasg ?? '200331';
    const c = cadastro.get(u);
    const local = c ? localDaUasg(c) : null;
    return `${SIGLA_DA_GERENCIADORA[u] ?? c?.nome ?? 'Gerenciadora'} - UASG ${u}${local ? ` (${local.toLocaleUpperCase('pt-BR')})` : ''}`;
  }, [compra, cadastro]);
  const forn = fornecedorDaAta(fornecedorNi, nomePncp, rascunho, rf);
  const entrada: EntradaDosQuadros = { itens, rascunho, fornecedorNi, fornecedor: forn, nomeDoOrgao, gerenciadora };

  if (compraQ.isLoading || rascunhoQ.isLoading || (rascunhoQ.isSuccess && r === null)) {
    return (
      <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} aria-busy="true">
        <AvisoCarregando label="Carregando a ata" />
        <SkeletonLoader variant="rectangular" height="80px" count={1} />
        <SkeletonLoader variant="rectangular" height="300px" count={2} />
      </PageContainer>
    );
  }
  if (compraQ.isError || rascunhoQ.isError) {
    return (
      <PageContainer>
        <ErrorState title="Não foi possível carregar a ata a montar" message={(compraQ.error ?? rascunhoQ.error)?.message ?? ''} onRetry={() => void Promise.all([compraQ.refetch(), rascunhoQ.refetch()])} />
      </PageContainer>
    );
  }
  if (!compra || itens.length === 0) {
    return (
      <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <ActionButton action="voltar" label={voltar.label} onClick={voltar.back} size="sm" />
        </div>
        <EmptyState title="Ata a montar não encontrada" description="O pregão ou o fornecedor não está mais na lista: a ata pode já ter sido publicada." />
      </PageContainer>
    );
  }

  const ger = rascunho.modo === 'GERENCIADOR';
  const qs = quadros(entrada);
  const pt = tamanhoDaAta(qs);
  const faltas = faltaPreencher(entrada);
  const naoFecham = itensQueNaoFecham(itens);
  const formato3 = formatoDoQuadro3(entrada);
  const cabeGrade = gradeCabe(entrada);
  const comMarca = rascunho.marca !== false;
  const unidades = rascunho.unidades ?? [];
  const livres = unidadesInternas.filter((u) => u.ativo && !unidades.includes(u.sigla));
  const sugestao = sugestaoDaReceita(rf, estrangeiro);

  const copiarQuadros = async (ns: number[]) => {
    const { html, texto } = copiaDosQuadros(ns.map((n) => qs[n - 1]), qs);
    try {
      await copiar(html, texto);
      toast.success(ns.length > 1 ? 'Três quadros copiados (o fornecedor vai no topo do Quadro 1). Cole no SEI.' : ns[0] === 1 ? 'Quadro 1 copiado com o fornecedor no topo. Cole no SEI.' : 'Quadro copiado. Cole no SEI.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'O navegador não deixou copiar.');
    }
  };

  // Campo do fornecedor que já vem da Receita: o gestor pode trocar e voltar ao da Receita.
  const campoDaReceita = (campo: 'endereco' | 'telefone' | 'email', rotulo: string, placeholder: string) => {
    const daReceita = sugestao[campo];
    const editado = rascunho.fornecedor?.[campo];
    const mexeu = editado !== undefined && editado !== daReceita;
    const origem = mexeu ? (
      daReceita ? (
        <>
          alterado pelo gestor ·{' '}
          <AppButton variant="link" size="xs" onClick={() => mudarFornecedor(campo, undefined)} data-testid={`ata-montar-voltar-receita-${campo}`}>
            voltar ao da Receita
          </AppButton>
        </>
      ) : (
        'preenchido pelo gestor'
      )
    ) : daReceita ? (
      'da Receita'
    ) : estrangeiro && campo === 'endereco' ? (
      'da proposta (endereço no exterior)'
    ) : rf ? (
      'a Receita não traz: preencha'
    ) : (
      ''
    );
    return (
      <CampoRotulado rotulo={rotulo} origem={origem}>
        <Campo valor={editado ?? daReceita} rotulo={rotulo} placeholder={placeholder} onSalvar={(v) => mudarFornecedor(campo, v)} testId={`ata-montar-${campo}`} />
      </CampoRotulado>
    );
  };

  const statusDoSalvo = salvar.isPending
    ? 'Salvando…'
    : salvoEm
      ? `Salvo em ${formatDateBR(salvoEm)} às ${new Date(salvoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${salvoPor ? ` por ${salvoPor}` : ''}`
      : 'O que você preencher é salvo sozinho';

  return (
    <PageContainer style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <ActionButton action="voltar" label={voltar.label} onClick={voltar.back} size="sm" data-testid="ata-montar-voltar" />
      </div>
      <PageHeader
        title={`Ata a montar · Pregão ${pregaoDaAta(compra)}`}
        badge={<SituacaoDaMinuta estado={compra.minutaEstado} aConferir={itens.filter((i) => !i.minutaFecha).length} />}
        subtitle={`${forn.empresa}${compra.objeto ? ` · ${toSentenceCaseIfAllCaps(compra.objeto)}` : ''}`}
        hint="Os números vêm do resultado do pregão e da minuta da ata no edital (PNCP). Complete os campos em amarelo e copie os quadros para o SEI. O que você preencher fica salvo para quem abrir depois."
        icon={<FileText size={26} color="var(--primary)" aria-hidden="true" />}
        actions={
          <>
            <span style={fonte} data-testid="ata-montar-salvo">
              {statusDoSalvo}
            </span>
            <ActionButton action="copiar" label="Copiar os três quadros" onClick={() => void copiarQuadros([1, 2, 3])} data-testid="ata-montar-copiar-tudo" />
          </>
        }
      />

      {erroAoSalvar && (
        <NoticeBar tone="danger" testId="ata-montar-erro-salvar" action={<ActionButton action="salvar" label="Tentar de novo" size="sm" onClick={() =>
                r &&
                salvar.mutate(r, {
                  onSuccess: (em) => {
                    setSalvoEm(em);
                    setErroAoSalvar(null);
                  }
                })
              } />}>
          Não foi possível salvar: {erroAoSalvar}
        </NoticeBar>
      )}
      {compra.minutaEstado === 'SEM_MINUTA' && (
        <NoticeBar tone="warning" testId="ata-montar-sem-minuta">
          O edital publicado no PNCP não traz a minuta da ata com os participantes: o Quadro 3 fica vazio e tudo vai para o gerenciador. Acrescente os órgãos no Quadro 3.
        </NoticeBar>
      )}
      {(compra.minutaEstado === 'PENDENTE' || compra.minutaEstado === 'ERRO') && (
        <NoticeBar tone="warning" testId="ata-montar-minuta-pendente">
          {compra.minutaEstado === 'ERRO' ? 'A leitura da minuta do edital falhou duas vezes.' : 'A minuta do edital ainda não foi lida (a leitura roda de 2 em 2 horas).'} Por enquanto os quadros saem sem os participantes.
        </NoticeBar>
      )}
      {naoFecham.length > 0 ? (
        <NoticeBar tone="warning" testId="ata-montar-nao-fecha">
          Gerenciador + participantes não fecham com a quantidade homologada no{naoFecham.length > 1 ? 's itens' : ' item'} {naoFecham.join(', ')}: confira a quantidade do gerenciador (Quadro 1) e a dos participantes (Quadro 3). A minuta pode ter erro ou o pregão pode ter homologado outra quantidade.
        </NoticeBar>
      ) : (
        <NoticeBar tone="success" testId="ata-montar-fecha">
          Gerenciador + participantes = quantidade homologada em todos os itens.
        </NoticeBar>
      )}
      <NoticeBar tone={faltas.length ? 'warning' : 'success'} testId="ata-montar-falta">
        {faltas.length ? (
          <>
            <b>Falta preencher</b> (dá para copiar assim mesmo; o campo sai em branco): {faltas.join(' · ')}
          </>
        ) : (
          'Todos os campos dos quadros estão preenchidos.'
        )}
      </NoticeBar>

      <AppCard>
        <SectionHeader title="Como distribuir" subtitle={`Os três quadros saem com a letra em ${pt} pt: o maior tamanho em que todos cabem na página do SEI.`} />
        <div role="radiogroup" aria-label="Como distribuir" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
          <label style={opcao}>
            <input type="radio" name="modo" checked={!ger} onChange={() => mudar((x) => ({ ...x, modo: 'HOMOLOGADO' }))} data-testid="ata-montar-modo-homologado" />
            <span>
              <b>Como homologado:</b> cada participante com a quantidade da minuta do edital. Quadros 2 e 3 com a quantidade mínima (10%) e a UASG.
            </span>
          </label>
          <label style={opcao}>
            <input type="radio" name="modo" checked={ger} onChange={() => mudar((x) => ({ ...x, modo: 'GERENCIADOR' }))} data-testid="ata-montar-modo-gerenciador" />
            <span>
              <b>Tudo para o gerenciador:</b> 1 unidade para cada participante e o restante para a SENASP, sem a coluna de quantidade mínima (modelo da ata 55/2024).
            </span>
          </label>
        </div>
      </AppCard>

      <AppCard>
        <SectionHeader title="Fornecedor" subtitle="Na ata, o fornecedor é a primeira linha da tabela do Quadro 1: vai junto quando copia o Quadro 1." />
        <div style={{ ...grade, marginTop: '0.75rem' }}>
          <div>
            <div style={fonte}>Empresa · PNCP</div>
            <b>{nomePncp}</b>
            {estrangeiro && <div style={fonte}>Estrangeira · identificação no PNCP {fornecedorNi}</div>}
          </div>
          {estrangeiro ? (
            <CampoRotulado rotulo="CNPJ no Brasil" origem="Está na proposta ou no SICAF. Com ele, o sistema busca a Receita.">
              <Campo valor={rascunho.fornecedor?.cnpjBrasil ?? ''} rotulo="CNPJ no Brasil" placeholder="00.000.000/0000-00" onSalvar={(v) => mudarFornecedor('cnpjBrasil', v)} testId="ata-montar-cnpj-brasil" />
            </CampoRotulado>
          ) : (
            <div>
              <div style={fonte}>CNPJ · PNCP</div>
              <b>{formatCnpj(fornecedorNi)}</b>
            </div>
          )}
          {rf ? (
            <div>
              <div style={fonte}>Receita{rf.situacaoCadastral ? ` · situação ${rf.situacaoCadastral.toLocaleLowerCase('pt-BR')}` : ''}</div>
              <b>{rf.razaoSocial}</b>
            </div>
          ) : receitaQ.isError ? (
            <div style={{ ...fonte, color: 'var(--color-warning-text-strong)' }}>{(receitaQ.error as Error).message}</div>
          ) : receitaQ.isFetching ? (
            <div style={fonte}>Consultando a Receita…</div>
          ) : null}
          {campoDaReceita('endereco', 'Endereço para a ata', estrangeiro ? 'da proposta (endereço no exterior)' : 'da proposta')}
          {campoDaReceita('telefone', 'Telefone', 'da proposta')}
          {campoDaReceita('email', 'E-mail', 'da proposta')}
          <CampoRotulado rotulo="Representante (nome e SEI)">
            <Campo valor={rascunho.fornecedor?.representante ?? ''} rotulo="Representante" placeholder="ex.: Fulano (36773561)" onSalvar={(v) => mudarFornecedor('representante', v)} testId="ata-montar-representante" />
          </CampoRotulado>
          <CampoRotulado rotulo="Telefone do representante (se houver)">
            <Campo valor={rascunho.fornecedor?.representanteTelefone ?? ''} rotulo="Telefone do representante" placeholder="opcional" onSalvar={(v) => mudarFornecedor('representanteTelefone', v)} />
          </CampoRotulado>
          <CampoRotulado rotulo="E-mail do representante (se houver)">
            <Campo valor={rascunho.fornecedor?.representanteEmail ?? ''} rotulo="E-mail do representante" placeholder="opcional" onSalvar={(v) => mudarFornecedor('representanteEmail', v)} />
          </CampoRotulado>
          {estrangeiro && (
            <CampoRotulado rotulo="Moeda da proposta (se houver)" origem="Com ela, o Quadro 1 mostra o valor também na moeda: “R$ 1.416,97 (€ 240,87)”.">
              <Campo valor={rascunho.fornecedor?.moeda ?? ''} rotulo="Moeda da proposta" placeholder="ex.: €" onSalvar={(v) => mudarFornecedor('moeda', v)} />
            </CampoRotulado>
          )}
          <CampoRotulado rotulo="Nº da ata">
            <Campo valor={rascunho.numeroAta ?? ''} rotulo="Nº da ata" placeholder="ex.: 43/2026" onSalvar={(v) => mudar((x) => ({ ...x, numeroAta: v }))} />
          </CampoRotulado>
          <CampoRotulado rotulo="SEI da proposta comercial">
            <Campo valor={rascunho.seiProposta ?? ''} rotulo="SEI da proposta comercial" placeholder="ex.: 36839082" onSalvar={(v) => mudar((x) => ({ ...x, seiProposta: v }))} />
          </CampoRotulado>
        </div>
      </AppCard>

      <AppCard>
        <SectionHeader
          title="Quadro 1 · Preços, especificações e quantitativos"
          actions={<ActionButton action="copiar" label="Copiar quadro" size="sm" onClick={() => void copiarQuadros([1])} data-testid="ata-montar-copiar-1" />}
        />
        <label style={{ ...opcao, alignItems: 'center', margin: '0.5rem 0' }}>
          <input type="checkbox" checked={comMarca} onChange={(e) => mudar((x) => ({ ...x, marca: e.target.checked }))} data-testid="ata-montar-com-marca" />
          <span>
            Informar <b>marca / modelo</b> na ata
          </span>
        </label>
        <div style={rola}>
          <table style={tabela} data-testid="ata-montar-quadro-1">
            <thead>
              <tr>
                <th style={th}>Item</th>
                <th style={{ ...th, minWidth: '240px' }}>Descrição</th>
                {comMarca && <th style={th}>Marca/modelo</th>}
                <th style={th}>CATMAT</th>
                <th style={th}>Und</th>
                <th style={th}>Qtd gerenciador</th>
                <th style={th}>Qtd partícipes</th>
                <th style={th}>Qtd total</th>
                <th style={th}>Valor unitário (R$)</th>
                <th style={th}>Valor total (R$)</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => {
                const m = emMoeda(fornecedorNi, rascunho, i);
                return (
                  <tr key={i.numero}>
                    <td style={tdCentro}>{i.numero}</td>
                    <td style={{ ...td, minWidth: '280px' }}>
                      <Campo valor={i.descricao} rotulo={`Descrição do item ${i.numero}`} onSalvar={(v) => mudarItem(i.numero, 'descricao', v)} testId={`ata-montar-descricao-${i.numero}`} />
                      <div style={fonte}>{ORIGEM[i.origemDescricao]}</div>
                    </td>
                    {comMarca && (
                      <td style={td}>
                        <Campo valor={rascunho.itens?.[String(i.numero)]?.marca ?? ''} rotulo={`Marca/modelo do item ${i.numero}`} placeholder="da proposta" onSalvar={(v) => mudarItem(i.numero, 'marca', v)} />
                      </td>
                    )}
                    <td style={tdCentro}>
                      <Campo valor={i.catmat} rotulo={`CATMAT do item ${i.numero}`} placeholder="código" numero largura="90px" onSalvar={(v) => mudarItem(i.numero, 'catmat', v)} testId={`ata-montar-catmat-${i.numero}`} />
                      <div style={fonte}>{ORIGEM[i.origemCatmat]}</div>
                    </td>
                    <td style={tdCentro}>{unidadeCurta(i.unidade)}</td>
                    <td style={tdNum}>
                      {ger ? (
                        quantidadeBR(i.gerenciador)
                      ) : (
                        <Campo valor={String(i.gerenciador)} rotulo={`Quantidade do gerenciador no item ${i.numero}`} numero largura="90px" onSalvar={(v) => mudarQuantidade(i.numero, 'GERENCIADOR', inteiro(v))} testId={`ata-montar-gerenciador-${i.numero}`} />
                      )}
                    </td>
                    <td style={tdNum}>{quantidadeBR(somaDosParticipantes(i))}</td>
                    <td style={tdNum}>
                      {quantidadeBR(totalDoItem(i))}
                      {totalDoItem(i) !== i.homologada && <div style={{ ...fonte, color: 'var(--color-warning-text-strong)' }}>homologado {quantidadeBR(i.homologada)}</div>}
                    </td>
                    <td style={tdNum}>
                      {valorBR(i.valorUnitario)}
                      {estrangeiro && rascunho.fornecedor?.moeda && (
                        <div style={{ marginTop: '0.25rem' }}>
                          <Campo valor={rascunho.itens?.[String(i.numero)]?.valorMoeda ?? ''} rotulo={`Valor unitário em ${rascunho.fornecedor.moeda}`} placeholder={`em ${rascunho.fornecedor.moeda}`} numero largura="110px" onSalvar={(v) => mudarItem(i.numero, 'valorMoeda', v)} />
                        </div>
                      )}
                    </td>
                    <td style={tdNum}>
                      {valorBR(i.valorTotal)}
                      {m.vt}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={comMarca ? 9 : 8} style={tdTotal}>
                  TOTAL
                </td>
                <td style={tdTotal}>{(qs[0].linhas.at(-1) as { v: string[] }).v[0]}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ ...fonte, marginTop: '0.5rem' }}>
          Descrição e CATMAT vêm da minuta da ata no edital, quando ela traz; o gestor pode trocar. O PNCP não dá o CATMAT antes da ata (o código só aparece no Compras.gov.br depois de publicada).
        </p>
      </AppCard>

      <AppCard>
        <SectionHeader
          title={`Quadro 2 · Órgão gerenciador (${gerenciadora})`}
          actions={<ActionButton action="copiar" label="Copiar quadro" size="sm" onClick={() => void copiarQuadros([2])} data-testid="ata-montar-copiar-2" />}
        />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', margin: '0.5rem 0' }}>
          <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>Unidades internas:</span>
          {unidades.map((u) => (
            <span key={u} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem', fontSize: '0.8rem', fontWeight: 700, padding: '2px 4px 2px 8px', borderRadius: '99px', background: 'var(--color-info-bg)', color: 'var(--primary)' }}>
              {u}
              <ActionButton action="remover" iconOnly size="xs" label={`Tirar ${u}`} onClick={() => mudar((x) => ({ ...x, unidades: (x.unidades ?? []).filter((s) => s !== u) }))} data-testid={`ata-montar-tirar-${u}`} />
            </span>
          ))}
          {livres.length > 0 && (
            <select
              className="form-input"
              aria-label="Adicionar unidade interna"
              value=""
              onChange={(e) => e.target.value && mudar((x) => ({ ...x, unidades: [...(x.unidades ?? []), e.target.value] }))}
              style={{ width: 'auto' }}
              data-testid="ata-montar-adicionar-unidade"
            >
              <option value="">Adicionar unidade interna</option>
              {livres.map((u) => (
                <option key={u.id} value={u.sigla}>
                  {u.sigla} · {u.nomeCompleto}
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={rola}>
          <table style={tabela} data-testid="ata-montar-quadro-2">
            <thead>
              <tr>
                <th style={th}>Item</th>
                <th style={th}>Descrição</th>
                <th style={th}>Und</th>
                {!ger && <th style={th}>Qtd mínima (10%)</th>}
                {unidades.map((u) => (
                  <th key={u} style={th}>
                    {u}
                  </th>
                ))}
                <th style={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => {
                const somaUnidades = unidades.reduce((s, u) => s + divisaoDoItem(rascunho, i.numero, u), 0);
                return (
                  <tr key={i.numero}>
                    <td style={tdCentro}>{i.numero}</td>
                    <td style={td}>{i.descricao}</td>
                    <td style={tdCentro}>{unidadeCurta(i.unidade)}</td>
                    {!ger && <td style={tdNum}>{minimaTexto(i.gerenciador)}</td>}
                    {unidades.map((u) => (
                      <td key={u} style={tdNum}>
                        <Campo
                          valor={rascunho.divisao?.[String(i.numero)]?.[u] != null ? String(rascunho.divisao[String(i.numero)][u]) : ''}
                          rotulo={`${u} no item ${i.numero}`}
                          placeholder="0"
                          numero
                          largura="90px"
                          onSalvar={(v) => mudar((x) => ({ ...x, divisao: { ...(x.divisao ?? {}), [i.numero]: { ...(x.divisao?.[String(i.numero)] ?? {}), [u]: inteiro(v) } } }))}
                          testId={`ata-montar-divisao-${i.numero}-${u}`}
                        />
                      </td>
                    ))}
                    <td style={tdNum}>
                      {quantidadeBR(i.gerenciador)}
                      {unidades.length > 0 && somaUnidades !== i.gerenciador && <div style={{ ...fonte, color: 'var(--color-warning-text-strong)' }}>unidades somam {quantidadeBR(somaUnidades)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ ...fonte, marginTop: '0.5rem' }}>Unidades do cadastro de Unidades Internas. Quando a ata for publicada, essa divisão vira a alocação interna do item.</p>
      </AppCard>

      <QuadroDosParticipantes
        entrada={entrada}
        formato={formato3}
        cabeGrade={cabeGrade}
        nomeDoOrgao={nomeDoOrgao}
        onFormato={(f) => mudar((x) => ({ ...x, formato3: f }))}
        onQuantidade={mudarQuantidade}
        onCopiar={() => void copiarQuadros([3])}
      />
    </PageContainer>
  );
};

const QuadroDosParticipantes: React.FC<{
  entrada: EntradaDosQuadros;
  formato: 'GRADE' | 'LISTA';
  cabeGrade: boolean;
  nomeDoOrgao: (u: string) => string;
  onFormato: (f: 'GRADE' | 'LISTA') => void;
  onQuantidade: (n: number, uasg: string, q: number) => void;
  onCopiar: () => void;
}> = ({ entrada, formato, cabeGrade, nomeDoOrgao, onFormato, onQuantidade, onCopiar }) => {
  const { itens, rascunho } = entrada;
  const ger = rascunho.modo === 'GERENCIADOR';
  const orgaos = orgaosDaGrade(itens).filter((u) => !ger || itens.some((i) => (i.participantes.find((p) => p.uasg === u)?.quantidade ?? 0) > 0));
  const qtd = (i: ItemDaAta, u: string) => i.participantes.find((p) => p.uasg === u)?.quantidade ?? 0;
  const [novaUasg, setNovaUasg] = useState('');
  const [novoItem, setNovoItem] = useState(String(itens[0]?.numero ?? ''));
  const [novaQtd, setNovaQtd] = useState('');
  const podeAcrescentar = /^\d{6}$/.test(novaUasg.trim()) && inteiro(novaQtd) > 0 && novoItem !== '';

  return (
    <AppCard>
      <SectionHeader title="Quadro 3 · Órgãos participantes" actions={<ActionButton action="copiar" label="Copiar quadro" size="sm" onClick={onCopiar} data-testid="ata-montar-copiar-3" />} />
      <div role="radiogroup" aria-label="Formato do quadro" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
        <label style={{ ...opcao, alignItems: 'center' }}>
          <input type="radio" name="formato" checked={formato === 'GRADE'} onChange={() => onFormato('GRADE')} data-testid="ata-montar-formato-grade" />
          <span>
            <b>Em grade:</b> cada órgão uma vez, uma coluna por item
          </span>
        </label>
        <label style={{ ...opcao, alignItems: 'center' }}>
          <input type="radio" name="formato" checked={formato === 'LISTA'} onChange={() => onFormato('LISTA')} data-testid="ata-montar-formato-lista" />
          <span>
            <b>Lista por item:</b> um bloco por item
          </span>
        </label>
      </div>
      {itens.length > 1 && !cabeGrade && (
        <NoticeBar tone={formato === 'GRADE' ? 'warning' : 'info'} testId="ata-montar-grade-nao-cabe">
          {formato === 'GRADE'
            ? `Com ${itens.length} itens a grade não cabe na largura da página do SEI: as colunas vão ficar apertadas. Use a lista por item.`
            : `Com ${itens.length} itens a grade não cabe na largura da página do SEI, por isso o quadro abriu em lista por item.`}
        </NoticeBar>
      )}
      <div style={rola}>
        {formato === 'GRADE' ? (
          <table style={tabela} data-testid="ata-montar-quadro-3">
            <thead>
              <tr>
                <th style={th}>Órgão participante</th>
                <th style={th}>UASG</th>
                {itens.map((i) => (
                  <th key={i.numero} style={th} title={`${i.descricao} · ${unidadeCurta(i.unidade)}`}>
                    Item {i.numero}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgaos.map((u) => (
                <tr key={u}>
                  <td style={td}>{nomeDoOrgao(u)}</td>
                  <td style={tdCentro}>{u}</td>
                  {itens.map((i) => {
                    const q = qtd(i, u);
                    return (
                      <td key={i.numero} style={tdNum}>
                        {q ? quantidadeBR(q) : '-'}
                        {q > 0 && !ger && minimaTexto(q) !== '-' && <div style={fonte}>mín. {minimaTexto(q)}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td colSpan={2} style={tdTotal}>
                  TOTAL
                </td>
                {itens.map((i) => (
                  <td key={i.numero} style={tdTotal}>
                    {quantidadeBR(somaDosParticipantes(i))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        ) : (
          <table style={tabela} data-testid="ata-montar-quadro-3">
            <thead>
              <tr>
                <th style={th}>Item</th>
                <th style={th}>Órgão participante</th>
                <th style={th}>UASG</th>
                {!ger && <th style={th}>Qtd mínima (10%)</th>}
                <th style={th}>Qtd</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <React.Fragment key={i.numero}>
                  {i.participantes
                    .filter((p) => !ger || p.quantidade > 0)
                    .map((p) => (
                      <tr key={`${i.numero}-${p.uasg}`}>
                        <td style={tdCentro}>{i.numero}</td>
                        <td style={td}>{nomeDoOrgao(p.uasg)}</td>
                        <td style={tdCentro}>{p.uasg}</td>
                        {!ger && <td style={tdNum}>{p.quantidade ? minimaTexto(p.quantidade) : '-'}</td>}
                        <td style={tdNum}>
                          {ger ? (
                            quantidadeBR(p.quantidade)
                          ) : (
                            <Campo valor={String(p.quantidade)} rotulo={`Quantidade de ${p.uasg} no item ${i.numero}`} numero largura="90px" onSalvar={(v) => onQuantidade(i.numero, p.uasg, inteiro(v))} testId={`ata-montar-participante-${i.numero}-${p.uasg}`} />
                          )}
                        </td>
                      </tr>
                    ))}
                  <tr>
                    <td colSpan={ger ? 3 : 4} style={tdTotal}>
                      TOTAL DO ITEM {i.numero}
                    </td>
                    <td style={tdTotal}>{quantidadeBR(somaDosParticipantes(i))}</td>
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {formato === 'GRADE' && !ger && <p style={{ ...fonte, marginTop: '0.5rem' }}>Para corrigir a quantidade de um órgão, use a lista por item.</p>}
      {!ger && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '0.75rem' }}>
          <CampoRotulado rotulo="Acrescentar órgão (UASG)">
            <input className="form-input" value={novaUasg} onChange={(e) => setNovaUasg(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 dígitos" style={{ width: '110px' }} aria-label="UASG do órgão" data-testid="ata-montar-nova-uasg" />
          </CampoRotulado>
          <CampoRotulado rotulo="Item">
            <select className="form-input" value={novoItem} onChange={(e) => setNovoItem(e.target.value)} style={{ width: 'auto' }} aria-label="Item">
              {itens.map((i) => (
                <option key={i.numero} value={i.numero}>
                  Item {i.numero}
                </option>
              ))}
            </select>
          </CampoRotulado>
          <CampoRotulado rotulo="Quantidade">
            <input className="form-input" value={novaQtd} onChange={(e) => setNovaQtd(e.target.value)} inputMode="numeric" style={{ width: '100px', textAlign: 'right' }} aria-label="Quantidade" data-testid="ata-montar-nova-qtd" />
          </CampoRotulado>
          <ActionButton
            action="adicionar"
            size="sm"
            disabled={!podeAcrescentar}
            onClick={() => {
              onQuantidade(Number(novoItem), novaUasg.trim(), inteiro(novaQtd));
              setNovaUasg('');
              setNovaQtd('');
            }}
            data-testid="ata-montar-acrescentar"
          />
        </div>
      )}
    </AppCard>
  );
};
