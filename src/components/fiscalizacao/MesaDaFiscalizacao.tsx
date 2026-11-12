import React, { useMemo, useState } from 'react';
import { AppButton } from '../../design-system/components/AppButton';
import { StatusBadge } from '../../design-system/components/StatusBadge';
import { NumeroSeiEtiqueta } from '../../design-system/components/NumeroSeiEtiqueta';
import { RowActionsMenu } from '../../design-system/components/RowActionsMenu';
import { CarteiraDetailLabel } from '../carteira/CarteiraDetailLabel';
import { carteiraDetalhe, carteiraNumero } from '../carteira/carteiraStyles';
import { useAuth } from '../../context/AuthContext';
import { useEntregasFiscalizacao, useFiscalizacaoDoContrato } from '../../hooks/useFiscalizacao';
import type { EntregaFiscalizacao, EtapaEntrega } from '../../services/fiscalizacaoService';
import { NOME_SFC, autuado, dataBR, ehDoFiscal } from '../../utils/fiscalizacao';
import { nomeDoItem, prazoDaEntrega, rotuloDoBeneficiario } from '../../utils/fiscalizacaoEntregas';
import { EncerrarEntregasModal, PrevistaModal } from './EntregasModais';
import { AvancarEtapaModal } from './EtapaModais';
import { comQuemEstaOItem, itens, linhaDeCadastro, linhaDeLigacao, linhasDoContrato, type Linha } from '../../utils/fiscalizacaoMesa';
import { FiltroPendencia, MaisSemPendencia, SecaoDaMesa, type LinhaDeTrabalho } from '../mesa/MesaDeTrabalho';
import { blocoDaMesa as bloco } from '../mesa/mesaEstilos';
import { LigarItemDaAtaModal } from './LigarItemDaAtaModal';
import { LigarBeneficiarioModal } from './LigarBeneficiarioModal';
import { DefinirFiscalizacaoModal, RegistrarProcessoModal, RegistrarSeiDoContratoModal } from './FiscalizacaoModais';
import { JanelaDoItem } from './JanelaDoItem';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DataTable } from '../../design-system/components/DataTable';
import { CelulaItem, CelulaSituacaoDoItem } from './EntregasTabela';
import { ordemDaSituacao } from '../../utils/fiscalizacaoResumo';

type Janela = { tipo: 'etapa' | 'prevista' | 'encerrar'; itens: EntregaFiscalizacao[]; inicial?: EtapaEntrega } | { tipo: 'item'; item: EntregaFiscalizacao } | { tipo: 'processo' } | { tipo: 'sei' } | { tipo: 'quem' } | { tipo: 'ligar' } | { tipo: 'cadastro' } | null;

const chaveDoGrupo = (g: EntregaFiscalizacao[]) => g[0].beneficiarioId ?? `planilha:${g[0].beneficiarioTexto}`;
/** Acima disto, a lista abre só nos beneficiários com pendência (como o Andamento do Pedido 360). */
const GRUPOS_SEM_FILTRO = 5;
const paraTela = (l: Linha): LinhaDeTrabalho => ({
  ...l,
  prazo: l.prazo && l.prazo !== '—' ? l.prazo : null,
  botoes: l.acoes.map((a) => ({ rotulo: a.rotulo, jeito: a.principal ? 'botao' : 'link', onClick: a.faz, testId: `fisc-mesa-${l.chave}-${a.rotulo}` }))
});
const linhaTestId = (l: LinhaDeTrabalho) => `fisc-mesa-${l.chave}`;

const Campo: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rotulo}</div>
    <div style={{ fontSize: '0.88rem', fontWeight: 600, marginTop: '0.1rem' }}>{children}</div>
  </div>
);

/**
 * Contrato 360 › Fiscalização como mesa de trabalho (o mesmo desenho da aba Andamento do Pedido 360): uma faixa com
 * quem fiscaliza; Com você (o próximo passo, juntando os itens que estão no mesmo ponto, com o botão que age em todos);
 * Com outros (CAEP, Exército, fornecedor, financeiro, área requisitante); e Onde está cada item, por beneficiário,
 * com a régua. O item abre a janela do item. O histórico do contrato fica na aba Histórico.
 */
