import React from 'react';
import { render, screen } from '@testing-library/react';
import type { NavLink } from '~/common';
import ExpandedPanel from './ExpandedPanel';

jest.mock('recoil', () => ({
  useRecoilValue: () => ({ conversationId: 'conversation-1' }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('~/components/Nav/AccountSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="account-settings" />,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useNewConvo: () => ({ newConversation: jest.fn() }),
}));

jest.mock('~/Providers', () => ({
  useActivePanel: () => ({ active: 'conversations', setActive: jest.fn() }),
  resolveActivePanel: () => 'conversations',
}));

jest.mock('~/utils', () => ({
  clearMessagesCache: jest.fn(),
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

jest.mock('@librechat/client', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
  Sidebar: ({ className }: { className?: string }) => (
    <svg data-testid="sidebar-icon" className={className} />
  ),
  Button: ({
    children,
    className,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button className={className} {...props}>
      {children}
    </button>
  ),
  TooltipAnchor: ({ render }: { render: React.ReactElement }) => render,
  NewChatIcon: ({ className }: { className?: string }) => (
    <svg data-testid="new-chat-icon" className={className} />
  ),
}));

const MockIcon: React.FC = () => <svg aria-hidden="true" />;

describe('ExpandedPanel', () => {
  it('renders branded new chat CTA classes', () => {
    const links: NavLink[] = [
      {
        id: 'conversations',
        title: 'com_ui_chat_history',
        icon: MockIcon,
      },
    ];

    render(<ExpandedPanel links={links} expanded={true} />);

    const newChatButton = screen.getByTestId('new-chat-button');
    const icon = screen.getByTestId('new-chat-icon');

    expect(newChatButton.className).toContain('bg-[#d1d6dc]');
    expect(newChatButton.className).toContain('hover:bg-[#c7ccd3]');
    expect(newChatButton.className).toContain('active:bg-[#b9c0c9]');
    expect(newChatButton.className).toContain('rounded-md');
    expect(icon.className).toContain('!text-[var(--brand-primary-active)]');
  });
});
