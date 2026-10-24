import React, { useCallback, useMemo, useState } from 'react';
import { Modal } from '../../design-system/components/Modal';
import { AppButton } from '../../design-system/components/AppButton';
import { ActionButton } from '../../design-system/components/ActionButton';
import { AppInput, AppSelect, AppTextarea } from '../../design-system/components/FormFields';
import { useToast } from '../../design-system/components/Toast';
import { useSalvarPedido } from '../../hooks/useEmendas';
import { formatCurrency, formatNumber } from '../../utils/format';
import { descricaoItemEmFrase } from '../../utils/textCase';
import { buscarItensCaep, calcularKit, dataBR, diasEntre, limiteDaIndicacao, passouDoCorte, rotuloItemDaAta, ROTULO_SITUACAO_KIT } from '../../utils/emendasKits';
import { identificacaoDoPedido, itensDaLinha, orgaoDoPedido, valorDaLinha, VOLTA_AO_OFICIO } from '../../utils/emendasPedidos';
import { formatarTelefone, localDoBeneficiario, nomeESigla, rotuloBeneficiario, soDigitos } from '../../services/emendasService';
import { LinhaDoPedido } from './emendasPartes';
import type { AutorEmenda, BeneficiarioEmenda, ItemCaep, ItemDoKit, KitEmenda, PedidoEmenda } from '../../services/emendasService';
import { QuadroGabinete } from './QuadroGabinete';

interface Props {
  pedido: PedidoEmenda | null;
  autores: AutorEmenda[];
  itens: ItemCaep[];
  kits: KitEmenda[];
  beneficiarios: BeneficiarioEmenda[];
  /** Reservado por item nos outros pedidos (sem este). */
  reservadoFora: Map<string, number>;
  /** Último contato da assessoria usado com cada autor: sugerido na nova reserva. */
  ultimoContato: Map<string, Pick<PedidoEmenda, 'contatoNome' | 'contatoTelefone' | 'contatoEmail'>>;
  hoje: string;
  onClose: () => void;
}

interface LinhaEdicao {
  chave: string;
  id?: string;
  tipo: 'ITEM' | 'KIT';
  itemKey: string | null;
  kitId: string | null;
  kitNome: string | null;
  kitComposicao: ItemDoKit[] | null;
  quantidade: number;
  beneficiarioId: string | null;
}

const MAX_RESULTADOS = 30;
const rotulo: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' };
const pequeno: React.CSSProperties = { fontSize: '0.75rem', color: 'var(--text-muted)' };
const aviso = (tom: 'erro' | 'info'): React.CSSProperties => ({
  fontSize: '0.8rem',
  fontWeight: 600,
  padding: '0.5rem 0.7rem',
  borderRadius: 6,
  background: tom === 'erro' ? 'var(--color-danger-bg, #fdecea)' : 'var(--color-info-bg, #e6eefb)',
  color: tom === 'erro' ? 'var(--color-danger, #b11b05)' : 'var(--color-info-text, #155bcb)'
});
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const TIPO_AUTOR: Record<AutorEmenda['tipo'], string> = { DEPUTADO: 'Deputado', SENADOR: 'Senador', BANCADA: 'Bancada' };
let seq = 0;

