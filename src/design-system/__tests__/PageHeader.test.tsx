import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageHeader } from '../components/PageHeader';

describe('PageHeader Component', () => {
  it('renders title and subtitle', () => {
    const html = renderToStaticMarkup(<PageHeader title="Test Title" subtitle="Test Subtitle" />);
    expect(html).toContain('Test Title');
    expect(html).toContain('Test Subtitle');
  });

  it('renders actions and badge', () => {
    const html = renderToStaticMarkup(
      <PageHeader
        title="Title"
        badge={<span data-testid="badge">Badge</span>}
        actions={<button>Action</button>}
      />
    );
    expect(html).toContain('data-testid="badge"');
    expect(html).toContain('Action');
  });
});
