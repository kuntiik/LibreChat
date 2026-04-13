import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NewChat from './NewChat';

const mockInvalidateQueries = jest.fn();
const mockNewConversation = jest.fn();
const mockClearMessagesCache = jest.fn();
const mockUseGetStartupConfig = jest.fn();
const mockQueryClient = { invalidateQueries: mockInvalidateQueries };

jest.mock('recoil', () => ({
  useRecoilValue: () => ({ conversationId: 'conversation-1' }),
}));

jest.mock('librechat-data-provider', () => ({
  QueryKeys: { messages: 'messages' },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => mockUseGetStartupConfig(),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<number, string>) =>
    key === 'com_ui_logo' ? `Logo ${options?.[0] ?? ''}` : key,
  useNewConvo: () => ({ newConversation: mockNewConversation }),
}));

jest.mock('~/utils', () => ({
  clearMessagesCache: (...args: unknown[]) => mockClearMessagesCache(...args),
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
}));

jest.mock('@librechat/client', () => ({
  TooltipAnchor: ({ render }: { render: React.ReactElement }) => render,
  NewChatIcon: ({ className }: { className?: string }) => (
    <svg data-testid="new-chat-icon" className={className} />
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
}));

describe('NewChat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetStartupConfig.mockReturnValue({ data: undefined });
  });

  it('renders logo with default app title and new chat button', () => {
    render(<NewChat />);

    const logo = screen.getByRole('img', { name: 'Logo Mattoni 1873 - M Chat' });
    expect(logo).toHaveAttribute('src', 'assets/logo.png');
    expect(screen.getByTestId('nav-new-chat-button')).toBeInTheDocument();
  });

  it('starts a new conversation on regular click', () => {
    render(<NewChat />);
    fireEvent.click(screen.getByTestId('nav-new-chat-button'));

    expect(mockClearMessagesCache).toHaveBeenCalledWith(mockQueryClient, 'conversation-1');
    expect(mockInvalidateQueries).toHaveBeenCalledWith(['messages']);
    expect(mockNewConversation).toHaveBeenCalledTimes(1);
  });

  it('opens a new tab on ctrl/cmd click without mutating state', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    render(<NewChat />);
    fireEvent.click(screen.getByTestId('nav-new-chat-button'), { ctrlKey: true });

    expect(openSpy).toHaveBeenCalledWith('/c/new', '_blank');
    expect(mockClearMessagesCache).not.toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
    expect(mockNewConversation).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });
});
