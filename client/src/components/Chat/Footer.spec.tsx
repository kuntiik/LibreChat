import React from 'react';
import { render, screen } from '@testing-library/react';
import Footer from './Footer';

type StartupConfig = {
  analyticsGtmId?: string | null;
  customFooter?: string;
  interface?: {
    privacyPolicy?: {
      externalUrl?: string | null;
    };
    termsOfService?: {
      externalUrl?: string | null;
    };
  };
};

let mockStartupConfig: StartupConfig | undefined;

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('Footer', () => {
  beforeEach(() => {
    mockStartupConfig = undefined;
  });

  it('renders Mattoni footer fallback when customFooter is not set', () => {
    render(<Footer />);

    expect(screen.getByText('Mattoni 1873 - M chat')).toBeInTheDocument();
  });

  it('prefers customFooter when provided', () => {
    mockStartupConfig = {
      customFooter: 'Custom branded footer',
    };

    render(<Footer />);

    expect(screen.getByText('Custom branded footer')).toBeInTheDocument();
    expect(screen.queryByText('Mattoni 1873 - M chat')).not.toBeInTheDocument();
  });
});
