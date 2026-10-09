import {
  ArrowLeft, ArrowLeftRight, ArrowRight, Ban, Check, FlaskConical, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Eye, EyeOff, FileSearch, FileX, Link2, Pencil, Plus,
  RefreshCw, RotateCcw, Search, Trash2, Unlink, UserCheck, UserPlus, UserX, X, XCircle,
  type LucideIcon
} from 'lucide-react';
import type { AppButtonVariant } from './components/AppButton';

/**
 * Catálogo de ações do sistema: a mesma ação tem sempre o mesmo rótulo, ícone e cor, em qualquer tela.
 *
 * Hierarquia (decide a variante; as telas NÃO escolhem cor):
 *  - principal (salvar, vincular, novo): `primary`, no máximo um por bloco;
 *  - auxiliar (cancelar, voltar, limpar, editar, conferir, restaurar…): `outline` (branco com borda);
 *  - destrutiva ou de descarte (excluir, remover, descartar, não pertence): `ghostDanger` (vermelho discreto);
 *  - ícone sem texto: `ghost` (sem borda), ou `ghostDanger` quando a ação é destrutiva;
 *  - `success` (verde) só para aplicar uma sugestão automática (ex.: "Aceitar todas as sugestões");
 *    atribuir/transferir/alinhar gestor NÃO são sugestão: nas linhas são `outline`, e na barra de seleção
 *    em lote o único botão principal ("Atribuir N selecionados") é `primary`.
 * Ação nova: acrescente aqui, nunca decida variante no ponto de uso.
 */
export interface ActionDef {
  label: string;
  icon: LucideIcon;
  /** Variante do botão com texto. */
  variant: AppButtonVariant;
}

export const ACTIONS = {
  // principais
  salvar: { label: 'Salvar', icon: Check, variant: 'primary' },
  novo: { label: 'Novo', icon: Plus, variant: 'primary' },
  vincular: { label: 'Vincular', icon: Link2, variant: 'primary' },
  // sugestão automática
  aplicarSugestao: { label: 'Aplicar sugestão', icon: Check, variant: 'success' },
  // auxiliares
  cancelar: { label: 'Cancelar', icon: X, variant: 'outline' },
  fechar: { label: 'Fechar', icon: X, variant: 'outline' },
  voltar: { label: 'Voltar', icon: ArrowLeft, variant: 'outline' },
  limpar: { label: 'Limpar', icon: X, variant: 'outline' },
  limparFiltros: { label: 'Limpar filtros', icon: X, variant: 'outline' },
  /** Coordenador indica o fornecedor de uma ata que o PNCP publicou sem fornecedor (migration 107). */
  indicarFornecedor: { label: 'Indicar fornecedor', icon: UserCheck, variant: 'primary' },
  editar: { label: 'Editar', icon: Pencil, variant: 'outline' },
  renomear: { label: 'Renomear', icon: Pencil, variant: 'outline' },
  conferir: { label: 'Conferir', icon: Search, variant: 'outline' },
  concluir: { label: 'Concluir', icon: Check, variant: 'outline' },
  resolvido: { label: 'Resolvido', icon: Check, variant: 'outline' },
  reexibir: { label: 'Reexibir', icon: RotateCcw, variant: 'outline' },
  restaurar: { label: 'Restaurar', icon: RotateCcw, variant: 'outline' },
  desfazer: { label: 'Desfazer', icon: RotateCcw, variant: 'outline' },
  verDetalhes: { label: 'Ver', icon: Eye, variant: 'outline' },
  ocultar: { label: 'Ocultar', icon: EyeOff, variant: 'outline' },
  expandir: { label: 'Expandir', icon: ChevronRight, variant: 'outline' },
  adicionar: { label: 'Adicionar', icon: Plus, variant: 'outline' },
  avancarEtapa: { label: 'Avançar etapa', icon: ArrowRight, variant: 'outline' },
  abrir: { label: 'Abrir', icon: ArrowRight, variant: 'outline' },
  confirmar: { label: 'Confirmar', icon: Check, variant: 'outline' },
  exportar: { label: 'Exportar', icon: Download, variant: 'outline' },
  copiar: { label: 'Copiar', icon: Copy, variant: 'outline' },
  sincronizar: { label: 'Sincronizar', icon: RefreshCw, variant: 'outline' },
  simular: { label: 'Simular', icon: FlaskConical, variant: 'outline' },
  escolherAta: { label: 'Escolher ata', icon: FileSearch, variant: 'outline' },
  reativar: { label: 'Reativar', icon: UserCheck, variant: 'outline' },
  atribuir: { label: 'Atribuir', icon: UserPlus, variant: 'outline' },
  alinharGestor: { label: 'Alinhar gestor', icon: UserCheck, variant: 'outline' },
  transferir: { label: 'Transferir', icon: ArrowLeftRight, variant: 'outline' },
  anterior: { label: 'Anterior', icon: ChevronLeft, variant: 'outline' },
  proximo: { label: 'Próximo', icon: ChevronRight, variant: 'outline' },
  recolher: { label: 'Recolher', icon: ChevronDown, variant: 'outline' },
  // destrutivas e de descarte
  excluir: { label: 'Excluir', icon: Trash2, variant: 'ghostDanger' },
  remover: { label: 'Remover', icon: Trash2, variant: 'ghostDanger' },
  desvincular: { label: 'Desvincular', icon: Unlink, variant: 'ghostDanger' },
  desativar: { label: 'Desativar', icon: UserX, variant: 'ghostDanger' },
  cancelarCiclo: { label: 'Cancelar ciclo', icon: Ban, variant: 'ghostDanger' },
  descartar: { label: 'Descartar', icon: XCircle, variant: 'ghostDanger' },
  naoPertence: { label: 'Não pertence a nenhuma ata', icon: FileX, variant: 'ghostDanger' }
} as const satisfies Record<string, ActionDef>;

export type ActionId = keyof typeof ACTIONS;

/** Rótulos do catálogo: o teste de padronização impede usá-los em `AppButton` solto. */
export const ACTION_LABELS: string[] = Object.values(ACTIONS).map((a) => a.label);
