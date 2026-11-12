import React from 'react';
import { Modal } from '../../../design-system/components/Modal';
import { ActionButton } from '../../../design-system/components/ActionButton';
import { AppDateInput, AppInput, AppSelect } from '../../../design-system/components/FormFields';
import { CarteiraSegmentTabs } from '../../carteira/CarteiraSegmentTabs';
import { carteiraTableShell, carteiraTd, carteiraTh } from '../../carteira/carteiraStyles';
import { useUsers } from '../../../hooks/useUsers';
import { useTransferenciasTemporarias, useTransferirCarteira } from '../../../hooks/useTransferenciasTemporarias';
import { ROTULO_MOTIVO_AUSENCIA, type MotivoAusencia } from '../../../services/transferenciaTemporariaService';
import type { ArpItemContractLinkPair } from '../../../services/arpContractLinkService';
import { ROTULO_COMPLEXIDADE } from './complexidade';
import type { DistribuicaoItem, DistribuicaoLinha } from './distribuicaoEquipe';
import { ausenciaDe, dataBR, hojeISO, resumoPorDestino, textoQuantidade } from './transferenciaTemporaria';

const MOTIVOS = Object.keys(ROTULO_MOTIVO_AUSENCIA) as MotivoAusencia[];
type Modo = 'UM' | 'DIVIDIR';

interface TransferirTemporariamenteModalProps {
  ausente: { nome: string; userId: string };
  /** Carteira vigente de quem sai (linha da Equipe). */
  linha: DistribuicaoLinha;
  links: ArpItemContractLinkPair[];
  onClose: () => void;
}

const rotuloItem = (i: DistribuicaoItem) => `${i.tipo === 'ATA' ? 'Ata' : 'Contrato'} ${i.numero}`;

/**
 * Passa a carteira de quem vai se ausentar (férias, licença…) a um ou mais colegas até o retorno. Os contratos
 * ligados a uma ata vão com ela; o que não aparece na lista (encerrados) vai para quem assume. Desfaz na aba Ausências.
 */
