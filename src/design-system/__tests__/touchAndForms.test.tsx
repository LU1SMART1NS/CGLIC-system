import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { IconButton } from '../components/IconButton';
import { AppInput, AppSelect, AppTextarea } from '../components/FormFields';
import { AppButton } from '../components/AppButton';
import { Tooltip } from '../components/Tooltip';

describe('IconButton', () => {
  it('exige nome acessível, repassa aria-pressed/expanded e usa a classe de toque', () => {
    const html = renderToStaticMarkup(<IconButton label="Editar unidade" icon={<svg />} pressed expanded={false} />);
    expect(html).toContain('aria-label="Editar unidade"');
    expect(html).toContain('title="Editar unidade"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('ds-btn');
  });
});

describe('AppButton — hover e foco em CSS', () => {
  it('não usa estado de hover inline e expõe a classe por variante', () => {
    const html = renderToStaticMarkup(<AppButton variant="danger">Excluir</AppButton>);
    expect(html).toContain('ds-btn ds-btn--danger');
    expect(html).toContain('background-color:var(--color-danger-solid)');
    expect(html).not.toContain('outline');
  });
});

describe('AppInput / AppSelect / AppTextarea', () => {
  it('associa label ao campo por id automático e descreve erro/dica', () => {
    const html = renderToStaticMarkup(<AppInput label="E-mail" hint="Institucional" />);
    const id = /for="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain(`aria-describedby="${id}-hint"`);

    const err = renderToStaticMarkup(<AppInput label="Nome" error="Obrigatório" />);
    expect(err).toContain('aria-invalid="true"');
    expect(err).toContain('role="alert"');
    expect(err).toContain('Obrigatório');
  });

  it('select e textarea também usam a mesma classe de controle', () => {
    expect(renderToStaticMarkup(<AppSelect label="Perfil"><option>A</option></AppSelect>)).toContain('ds-field__control');
    expect(renderToStaticMarkup(<AppTextarea label="Obs" />)).toContain('<textarea');
  });
});

describe('Tooltip', () => {
  it('fechado por padrão: só renderiza o gatilho', () => {
    const html = renderToStaticMarkup(<Tooltip content="Dica"><button type="button">?</button></Tooltip>);
    expect(html).toContain('ds-tooltip');
    expect(html).not.toContain('role="tooltip"');
  });
});