/** Nova reserva ou alteração das linhas de um pedido. A trava de saldo é conferida aqui e de novo no banco. */
export const PedidoModal: React.FC<Props> = ({ pedido, autores, itens, kits, beneficiarios, reservadoFora, ultimoContato, hoje, onClose }) => {
  const salvar = useSalvarPedido();
  const toast = useToast();
  const [autorId, setAutorId] = useState(pedido?.autorId ?? '');
  // Reserva para um órgão (migration 163): nova reserva sem parlamentar, ou reserva que ainda está sem.
  const [paraOrgao, setParaOrgao] = useState(false);
  const semAutorGravado = Boolean(pedido && !pedido.autorId);
  const [buscaAutor, setBuscaAutor] = useState('');
  const [observacao, setObservacao] = useState(pedido?.observacao ?? '');
  const [contatoNome, setContatoNome] = useState(pedido?.contatoNome ?? '');
  const [contatoTelefone, setContatoTelefone] = useState(pedido?.contatoTelefone ? formatarTelefone(pedido.contatoTelefone) : '');
  const [contatoEmail, setContatoEmail] = useState(pedido?.contatoEmail ?? '');
  const [contatoSugerido, setContatoSugerido] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [busca, setBusca] = useState('');
  const [tentou, setTentou] = useState(false);
  const [linhas, setLinhas] = useState<LinhaEdicao[]>(
    () =>
      pedido?.linhas
        .filter((l) => !l.cancelada)
        .map((l) => ({ chave: l.id, id: l.id, tipo: l.tipo, itemKey: l.itemKey, kitId: l.kitId, kitNome: l.kitNome, kitComposicao: l.kitComposicao, quantidade: l.quantidade, beneficiarioId: l.beneficiarioId })) ?? []
  );

  const porChave = useMemo(() => new Map(itens.map((i) => [i.itemKey, i])), [itens]);
  const autor = autores.find((a) => a.id === autorId);
  const saldoAntes = useCallback((k: string) => (porChave.get(k)?.alocado ?? 0) - (reservadoFora.get(k) ?? 0), [porChave, reservadoFora]);
  const ativosBen = beneficiarios.filter((b) => b.ativo).sort((a, b) => rotuloBeneficiario(a).localeCompare(rotuloBeneficiario(b), 'pt-BR'));
  const nomeDoBeneficiario = (id: string) => {
    const b = beneficiarios.find((x) => x.id === id);
    return b ? rotuloBeneficiario(b) : undefined;
  };
  const tituloDoPedido = pedido ? (pedido.autorId ? autor?.nome ?? '' : orgaoDoPedido(pedido, nomeDoBeneficiario) ?? 'órgão') : '';

  const autoresEncontrados = useMemo(() => {
    const t = semAcento(buscaAutor.trim());
    if (!t) return [];
    return autores
      .filter((a) => semAcento(`${a.nome} ${a.nomeCivil ?? ''} ${a.uf ?? ''} ${a.partido ?? ''}`).includes(t))
      .sort((a, b) => Number(b.emExercicio ?? true) - Number(a.emExercicio ?? true) || a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 8);
  }, [autores, buscaAutor]);

  // Kits oferecíveis (ativos e com todos os itens em ata vigente) e itens de ata vigente.
  const kitsOferecidos = useMemo(
    () =>
      kits
        .filter((k) => k.ativo)
        .map((k) => ({ k, c: calcularKit(k, porChave, hoje, (i) => saldoAntes(i.itemKey)) }))
        .filter((x) => x.c.situacao !== 'indisponivel' || x.c.kitsPossiveis > 0),
    [kits, porChave, hoje, saldoAntes]
  );
  const t = semAcento(busca.trim());
  const kitsEncontrados = kitsOferecidos.filter((x) => !t || semAcento(x.k.nome).includes(t));
  const itensEncontrados = buscarItensCaep(
    itens.filter((i) => !i.ataEncerrada),
    busca
  );
  // Ata a menos do corte do fim (migration 162): aparece na busca, mas não pode ser escolhida.
  const foraDoPrazo = (i: ItemCaep) => Boolean(i.vigenciaFinal) && passouDoCorte(diasEntre(hoje, i.vigenciaFinal!));

  // Consumo do saldo por item com as linhas desta tela.
  const consumo = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linhas) if (l.quantidade > 0) for (const x of itensDaLinha(l)) m.set(x.itemKey, (m.get(x.itemKey) ?? 0) + x.quantidade);
    return [...m.entries()].map(([k, q]) => ({ item: porChave.get(k), itemKey: k, saldo: saldoAntes(k), q, fica: saldoAntes(k) - q }));
  }, [linhas, porChave, saldoAntes]);
  const negativo = consumo.some((c) => c.fica < 0);
  const valorTotal = linhas.reduce((s, l) => s + valorDaLinha(l, porChave), 0);
  const tirou = pedido ? pedido.linhas.filter((l) => !l.cancelada && !linhas.some((x) => x.id === l.id)).length : 0;

  const pendencias: string[] = [];
  const exigeBeneficiario = (paraOrgao && !pedido) || (semAutorGravado && !autorId);
  if (!autorId && !pedido && !paraOrgao) pendencias.push('o autor (ou marque reserva para um órgão)');
  if (exigeBeneficiario && linhas.some((l) => !l.beneficiarioId)) pendencias.push('o beneficiário em todas as linhas (é o órgão para quem a reserva foi feita)');
  if (linhas.length === 0) pendencias.push('pelo menos uma linha');
  if (linhas.some((l) => !(Number.isInteger(l.quantidade) && l.quantidade > 0))) pendencias.push('quantidade inteira maior que zero em cada linha');
  if (negativo) pendencias.push('saldo da CAEP em todos os itens');
  const tel = soDigitos(contatoTelefone);
  if (tel && (tel.length < 10 || tel.length > 11)) pendencias.push('telefone do contato com DDD (10 ou 11 números)');
  if (contatoEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contatoEmail.trim())) pendencias.push('e-mail do contato válido');

  /** Escolher o autor sugere o último contato da assessoria usado com ele (só se os campos estiverem vazios). */
  const escolherAutor = (id: string) => {
    setAutorId(id);
    const c = ultimoContato.get(id);
    if (c && !contatoNome && !contatoTelefone && !contatoEmail) {
      setContatoNome(c.contatoNome ?? '');
      setContatoTelefone(c.contatoTelefone ? formatarTelefone(c.contatoTelefone) : '');
      setContatoEmail(c.contatoEmail ?? '');
      setContatoSugerido(true);
    }
  };

  const adicionarItem = (i: ItemCaep) => setLinhas((ls) => [...ls, { chave: `n${++seq}`, tipo: 'ITEM', itemKey: i.itemKey, kitId: null, kitNome: null, kitComposicao: null, quantidade: 1, beneficiarioId: null }]);
  const adicionarKit = (k: KitEmenda) =>
    setLinhas((ls) => [...ls, { chave: `n${++seq}`, tipo: 'KIT', itemKey: null, kitId: k.id, kitNome: k.nome, kitComposicao: k.itens.map((i) => ({ ...i })), quantidade: 1, beneficiarioId: null }]);
  const muda = (chave: string, parcial: Partial<LinhaEdicao>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...parcial } : l)));

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTentou(true);
    if (pendencias.length) return;
    try {
      await salvar.mutateAsync({
        id: pedido?.id,
        versao: pedido?.versao,
        autorId: autorId || null,
        paraOrgao: !pedido && paraOrgao,
        observacao: observacao.trim() || null,
        contatoNome: contatoNome.trim() || null,
        contatoTelefone: tel || null,
        contatoEmail: contatoEmail.trim() || null,
        motivo: motivo.trim() || null,
        linhas: linhas.map((l) => ({ id: l.id, tipo: l.tipo, itemKey: l.itemKey, kitId: l.kitId, quantidade: l.quantidade, beneficiarioId: l.beneficiarioId }))
      });
      const para = autor?.nome ?? (pedido ? orgaoDoPedido(pedido, nomeDoBeneficiario) : null) ?? 'o órgão';
      toast.success(semAutorGravado && autorId ? `Parlamentar indicado: ${autor?.nome ?? ''}.` : pedido ? `Pedido de ${para} atualizado.` : `Reserva para ${para} registrada.`);
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!salvar.isPending}
      size="xl"
      testId="emendas-pedido-modal"
      title={pedido ? `${semAutorGravado ? 'Reserva para' : 'Alterar o pedido de'} ${tituloDoPedido} · ${identificacaoDoPedido(pedido)}` : 'Nova reserva'}
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={salvar.isPending} />
          <AppButton type="submit" form="emendas-pedido-form" disabled={salvar.isPending} isLoading={salvar.isPending} data-testid="emendas-pedido-salvar">
            {pedido ? 'Salvar pedido' : 'Reservar'}
          </AppButton>
        </>
      }
    >
      <form id="emendas-pedido-form" onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={rotulo}>{semAutorGravado ? 'Parlamentar que assumiu a reserva (quando houver)' : 'Autor'}</span>
          {!pedido && (
            <label htmlFor="emendas-pedido-para-orgao" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.6rem 0.75rem', borderRadius: '8px', background: 'var(--color-info-bg)', fontSize: '0.85rem' }}>
              <input
                id="emendas-pedido-para-orgao"
                type="checkbox"
                checked={paraOrgao}
                onChange={(e) => {
                  setParaOrgao(e.target.checked);
                  if (e.target.checked) setAutorId('');
                }}
                style={{ marginTop: '0.2rem' }}
                data-testid="emendas-pedido-para-orgao"
              />
              <span>
                <strong>Reserva para um órgão (parlamentar a definir)</strong>
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#475569' }}>
                  O órgão pediu e a CAEP separa os itens enquanto procura o parlamentar. Informe o órgão como beneficiário de cada linha; o parlamentar é indicado depois, antes da minuta.
                </span>
              </span>
            </label>
          )}
          {paraOrgao ? null : autor ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, padding: '0.55rem 0.75rem' }} data-testid="emendas-pedido-autor">
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{autor.nome}</div>
                <div style={pequeno}>{[TIPO_AUTOR[autor.tipo], autor.partido, autor.uf, autor.emExercicio === false ? 'fora do cargo' : null].filter(Boolean).join(' · ')}</div>
              </div>
              {(!pedido || semAutorGravado) && <ActionButton action="editar" size="sm" label="Trocar" type="button" onClick={() => setAutorId('')} />}
            </div>
          ) : (
            <>
              <AppInput type="search" aria-label="Buscar autor" placeholder="Buscar deputado, senador ou bancada (nome, partido ou UF)" value={buscaAutor} onChange={(e) => setBuscaAutor(e.target.value)} data-testid="emendas-pedido-busca-autor" />
              {autoresEncontrados.length > 0 && (
                <div style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8 }}>
                  {autoresEncontrados.map((a, idx) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.45rem 0.75rem', borderTop: idx ? '1px solid var(--color-border, #f1f5f9)' : undefined }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{a.nome}</div>
                        <div style={pequeno}>{[TIPO_AUTOR[a.tipo], a.partido, a.uf, a.emExercicio === false ? 'fora do cargo' : null].filter(Boolean).join(' · ')}</div>
                      </div>
                      <ActionButton action="confirmar" size="sm" label="Escolher" type="button" onClick={() => escolherAutor(a.id)} data-testid={`emendas-pedido-autor-${a.id}`} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={rotulo}>{paraOrgao || (semAutorGravado && !autorId) ? 'Contato no órgão' : 'Contato na assessoria'}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem' }}>
            <AppInput label="Nome" placeholder="Com quem a CAEP combinou" value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} data-testid="emendas-pedido-contato-nome" />
            <AppInput label="Telefone" inputMode="tel" placeholder="(00) 00000-0000" value={contatoTelefone} onChange={(e) => setContatoTelefone(e.target.value)} onBlur={() => setContatoTelefone(formatarTelefone(contatoTelefone))} data-testid="emendas-pedido-contato-telefone" />
            <AppInput label="E-mail" type="email" placeholder="nome@camara.leg.br" value={contatoEmail} onChange={(e) => setContatoEmail(e.target.value)} />
          </div>
          {contatoSugerido && <span style={pequeno}>Preenchido com o último contato usado com este autor. Confira se continua o mesmo.</span>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={rotulo}>Linhas do pedido ({linhas.length})</span>
          {linhas.length === 0 ? (
            <div style={{ ...pequeno, padding: '0.8rem', border: '1px dashed var(--color-border, #cbd5e1)', borderRadius: 8 }}>Nenhuma linha ainda. Busque abaixo um kit ou um item.</div>
          ) : (
            linhas.map((l) => (
              <div key={l.chave} style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, padding: '0.6rem 0.75rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) 96px minmax(0, 1fr) auto', gap: '0.6rem', alignItems: 'end' }} data-testid={`emendas-pedido-linha-${l.chave}`}>
                <div style={{ minWidth: 0, alignSelf: 'center' }}>
                  <LinhaDoPedido linha={l} itens={porChave} />
                  <div style={pequeno}>{formatCurrency(valorDaLinha(l, porChave))}</div>
                </div>
                <AppInput label={l.tipo === 'KIT' ? 'Kits' : 'Quantidade'} type="number" min={1} step={1} value={String(l.quantidade || '')} onChange={(e) => muda(l.chave, { quantidade: Number(e.target.value) })} data-testid={`emendas-pedido-qtd-${l.chave}`} />
                <AppSelect label="Beneficiário" value={l.beneficiarioId ?? ''} onChange={(e) => muda(l.chave, { beneficiarioId: e.target.value || null })}>
                  <option value="">{exigeBeneficiario ? 'Escolha o órgão' : 'A informar'}</option>
                  {ativosBen.map((b) => (
                    <option key={b.id} value={b.id}>
                      {[nomeESigla(b), localDoBeneficiario(b)].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </AppSelect>
                <ActionButton action="remover" iconOnly label="Tirar a linha" type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))} />
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={rotulo}>Adicionar kit ou item</span>
          <AppInput type="search" aria-label="Buscar kit ou item" placeholder="Buscar kit, descrição do item, ata (ex.: 31/2025) ou item (ex.: item 2)" value={busca} onChange={(e) => setBusca(e.target.value)} data-testid="emendas-pedido-busca" />
          <div style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, maxHeight: 260, overflowY: 'auto' }} data-testid="emendas-pedido-resultados">
            {kitsEncontrados.map(({ k, c }, idx) => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderTop: idx ? '1px solid var(--color-border, #f1f5f9)' : undefined }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Kit · {k.nome}</div>
                  <div style={pequeno}>
                    {k.itens.length} {k.itens.length === 1 ? 'item' : 'itens'} · {formatCurrency(c.valorPorKit)} por kit · dá para {formatNumber(c.kitsPossiveis)} · {ROTULO_SITUACAO_KIT[c.situacao]}
                  </div>
                </div>
                <ActionButton action="adicionar" size="sm" type="button" onClick={() => adicionarKit(k)} disabled={c.kitsPossiveis === 0} data-testid={`emendas-pedido-kit-${k.id}`} />
              </div>
            ))}
            {itensEncontrados.slice(0, MAX_RESULTADOS).map((i, idx) => (
              <div key={i.itemKey} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderTop: idx || kitsEncontrados.length ? '1px solid var(--color-border, #f1f5f9)' : undefined }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{descricaoItemEmFrase(i.descricao)}</div>
                  <div style={pequeno}>
                    {rotuloItemDaAta(i)} · saldo {formatNumber(saldoAntes(i.itemKey))} · {formatCurrency(i.valorUnitario)}
                  </div>
                  {foraDoPrazo(i) && (
                    <div style={{ ...pequeno, color: 'var(--color-danger-text)', fontWeight: 600 }}>
                      Indicação encerrada em {dataBR(limiteDaIndicacao(i.vigenciaFinal!))}: a ata termina em {dataBR(i.vigenciaFinal)}.
                    </div>
                  )}
                </div>
                <ActionButton
                  action="adicionar"
                  size="sm"
                  type="button"
                  onClick={() => adicionarItem(i)}
                  disabled={saldoAntes(i.itemKey) <= 0 || foraDoPrazo(i)}
                  data-testid={`emendas-pedido-item-${i.itemKey}`}
                />
              </div>
            ))}
            {kitsEncontrados.length === 0 && itensEncontrados.length === 0 && <div style={{ ...pequeno, padding: '0.75rem' }}>Nada encontrado.</div>}
          </div>
        </div>

        {consumo.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }} data-testid="emendas-pedido-consumo">
            <span style={rotulo}>Como fica o saldo da CAEP</span>
            <div style={{ border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, overflow: 'hidden' }}>
              <table className="ds-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: 'right' }}>Saldo</th>
                    <th style={{ textAlign: 'right' }}>Este pedido</th>
                    <th style={{ textAlign: 'right' }}>Fica</th>
                  </tr>
                </thead>
                <tbody>
                  {consumo.map((c) => (
                    <tr key={c.itemKey}>
                      <td>{c.item ? `${rotuloItemDaAta(c.item)} · ${descricaoItemEmFrase(c.item.descricao).slice(0, 50)}` : c.itemKey}</td>
                      <td style={{ textAlign: 'right' }}>{formatNumber(c.saldo)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatNumber(c.q)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: c.fica < 0 ? 'var(--color-danger, #b11b05)' : undefined }}>{formatNumber(c.fica)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <span style={pequeno}>Valor do pedido pelo preço das atas: {formatCurrency(valorTotal)}.</span>
            {negativo && <div style={aviso('erro')}>Algum item fica negativo. Diminua a quantidade ou peça mais alocação ao gestor de saldo.</div>}
          </div>
        )}

        {linhas.length > 0 && <QuadroGabinete autor={autor} linhas={linhas} data={pedido?.reservadoEm ?? hoje} />}

        {tirou > 0 && (
          <AppInput label="Por que as linhas foram tiradas?" placeholder="Ex.: parlamentar desistiu do item; ata vencida sem substituto" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        )}
        {pedido && VOLTA_AO_OFICIO.has(pedido.etapa) && (
          <div style={aviso('info')}>Mudar itens ou quantidades volta o pedido para "Ofício recebido": o ofício e a emenda citam os itens antigos e precisam ser conferidos de novo. Só trocar o beneficiário não volta.</div>
        )}
        <AppTextarea label="Observação" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
        {tentou && pendencias.length > 0 && (
          <div style={aviso('erro')} role="alert" data-testid="emendas-pedido-pendencias">
            Falta: {pendencias.join(', ')}.
          </div>
        )}
      </form>
    </Modal>
  );
};
