import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppButton } from '../components/AppButton';

describe('AppButton Component', () => {
  it('renders correctly with default props', () => {
    const html = renderToStaticMarkup(<AppButton>Click Me</AppButton>);
    expect(html).toContain('Click Me');
    expect(html).toContain('<button');
  });

  it('renders loading state correctly', () => {
    const html = renderToStaticMarkup(<AppButton isLoading>Submit</AppButton>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
  });

  it('renders outline variant', () => {
    const html = renderToStaticMarkup(<AppButton variant="outline">Outline</AppButton>);
    expect(html).toContain('Outline');
  });
});
