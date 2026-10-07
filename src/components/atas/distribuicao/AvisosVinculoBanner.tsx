import React from 'react';
import { Check, Info } from 'lucide-react';
import { AppButton } from '../../../design-system/components/AppButton';
import { useAvisosDistribuicao, useMarcarAvisosLidos } from '../../../hooks/useAvisosDistribuicao';
import { useAllAtaManagers, useSaveAtaManager } from '../../../hooks/useAtaManagers';
import { useSaveContractManager } from '../../../hooks/useSaveContractManager';
import { useToast } from '../../../design-system/components/Toast';
import type { DistribuicaoAviso } from '../../../services/distribuicaoAvisosService';
import { formatDateBR } from '../../../utils/format';

const MOSTRAR = 5;

/** Contrato "200331-00160-2026" → "00160/2026" (o número que o usuário conhece). */
const numeroDoContrato = (key?: string) => {
  const m = key?.match(/^\d{6}-(.+)-(\d{4})$/);
  return m ? `${m[1]}/${m[2]}` : key || '';
};

/** Uma frase por aviso, em linguagem do coordenador. */
export function textoAviso(a: DistribuicaoAviso): string {
  if (a.tipo === 'GESTORES_DIFERENTES') {
    return `O contrato ${numeroDoContrato(a.contractKey)} está em atas de gestores diferentes: a ata ${a.ataKey} é de ${a.gestorNovo} e o contrato está com ${a.gestorAnterior ?? 'ninguém'}${a.feitoPorNome ? ` (vínculo ou troca feita por ${a.feitoPorNome})` : ''}.`;
  }
  const quem = a.feitoPorNome ? `${a.feitoPorNome} vinculou` : 'Foi vinculado';
  if (a.tipo === 'ATA_ASSUMIU_GESTOR') {
    return `${quem} o contrato ${numeroDoContrato(a.contractKey)} à ata ${a.ataKey}, que estava sem gestor: a ata passou a ser de ${a.gestorNovo}, gestor do contrato.`;
  }
  return `${quem} o contrato ${numeroDoContrato(a.contractKey)} à ata ${a.ataKey}: o contrato passou de ${a.gestorAnterior ?? 'sem gestor'} para ${a.gestorNovo}, gestor da ata.`;
}

/**
 * Avisa o coordenador dos vínculos que mudaram o gestor de uma ata ou contrato. Não bloqueia nada: o servidor já vinculou;
 * se o resultado não for o desejado, o coordenador corrige em "Gestor diferente da ata" ou atribuindo a ata de novo.
 */
/**
 * Aviso GESTORES_DIFERENTES ainda sem decisão: o contrato continua com gestor diferente do da ata. Já decidido por outro
 * caminho (gestor do contrato trocado, ata passada ao mesmo gestor), sai da lista e é marcado como lido junto com os demais.
 */
export function conflitoPendente(a: DistribuicaoAviso, gestorDoContrato: (contractKey: string) => string | undefined, gestorDaAta: (ataKey: string) => string | undefined): boolean {
  if (a.tipo !== 'GESTORES_DIFERENTES' || !a.contractKey) return false;
  const doContrato = gestorDoContrato(a.contractKey) ?? a.gestorAnterior;
  const daAta = gestorDaAta(a.ataKey) ?? a.gestorNovo;
  return Boolean(daAta) && doContrato !== daAta;
}

interface AvisosVinculoBannerProps {
  podeVer: boolean;
  /** Gestor atual do contrato e da ata (para saber se o conflito de gestores já foi resolvido). */
  gestorDoContrato?: (contractKey: string) => string | undefined;
  gestorDaAta?: (ataKey: string) => string | undefined;
}

/** "200331-00033-2026" → partes para gravar o gestor do contrato. */
const partesDoContrato = (key: string) => {
  const m = key.match(/^(\d{6})-(.+)-(\d{4})$/);
  return m ? { uasg: m[1], numero: m[2], ano: Number(m[3]) } : null;
};

/** Contrato em atas de gestores diferentes: o coordenador decide aqui. */
const ConflitoGestores: React.FC<{ aviso: DistribuicaoAviso; gestorContrato?: string; gestorAta: string; onFeito: (id: string) => Promise<void> }> = ({
  aviso,
  gestorContrato,
  gestorAta,
  onFeito
}) => {
  const toast = useToast();
  const { data: ataManagers } = useAllAtaManagers();
  const salvarContrato = useSaveContractManager();
  const salvarAta = useSaveAtaManager();
  const ocupado = salvarContrato.isPending || salvarAta.isPending;
  const userId = (nome?: string) => Object.values(ataManagers ?? {}).find((m) => m.gestorNome === nome)?.gestorUserId ?? null;
  const contrato = numeroDoContrato(aviso.contractKey);

  const executar = async (acao: () => Promise<unknown>, ok: string) => {
    try {
      await acao();
      await onFeito(aviso.id);
      toast.success(ok);
    } catch (err: any) {
      toast.error(`Não foi possível concluir: ${err?.message || 'erro desconhecido'}`);
    }
  };
  const passarContrato = () => {
    const p = partesDoContrato(aviso.contractKey || '');
    if (!p) return;
    void executar(
      () => salvarContrato.mutateAsync({ ...p, gestorNome: gestorAta, gestorUserId: userId(gestorAta) }),
      `O contrato ${contrato} passou para ${gestorAta}.`
    );
  };
  const passarAta = () => {
    if (!gestorContrato) return;
    void executar(
      () => salvarAta.mutateAsync({ ataKey: aviso.ataKey, gestorNome: gestorContrato, gestorUserId: userId(gestorContrato) }),
      `A ata ${aviso.ataKey} passou para ${gestorContrato}.`
    );
  };

  return (
    <li data-testid={`distribuicao-aviso-conflito-${aviso.id}`} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.5rem 0', borderTop: '1px solid var(--color-warning-border)' }}>
      <span>
        <strong>Contrato em atas de gestores diferentes.</strong> {textoAviso({ ...aviso, gestorAnterior: gestorContrato ?? aviso.gestorAnterior, gestorNovo: gestorAta })}{' '}
        <span style={{ color: '#64748b' }}>({formatDateBR(aviso.criadoEm)})</span>
      </span>
      <span style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {gestorContrato && (
          <AppButton type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => void executar(async () => undefined, `O contrato ${contrato} continua com ${gestorContrato}.`)} data-testid="aviso-conflito-manter">
            Manter com {gestorContrato}
          </AppButton>
        )}
        <AppButton type="button" variant="outline" size="sm" disabled={ocupado} onClick={passarContrato} data-testid="aviso-conflito-contrato">
          Passar contrato a {gestorAta}
        </AppButton>
        {gestorContrato && (
          <AppButton type="button" variant="outline" size="sm" disabled={ocupado} onClick={passarAta} data-testid="aviso-conflito-ata">
            Passar ata {aviso.ataKey} a {gestorContrato}
          </AppButton>
        )}
      </span>
    </li>
  );
};

