import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';

// O ambiente de testes é node (sem DOM): cobrimos o contrato de renderização;
// o portal só é montado no navegador.
describe('Modal / ConfirmDialog', () => {
  it('fechados não renderizam nada', () => {
    expect(renderToStaticMarkup(<Modal isOpen={false} onClose={() => {}} title="T">x</Modal>)).toBe('');
    expect(
      renderToStaticMarkup(
        <ConfirmDialog isOpen={false} title="T" message="M" onConfirm={() => {}} onCancel={() => {}} />
      )
    ).toBe('');
  });
});
