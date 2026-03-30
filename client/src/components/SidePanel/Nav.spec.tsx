import React from 'react';
import { render, screen } from '@testing-library/react';
import type { NavLink } from '~/common';
import Nav from './Nav';

const mockUseGetStartupConfig = jest.fn();
const mockUseLocalize = jest.fn();
const mockUseActivePanel = jest.fn();
const mockResolveActivePanel = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => mockUseLocalize(),
}));

jest.mock('~/Providers', () => ({
  useActivePanel: () => mockUseActivePanel(),
  resolveActivePanel: (...args: unknown[]) => mockResolveActivePanel(...args),
}));

const MockIcon: React.FC = () => <svg aria-hidden="true" />;
const ActivePanel: React.FC = () => <div data-testid="active-panel">Active Panel</div>;

describe('SidePanel Nav', () => {
  beforeEach(() => {
    mockUseGetStartupConfig.mockReturnValue({ data: undefined });
    mockUseLocalize.mockReturnValue((key: string, options?: Record<number, string>) =>
      key === 'com_ui_logo' ? `Logo ${options?.[0] ?? ''}` : key,
    );
    mockUseActivePanel.mockReturnValue({ active: 'conversations' });
    mockResolveActivePanel.mockReturnValue('conversations');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders branded logo block and active panel content', () => {
    const links: NavLink[] = [
      {
        id: 'conversations',
        title: 'com_ui_chat_history',
        icon: MockIcon,
        Component: ActivePanel,
      },
    ];

    render(<Nav links={links} />);

    const logo = screen.getByRole('img', { name: 'Logo Mattoni 1873 - M chat' });
    expect(logo).toHaveAttribute('src', 'assets/logo.png');
    expect(screen.getByTestId('active-panel')).toBeInTheDocument();
  });
});