export const AvisosVinculoBanner: React.FC<AvisosVinculoBannerProps> = ({ podeVer, gestorDoContrato = () => undefined, gestorDaAta = () => undefined }) => {
  const { data: todosOsAvisos = [] } = useAvisosDistribuicao(podeVer);
  const marcar = useMarcarAvisosLidos();
  const toast = useToast();
  const [todos, setTodos] = React.useState(false);

  if (!podeVer || todosOsAvisos.length === 0) return null;
  const conflitos = todosOsAvisos.filter((a) => conflitoPendente(a, gestorDoContrato, gestorDaAta));
  // Conflitos já resolvidos por outro caminho saem junto com os demais ao marcar como lido.
  const resolvidos = todosOsAvisos.filter((a) => a.tipo === 'GESTORES_DIFERENTES' && !conflitos.includes(a));
  const avisos = todosOsAvisos.filter((a) => a.tipo !== 'GESTORES_DIFERENTES');
  const marcarLidos = () => {
    const erro = (err: any) => toast.error(`Não foi possível marcar como lido: ${err?.message || 'erro desconhecido'}`);
    marcar.mutate(undefined, { onError: erro });
    if (resolvidos.length > 0) marcar.mutate(resolvidos.map((a) => a.id), { onError: erro });
  };
  const decidido = (id: string) => marcar.mutateAsync([id]);
  const mostrados = todos ? avisos : avisos.slice(0, MOSTRAR);

  return (
    <>
    {conflitos.length > 0 && (
      <section
        role="status"
        data-testid="distribuicao-avisos-conflito"
        style={{ background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', borderRadius: '8px', padding: '0.75rem 0.9rem', color: 'var(--color-warning-text-strong)', fontSize: '0.82rem' }}
      >
        <strong>
          {conflitos.length === 1 ? '1 contrato espera' : `${conflitos.length} contratos esperam`} a sua decisão: quem fica com o contrato
        </strong>
        <ul style={{ margin: '0.4rem 0 0', padding: 0, listStyle: 'none' }}>
          {conflitos.map((a) => (
            <ConflitoGestores
              key={a.id}
              aviso={a}
              gestorContrato={gestorDoContrato(a.contractKey!) ?? a.gestorAnterior}
              gestorAta={gestorDaAta(a.ataKey) ?? a.gestorNovo}
              onFeito={decidido}
            />
          ))}
        </ul>
      </section>
    )}
    {avisos.length + resolvidos.length > 0 && (
    <section
      role="status"
      data-testid="distribuicao-avisos-vinculo"
      style={{ background: 'var(--color-info-bg)', border: '1px solid var(--color-info-border)', borderRadius: '8px', padding: '0.75rem 0.9rem', color: 'var(--color-info-text-strong)', fontSize: '0.82rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Info size={15} aria-hidden="true" />
        <strong>
          {avisos.length === 0
            ? 'Conflitos de gestor já resolvidos'
            : avisos.length === 1
              ? '1 vínculo mudou o gestor'
              : `${avisos.length} vínculos mudaram o gestor`}{' '}
          desde a última leitura
        </strong>
        <AppButton
          type="button"
          variant="outline"
          size="sm"
          onClick={marcarLidos}
          disabled={marcar.isPending}
          data-testid="distribuicao-avisos-lidos"
          icon={<Check size={14} />}
          style={{ marginLeft: 'auto' }}
        >
          Marcar como lido
        </AppButton>
      </div>
      <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {mostrados.map((a) => (
          <li key={a.id}>
            {textoAviso(a)} <span style={{ color: '#64748b' }}>({formatDateBR(a.criadoEm)})</span>
          </li>
        ))}
      </ul>
      {avisos.length > MOSTRAR && (
        <AppButton type="button" variant="link" size="sm" onClick={() => setTodos((v) => !v)} style={{ marginTop: '0.4rem' }}>
          {todos ? 'Mostrar menos' : `Mostrar todos (${avisos.length})`}
        </AppButton>
      )}
    </section>
    )}
    </>
  );
};
