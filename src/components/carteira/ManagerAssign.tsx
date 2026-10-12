import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AppButton } from '../../design-system/components/AppButton';

/** Endereço da Central de Distribuição, onde se atribui gestor às atas. */
export const CENTRAL_DISTRIBUICAO_PATH = '/atas/distribuicao';
/** Vinculação › Contratos à ata: onde o contrato sem ata ganha ata (e herda o gestor) ou é marcado "não pertence". */
export const VINCULACAO_CONTRATOS_PATH = '/vinculacao/contratos';

/** Para onde leva o "Sem gestor" de uma linha: rótulo do botão, endereço e dica. */
export interface DestinoSemGestor {
  rotulo: string;
  para: string;
  dica: string;
}

const DESTINO_CENTRAL: DestinoSemGestor = {
  rotulo: 'Sem gestor · atribuir na Central',
  para: CENTRAL_DISTRIBUICAO_PATH,
  dica: 'A atribuição de gestor é feita na Central de Distribuição'
};

/**
 * Contrato sem gestor: o caminho depende de por que ele está sem gestor (o contrato herda o gestor da ata).
 * - vinculado a ata sem gestor: a Central dá gestor à ata e o contrato acompanha;
 * - marcado "não pertence a ata": o gestor é escolhido direto no contrato, na Vinculação;
 * - sem vínculo: a Vinculação liga o contrato à ata (ou marca que não pertence a nenhuma).
 */
export function destinoContratoSemGestor(opts: {
  numero: string;
  atas: string[];
  naoPertenceAAta: boolean;
  ataTemGestor: (numeroAta: string) => boolean;
}): DestinoSemGestor {
  const busca = `busca=${encodeURIComponent(opts.numero)}`;
  if (opts.atas.length > 0) {
    const semGestor = opts.atas.find((a) => !opts.ataTemGestor(a));
    return semGestor
      ? { rotulo: 'Ata sem gestor · Central', para: CENTRAL_DISTRIBUICAO_PATH, dica: `A Ata ${semGestor} está sem gestor: o contrato herda o gestor que ela receber na Central de Distribuição` }
      : DESTINO_CENTRAL;
  }
  if (opts.naoPertenceAAta) {
    return {
      rotulo: 'Sem gestor · atribuir',
      para: `${VINCULACAO_CONTRATOS_PATH}?situacao=NAO_PERTENCE&${busca}`,
      dica: 'Contrato marcado como "não pertence a ata": o gestor é escolhido na Vinculação › Contratos à ata'
    };
  }
  return {
    rotulo: 'Sem ata · vincular',
    para: `${VINCULACAO_CONTRATOS_PATH}?${busca}`,
    dica: 'O contrato herda o gestor da ata: vincule-o à ata (ou marque que não pertence a nenhuma) na Vinculação › Contratos à ata'
  };
}

/**
 * Só o coordenador (admin) atribui gestor, e só na Central de Distribuição
 * (mesma regra das RPCs save_*_manager_atomic desde a migration 69).
 */
export function canAssignManager(role: string | null | undefined): boolean {
  return role === 'admin';
}

interface ManagerCellProps {
  gestorNome?: string;
  /** Coordenador: sem gestor, a célula vira atalho para onde o gestor se resolve. */
  canAssign: boolean;
  testId: string;
  /** Para onde o atalho leva; padrão: Central de Distribuição (atas). */
  destino?: DestinoSemGestor;
}

/**
 * Célula "Gestor" das carteiras: só mostra o nome. Para o coordenador, "Sem gestor" leva até onde o gestor se
 * resolve (Central para atas; para contratos, ver destinoContratoSemGestor).
 */
export const ManagerCell: React.FC<ManagerCellProps> = ({ gestorNome, canAssign, testId, destino = DESTINO_CENTRAL }) => {
  const navigate = useNavigate();
  if (gestorNome) return <span data-testid={testId}>{gestorNome}</span>;
  if (!canAssign) return <span data-testid={testId} style={{ color: '#94a3b8' }}>—</span>;
  return (
    <AppButton
      type="button"
      variant="outline"
      size="xs"
      onClick={() => navigate(destino.para)}
      data-testid={testId}
      title={destino.dica}
    >
      {destino.rotulo} <ArrowRight size={12} />
    </AppButton>
  );
};
