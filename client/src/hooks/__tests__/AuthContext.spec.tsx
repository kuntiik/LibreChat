import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { RecoilRoot } from 'recoil';
import { MemoryRouter } from 'react-router-dom';
import { AuthContextProvider, useAuthContext } from '../AuthContext';
import { setTokenHeader } from 'librechat-data-provider';

const mockUseGetRole = jest.fn();
const mockUseGetUserQuery = jest.fn();
const mockUseLoginUserMutation = jest.fn();
const mockUseLogoutUserMutation = jest.fn();
const mockUseRefreshTokenMutation = jest.fn();

jest.mock('~/data-provider', () => ({
  useGetRole: (...args: unknown[]) => mockUseGetRole(...args),
  useGetUserQuery: (...args: unknown[]) => mockUseGetUserQuery(...args),
  useLoginUserMutation: (...args: unknown[]) => mockUseLoginUserMutation(...args),
  useLogoutUserMutation: (...args: unknown[]) => mockUseLogoutUserMutation(...args),
  useRefreshTokenMutation: (...args: unknown[]) => mockUseRefreshTokenMutation(...args),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    user: jest.requireActual('recoil').atom({
      key: 'test_auth_context_user_atom',
      default: undefined,
    }),
  },
}));

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    setTokenHeader: jest.fn(),
  };
});

describe('AuthContext stale refresh protection', () => {
  let latestContext: ReturnType<typeof useAuthContext> | undefined;

  const Probe = () => {
    const context = useAuthContext();
    useEffect(() => {
      latestContext = context;
    }, [context]);
    return null;
  };

  const renderProvider = () =>
    render(
      <MemoryRouter>
        <RecoilRoot>
          <AuthContextProvider>
            <Probe />
          </AuthContextProvider>
        </RecoilRoot>
      </MemoryRouter>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    latestContext = undefined;

    mockUseGetRole.mockReturnValue({ data: null });
    mockUseGetUserQuery.mockReturnValue({
      data: undefined,
      isError: false,
      error: null,
    });
    mockUseLogoutUserMutation.mockReturnValue({
      mutate: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('applies refresh token response when there is no newer auth flow', () => {
    const loginMutate = jest.fn();
    let refreshHandlers: { onSuccess?: (data: unknown) => void } | undefined;
    const refreshMutate = jest.fn((_vars, handlers) => {
      refreshHandlers = handlers;
    });

    mockUseLoginUserMutation.mockReturnValue({ mutate: loginMutate });
    mockUseRefreshTokenMutation.mockReturnValue({ mutate: refreshMutate });

    renderProvider();

    expect(refreshMutate).toHaveBeenCalled();
    expect(refreshHandlers?.onSuccess).toBeDefined();

    act(() => {
      refreshHandlers?.onSuccess?.({
        token: 'fresh-token',
        user: { id: 'me', role: 'USER', email: 'me@example.com' },
      });
      jest.advanceTimersByTime(60);
    });

    expect(setTokenHeader).toHaveBeenLastCalledWith('fresh-token');
  });

  test('ignores stale refresh response after login starts', () => {
    const loginMutate = jest.fn();
    let refreshHandlers: { onSuccess?: (data: unknown) => void } | undefined;
    const refreshMutate = jest.fn((_vars, handlers) => {
      refreshHandlers = handlers;
    });

    mockUseLoginUserMutation.mockReturnValue({ mutate: loginMutate });
    mockUseRefreshTokenMutation.mockReturnValue({ mutate: refreshMutate });

    renderProvider();

    expect(latestContext).toBeDefined();
    expect(refreshHandlers?.onSuccess).toBeDefined();

    act(() => {
      latestContext?.login({
        email: 'me@example.com',
        password: 'password123',
      });
    });

    expect(loginMutate).toHaveBeenCalled();

    act(() => {
      refreshHandlers?.onSuccess?.({
        token: 'stale-token',
        user: { id: 'other-user', role: 'USER', email: 'other@example.com' },
      });
      jest.advanceTimersByTime(60);
    });

    expect(setTokenHeader).not.toHaveBeenCalledWith('stale-token');
  });
});
