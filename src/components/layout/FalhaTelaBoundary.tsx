import React from 'react';
import { ErrorState } from '../../design-system';

interface Props {
  children: React.ReactNode;
}

interface State {
  erro: Error | null;
}

/**
 * Sem esta proteção, um erro ao montar uma tela desmonta o app inteiro e sobra só a página em branco.
 * Aqui o erro vira um aviso com o botão de recarregar. Quem usa passa `key` com o caminho da URL, para
 * que trocar de tela pelo menu limpe o aviso.
 */
export class FalhaTelaBoundary extends React.Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: React.ErrorInfo) {
    console.error('Falha ao abrir a tela', erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div style={{ maxWidth: 640, margin: '3rem auto', padding: '0 var(--page-gutter, 16px)' }}>
        <ErrorState
          testId="falha-tela"
          title="Não foi possível abrir esta tela"
          message="O sistema pode ter sido atualizado enquanto esta aba estava aberta. Recarregue a página para continuar."
          retryLabel="Recarregar a página"
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }
}
