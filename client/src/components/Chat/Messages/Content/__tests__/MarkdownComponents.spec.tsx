import React from 'react';
import { render, screen } from '@testing-library/react';
import { a as Anchor } from '../MarkdownComponents';
import { apiBaseUrl } from 'librechat-data-provider';

// we only need a minimal recoil provider since the component reads from recoil
import { RecoilRoot } from 'recoil';

// the anchor component imports a hook to download files; stub it out so the
// hook invocation doesn't try to perform network operations during tests.
jest.mock('~/data-provider', () => ({
  ...(jest.requireActual('~/data-provider') as any),
  useFileDownload: () => ({ refetch: jest.fn() }),
}));

// helper that renders the anchor inside the recoil root so hooks don't blow up
function renderAnchor(href: string, children: React.ReactNode) {
  return render(
    <RecoilRoot>
      <Anchor href={href}>{children}</Anchor>
    </RecoilRoot>,
  );
}

describe('MarkdownComponents anchor rendering', () => {
  const base = apiBaseUrl();

  it('renders a normal external link as an anchor', () => {
    renderAnchor('https://example.com/foo', 'external');
    const link = screen.getByText('external') as HTMLAnchorElement;
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://example.com/foo');
  });

  it('renders a link containing the base url as an image', () => {
    const testUrl = `${base}/api/files/foobar`;
    renderAnchor(testUrl, testUrl);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', testUrl);
  });

  it('still respects image extensions for non-base links', () => {
    const imgUrl = 'https://cdn.example.com/some.png';
    renderAnchor(imgUrl, imgUrl);
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', imgUrl);
  });
});