export const MesaDaFiscalizacao: React.FC<{ contractKey: string }> = ({ contractKey }) => {
  const { user, role } = useAuth();
  const { contrato: c } = useFiscalizacaoDoContrato(contractKey);
  const { data: es = [] } = useEntregasFiscalizacao(contractKey);
  const [janela, setJanela] = useState<Janela>(null);
  const coordenador = role === 'admin';
  const podeAgir = Boolean(c && (coordenador || (role === 'gestor_fiscalizacao' && ehDoFiscal(c, user?.id))));
  const { comVoce, comOutros } = useMemo(() => {
    const r = linhasDoContrato(es, Boolean(c && !autuado(c)), (tipo, l, inicial) => setJanela({ tipo, itens: l, inicial }), () => setJanela({ tipo: 'processo' }));
    // Itens da planilha sem item da ata (migration 268): com o fiscal quando o contrato já tem itens de ata; senão, espera a Vinculação.
    const linha = linhaDeLigacao(es, Boolean(c?.atas?.length), () => setJanela({ tipo: 'ligar' }));
    if (linha) (linha.tom === 'espera' ? r.comOutros : r.comVoce).unshift(linha);
    // Beneficiário escrito à mão na planilha (migration 272): ligar ao cadastro.
    const cadastro = linhaDeCadastro(es, () => setJanela({ tipo: 'cadastro' }));
    if (cadastro) r.comVoce.unshift(cadastro);
    return r;
  }, [es, c]);
  const grupos = useMemo(() => {
    const m = new Map<string, EntregaFiscalizacao[]>();
    for (const e of es) {
      const k = e.beneficiarioId ?? `planilha:${e.beneficiarioTexto}`;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    // Com pendência primeiro (os com prazo vencido no topo); os que acabaram, por último e fechados (como no Andamento).
    const pendente = (g: EntregaFiscalizacao[]) => g.some((e) => e.responsavel === 'SFC' && comQuemEstaOItem(e) !== 'FIM');
    const vencidos = (g: EntregaFiscalizacao[]) => g.filter((e) => prazoDaEntrega(e).tom === 'danger').length;
    return [...m.values()].sort((a, b) => Number(pendente(b)) - Number(pendente(a)) || vencidos(b) - vencidos(a));
  }, [es]);
  const [soPendentes, setSoPendentes] = useState(true);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  if (!c) return null;
  const fechar = () => setJanela(null);
  const pendentes = grupos.filter((g) => g.some((e) => e.responsavel === 'SFC' && comQuemEstaOItem(e) !== 'FIM'));
  const mostrados = grupos.length > GRUPOS_SEM_FILTRO && soPendentes && pendentes.length ? pendentes : grupos;
  const resto = grupos.length - mostrados.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }} data-testid="fisc-mesa">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.75rem', alignItems: 'flex-start', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)' }} data-testid="fisc-mesa-faixa">
        <Campo rotulo="Fiscalização"><StatusBadge label={c.situacao === 'MISTA' ? 'Mista' : NOME_SFC} variant={c.situacao === 'MISTA' ? 'purple' : 'info'} size="sm" dot={false} /></Campo>
        <Campo rotulo="Fiscal">{c.fiscalNome ?? '—'}</Campo>
        <Campo rotulo="Processo SEI">
          {c.processoNup ? (
            <>
              <NumeroSeiEtiqueta numero={c.processoNup} testId="fisc-mesa-processo" />
              <div style={carteiraDetalhe}>autuado em {dataBR(c.processoAutuadoEm)}</div>
            </>
          ) : (
            <span style={{ color: 'var(--color-warning-text)' }}>a autuar</span>
          )}
        </Campo>
        <Campo rotulo="SEI do contrato">{c.processoSei ? <NumeroSeiEtiqueta numero={c.processoSei} testId="fisc-mesa-sei-contrato" /> : <span style={carteiraDetalhe}>não registrado</span>}</Campo>
        <Campo rotulo="Origem">{c.emendas.length ? `${c.emendas.length === 1 ? 'Emenda' : 'Emendas'} ${c.emendas.slice(0, 3).join(', ')}${c.emendas.length > 3 ? ` +${c.emendas.length - 3}` : ''}` : 'Sem emenda'}</Campo>
        <span style={{ flex: 1 }} />
        {podeAgir && (
          <RowActionsMenu
            label="Mais ações da fiscalização"
            testId="fisc-mesa-mais"
            actions={[
              ...(coordenador ? [{ label: 'Alterar quem fiscaliza', onClick: () => setJanela({ tipo: 'quem' }) }] : []),
              ...(autuado(c) ? [{ label: 'Corrigir a autuação', onClick: () => setJanela({ tipo: 'processo' }) }] : []),
              { label: c.processoSei ? 'Corrigir o SEI do contrato' : 'Registrar o SEI do contrato', onClick: () => setJanela({ tipo: 'sei' }) }
            ]}
          />
        )}
      </div>

      <SecaoDaMesa titulo={`Com ${podeAgir ? 'você' : 'o fiscal'}`} linhas={comVoce.map(paraTela)} testId="fisc-mesa-com-voce" linhaTestId={linhaTestId} destaque vazio={`Nada com ${podeAgir ? 'você' : 'o fiscal'} agora.`} semBotoes={!podeAgir} />

      <SecaoDaMesa titulo="Com outros" linhas={comOutros.map(paraTela)} testId="fisc-mesa-com-outros" linhaTestId={linhaTestId} semBotoes={!podeAgir} />

      <section style={bloco} data-testid="fisc-mesa-itens">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem 1rem' }}>
          <CarteiraDetailLabel>Onde está cada item · {es.length}</CarteiraDetailLabel>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            {grupos.length > GRUPOS_SEM_FILTRO && pendentes.length > 0 && (
              <FiltroPendencia soPendentes={soPendentes} pendentes={pendentes.length} todos={grupos.length} onChange={setSoPendentes} />
            )}
            {mostrados.length > 1 && (
              <span style={{ ...carteiraDetalhe, marginTop: 0, display: 'inline-flex', gap: '0.4rem' }}>
                <AppButton size="xs" variant="link" onClick={() => setAbertos(Object.fromEntries(mostrados.map((g) => [chaveDoGrupo(g), true])))}>Abrir todos</AppButton>·
                <AppButton size="xs" variant="link" onClick={() => setAbertos(Object.fromEntries(mostrados.map((g) => [chaveDoGrupo(g), false])))}>Recolher todos</AppButton>
              </span>
            )}
          </span>
        </div>
        {/* Um bloco por beneficiário, no padrão dos "Itens por ata" do Pedido 360; a régua fica na janela do item. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {mostrados.map((g) => {
            const k = chaveDoGrupo(g);
            const vencidos = g.filter((e) => prazoDaEntrega(e).tom === 'danger').length;
            const noExercito = g.filter((e) => e.etapa === 'CONTROLADO').length;
            const pendente = g.some((e) => e.responsavel === 'SFC' && comQuemEstaOItem(e) !== 'FIM');
            const aberto = abertos[k] ?? pendente;
            const emendas = [...new Set(g.map((e) => e.emenda).filter(Boolean))];
            const umaEmenda = emendas.length === 1 && g.every((e) => e.emenda === emendas[0]) ? emendas[0] : null;
            const un = g.reduce((t, e) => t + e.quantidade, 0);
            const entregues = g.filter((e) => e.entregueEm).reduce((t, e) => t + e.quantidade, 0);
            return (
              <section key={k} className={`emendas-bloco-ata${vencidos ? ' emendas-bloco-ata--pend' : ''}`} data-testid={`fisc-mesa-grupo-${k}`}>
                <button type="button" className="emendas-bloco-ata__cab" aria-expanded={aberto} onClick={() => setAbertos((x) => ({ ...x, [k]: !aberto }))}>
                  {aberto ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                  <span className="emendas-bloco-ata__nome">
                    <strong style={{ color: 'var(--primary)' }}>{g[0].beneficiarioNome ?? rotuloDoBeneficiario(g[0]).principal}</strong>
                    {g[0].beneficiarioSigla && <span className="emendas-bloco-ata__forn"> · {g[0].beneficiarioSigla}</span>}
                    {g[0].municipio && <span className="emendas-bloco-ata__forn"> · {g[0].municipio}/{g[0].uf}</span>}
                    {umaEmenda && <span className="emendas-bloco-ata__forn"> · Emenda {umaEmenda}</span>}
                  </span>
                  <span className="emendas-bloco-ata__num">{itens(g.length)} · {un.toLocaleString('pt-BR')} un · {entregues.toLocaleString('pt-BR')} entregues</span>
                  <span className="emendas-bloco-ata__sit">
                    {vencidos > 0 && <StatusBadge label={vencidos === 1 ? '1 com prazo vencido' : `${vencidos} com prazo vencido`} variant="warning" size="sm" dot={false} />}
                    {noExercito > 0 && <StatusBadge label="aguardando o Exército" variant="danger" size="sm" dot={false} />}
                    {!pendente && <StatusBadge label="concluído" variant="success" size="sm" dot={false} />}
                  </span>
                </button>
                {aberto && (
                  <div className="emendas-bloco-ata__corpo">
                    <DataTable<EntregaFiscalizacao>
                      testId={`fisc-mesa-tabela-${k}`}
                      data={g}
                      keyExtractor={(e) => e.id}
                      className="data-table-container--flush emendas-tabela-topo tabela-colunas-fixas"
                      rowOpen={(e) => () => setJanela({ tipo: 'item', item: e })}
                      columns={[
                        { key: 'item', header: 'Item', minWidth: '260px', width: '60%', priority: 'primary', sortValue: (e) => nomeDoItem(e), render: (e) => <CelulaItem e={e} comOrigem={!umaEmenda} /> },
                        { key: 'qtd', header: 'Qtd.', align: 'right', nowrap: true, width: '10%', sortValue: (e) => e.quantidade, sortFirstDir: 'desc', render: (e) => <span style={carteiraNumero}>{e.quantidade.toLocaleString('pt-BR')}</span> },
                        { key: 'etapa', header: 'Etapa', minWidth: '230px', width: '30%', sortValue: (e) => ordemDaSituacao(e), render: (e) => <CelulaSituacaoDoItem e={e} /> }
                      ]}
                    />
                  </div>
                )}
              </section>
            );
          })}
          <MaisSemPendencia resto={resto} onVerTodos={() => setSoPendentes(false)} />
        </div>
      </section>

      {janela?.tipo === 'etapa' && <AvancarEtapaModal entregas={janela.itens} inicial={janela.inicial} onClose={fechar} />}
      {janela?.tipo === 'prevista' && <PrevistaModal entregas={janela.itens} onClose={fechar} />}
      {janela?.tipo === 'encerrar' && <EncerrarEntregasModal entregas={janela.itens} onClose={fechar} />}
      {janela?.tipo === 'item' && <JanelaDoItem e={janela.item} onClose={fechar} noContrato />}
      {janela?.tipo === 'processo' && <RegistrarProcessoModal contrato={c} onClose={fechar} />}
      {janela?.tipo === 'sei' && <RegistrarSeiDoContratoModal contrato={c} onClose={fechar} />}
      {janela?.tipo === 'ligar' && <LigarItemDaAtaModal contractKey={c.contractKey} contratoNumero={c.numero} onClose={fechar} />}
      {janela?.tipo === 'cadastro' && <LigarBeneficiarioModal contractKey={c.contractKey} onClose={fechar} />}
      {janela?.tipo === 'quem' && <DefinirFiscalizacaoModal contrato={c} onClose={fechar} />}
    </div>
  );
};