export const TransferirTemporariamenteModal: React.FC<TransferirTemporariamenteModalProps> = ({ ausente, linha, links, onClose }) => {
  const { data: users = [] } = useUsers();
  const { data: transferencias = [] } = useTransferenciasTemporarias();
  const transferir = useTransferirCarteira();

  const [motivo, setMotivo] = React.useState<MotivoAusencia>('FERIAS');
  const [inicio, setInicio] = React.useState(hojeISO());
  const [retorno, setRetorno] = React.useState('');
  const [sei, setSei] = React.useState('');
  const [modo, setModo] = React.useState<Modo>('UM');
  const [padrao, setPadrao] = React.useState('');
  const [porItem, setPorItem] = React.useState<Record<string, string>>({});

  // Quem pode assumir: gestores ativos, menos quem sai e quem também está ausente.
  const candidatos = React.useMemo(
    () =>
      users
        .filter((u) => u.ativo && u.perfil === 'gestor' && u.id !== ausente.userId && !ausenciaDe(transferencias, u.id))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [users, transferencias, ausente.userId]
  );
  const nomeDe = (id: string) => candidatos.find((u) => u.id === id)?.nome ?? '';

  // Atas com os contratos que vão junto; contratos fora das atas dele vão sozinhos.
  const { atas, contratosSemAta, ligadosPorAta } = React.useMemo(() => {
    const atasDele = new Set(linha.ataKeys);
    const ligados = new Map<string, Set<string>>();
    for (const l of links) {
      if (!atasDele.has(l.ataKey)) continue;
      if (!ligados.has(l.ataKey)) ligados.set(l.ataKey, new Set());
      ligados.get(l.ataKey)!.add(l.contractKey);
    }
    const seguem = new Set(Array.from(ligados.values()).flatMap((s) => Array.from(s)));
    return {
      atas: linha.itens.filter((i) => i.tipo === 'ATA'),
      contratosSemAta: linha.itens.filter((i) => i.tipo === 'CONTRATO' && !seguem.has(i.chave)),
      ligadosPorAta: ligados
    };
  }, [linha, links]);
  const itens = [...atas, ...contratosSemAta];

  const destinoDe = (i: DistribuicaoItem) => (modo === 'DIVIDIR' && porItem[`${i.tipo}:${i.chave}`]) || padrao;
  const resumo = resumoPorDestino(
    itens.flatMap((i) => {
      const nome = nomeDe(destinoDe(i));
      if (!nome) return [];
      const junto = i.tipo === 'ATA' ? Array.from(ligadosPorAta.get(i.chave) ?? []).map(() => ({ tipo: 'CONTRATO' as const, destinoNome: nome })) : [];
      return [{ tipo: i.tipo, destinoNome: nome }, ...junto];
    })
  );

  const datasOk = !!inicio && !!retorno && retorno >= inicio;
  const podeSalvar = !!padrao && datasOk && !transferir.isPending;

  const salvar = () => {
    if (!podeSalvar) return;
    const destinos =
      modo === 'DIVIDIR'
        ? itens
            .map((i) => ({ tipo: i.tipo, chave: i.chave, userId: destinoDe(i) }))
            .filter((d) => d.userId && d.userId !== padrao)
            .map((d) => ({ ...d, nome: nomeDe(d.userId) }))
        : [];
    transferir.mutate(
      { ausenteUserId: ausente.userId, motivo, inicio, retornoPrevisto: retorno, seiNumero: sei, padrao: { userId: padrao, nome: nomeDe(padrao) }, destinos },
      { onSuccess: onClose }
    );
  };

  const opcoes = (
    <>
      <option value="">Escolha…</option>
      {candidatos.map((u) => (
        <option key={u.id} value={u.id}>{u.nome}</option>
      ))}
    </>
  );

  const grupo = (titulo: string) => (
    <tr>
      <td colSpan={3} style={{ ...carteiraTd, background: '#f8fafc', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#64748b', padding: '0.5rem 0.6rem 0.3rem' }}>
        {titulo}
      </td>
    </tr>
  );
  const linhaItem = (i: DistribuicaoItem) => {
    const junto = i.tipo === 'ATA' ? ligadosPorAta.get(i.chave)?.size ?? 0 : 0;
    const chave = `${i.tipo}:${i.chave}`;
    return (
      <tr key={chave} data-testid={`transferir-temp-item-${i.chave}`}>
        <td data-label={i.tipo === 'ATA' ? 'Ata' : 'Contrato'} style={carteiraTd}>
          <div style={{ fontWeight: 800 }}>{rotuloItem(i)}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
            {i.objeto}
            {i.tipo === 'ATA' && (junto > 0 ? ` · ${junto} ${junto === 1 ? 'contrato vai' : 'contratos vão'} junto` : ' · sem contratos')}
          </div>
        </td>
        <td data-label="Complexidade" style={carteiraTd}>{ROTULO_COMPLEXIDADE[i.complexidade.nivel]}</td>
        <td data-label="Para" style={{ ...carteiraTd, textAlign: 'right' }}>
          {modo === 'DIVIDIR' ? (
            <AppSelect
              aria-label={`Para quem vai ${rotuloItem(i)}`}
              value={porItem[chave] || padrao}
              onChange={(e) => setPorItem((p) => ({ ...p, [chave]: e.target.value }))}
              style={{ minWidth: '160px' }}
            >
              {opcoes}
            </AppSelect>
          ) : (
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>{nomeDe(padrao) || '—'}</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      dismissible={!transferir.isPending}
      size="lg"
      title={`Transferir temporariamente · ${ausente.nome}`}
      subtitle={`${textoQuantidade(atas.length, 0)} vigentes (${textoQuantidade(0, Array.from(ligadosPorAta.values()).reduce((n, s) => n + s.size, 0))} ligados) e ${textoQuantidade(0, contratosSemAta.length)} fora das atas`}
      testId="transferir-temporariamente-modal"
      footer={
        <>
          <ActionButton action="cancelar" type="button" onClick={onClose} disabled={transferir.isPending} />
          <ActionButton
            action="salvar"
            type="button"
            onClick={salvar}
            disabled={!podeSalvar}
            isLoading={transferir.isPending}
            data-testid="transferir-temporariamente-salvar"
          >
            {datasOk ? `Transferir até ${dataBR(retorno)}` : 'Transferir'}
          </ActionButton>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '0.7rem' }}>
          <AppSelect label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoAusencia)} data-testid="transferir-temp-motivo">
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>{ROTULO_MOTIVO_AUSENCIA[m]}</option>
            ))}
          </AppSelect>
          <AppDateInput label="Saída" value={inicio} onValueChange={setInicio} data-testid="transferir-temp-inicio" />
          <AppDateInput
            label="Retorno previsto"
            value={retorno}
            onValueChange={setRetorno}
            min={inicio || undefined}
            hint="Dia do aviso no Início"
            error={retorno && inicio && retorno < inicio ? 'Antes da saída' : undefined}
            data-testid="transferir-temp-retorno"
          />
          <AppInput label="Nº SEI (opcional)" value={sei} maxLength={40} onChange={(e) => setSei(e.target.value)} placeholder="00000.000000/0000-00" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <CarteiraSegmentTabs
            segments={[
              { id: 'UM' as const, label: 'Tudo para uma pessoa' },
              { id: 'DIVIDIR' as const, label: 'Dividir por ata' }
            ]}
            active={modo}
            onSelect={setModo}
            testIdPrefix="transferir-temp-modo"
            ariaLabel="Como dividir"
          />
          <div style={{ maxWidth: '300px' }}>
            <AppSelect
              label={modo === 'UM' ? 'Quem assume' : 'Quem assume o resto'}
              hint={modo === 'DIVIDIR' ? 'O que você não mudar na lista e os encerrados' : undefined}
              value={padrao}
              onChange={(e) => setPadrao(e.target.value)}
              data-testid="transferir-temp-padrao"
            >
              {opcoes}
            </AppSelect>
          </div>
        </div>

        {itens.length > 0 && (
          <div style={carteiraTableShell}>
            <div style={{ overflowX: 'auto', containerType: 'inline-size' }}>
              <table className="carteira-stack" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={carteiraTh}>Ata ou contrato</th>
                    <th style={carteiraTh}>Complexidade</th>
                    <th style={{ ...carteiraTh, textAlign: 'right' }}>Para</th>
                  </tr>
                </thead>
                <tbody>
                  {atas.length > 0 && grupo('Atas')}
                  {atas.map(linhaItem)}
                  {contratosSemAta.length > 0 && grupo('Contratos fora das atas')}
                  {contratosSemAta.map(linhaItem)}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div data-testid="transferir-temp-resumo" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 0.9rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
          {resumo.length === 0 ? (
            <span style={{ color: '#64748b' }}>Escolha quem assume.</span>
          ) : (
            resumo.map((r) => (
              <div key={r.nome}>
                <strong>{r.nome}</strong> recebe {textoQuantidade(r.atas, r.contratos)}
              </div>
            ))
          )}
          <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>
            Tarefas e pagamentos seguem a ata e o contrato: vão e voltam junto. {ausente.nome} continua com acesso ao sistema; a carteira fica com os colegas
            até você desfazer na aba Ausências.
          </div>
        </div>

        {transferir.isError && (
          <div role="alert" style={{ fontSize: '0.8rem', color: 'var(--color-danger-text)', fontWeight: 600 }}>
            Erro ao transferir: {transferir.error.message}
          </div>
        )}
      </div>
    </Modal>
  );
};
