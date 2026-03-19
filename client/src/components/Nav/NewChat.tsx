import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { TooltipAnchor, NewChatIcon, MobileSidebar, Sidebar, Button } from '@librechat/client';
import { CLOSE_SIDEBAR_ID, OPEN_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import { clearMessagesCache } from '~/utils';
import store from '~/store';

export default function NewChat({
  index = 0,
  toggleNav,
  subHeaders,
  isSmallScreen,
  headerButtons,
}: {
  index?: number;
  toggleNav: () => void;
  isSmallScreen?: boolean;
  subHeaders?: React.ReactNode;
  headerButtons?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  /** Note: this component needs an explicit index passed if using more than one */
  const { newConversation: newConvo } = useNewConvo(index);
  const navigate = useNavigate();
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const { conversation } = store.useCreateConversationAtom(index);
  const companyName = startupConfig?.appTitle ?? 'Mattoni 1873 - M Chat';

  const handleToggleNav = useCallback(() => {
    toggleNav();
    // Delay focus until after the sidebar animation completes (200ms)
    setTimeout(() => {
      document.getElementById(OPEN_SIDEBAR_ID)?.focus();
    }, 250);
  }, [toggleNav]);

  const clickHandler: React.MouseEventHandler<HTMLButtonElement> = useCallback(
    (e) => {
      if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
        window.open('/c/new', '_blank');
        return;
      }
      clearMessagesCache(queryClient, conversation?.conversationId);
      queryClient.invalidateQueries([QueryKeys.messages]);
      newConvo();
      navigate('/c/new', { state: { focusChat: true } });
      if (isSmallScreen) {
        toggleNav();
      }
    },
    [queryClient, conversation, newConvo, navigate, toggleNav, isSmallScreen],
  );

  return (
    <>
      <div className="flex items-center gap-2 px-2 pb-1 pt-2 md:pt-3">
        <img
          src="assets/logo.png"
          alt={localize('com_ui_logo', { 0: companyName })}
          className="h-16 w-28 shrink-0 object-contain"
        />
        <span className="truncate text-sm font-semibold text-text-primary">{companyName}</span>
      </div>
      <div className="flex items-center justify-between px-0.5 py-[2px] md:py-2">
        <TooltipAnchor
          description={localize('com_nav_close_sidebar')}
          render={
            <Button
              id={CLOSE_SIDEBAR_ID}
              size="icon"
              variant="outline"
              data-testid="close-sidebar-button"
              aria-label={localize('com_nav_close_sidebar')}
              aria-expanded={true}
              className="rounded-full border-none bg-transparent duration-0 hover:bg-surface-active-alt focus-visible:ring-inset focus-visible:ring-black focus-visible:ring-offset-0 dark:focus-visible:ring-white md:rounded-xl"
              onClick={handleToggleNav}
            >
              <Sidebar aria-hidden="true" className="max-md:hidden" />
              <MobileSidebar
                aria-hidden="true"
                className="icon-lg m-1 inline-flex items-center justify-center md:hidden"
              />
            </Button>
          }
        />
        <div className="flex gap-0.5">
          {headerButtons}

          <TooltipAnchor
            description={localize('com_ui_new_chat')}
            render={
              <Button
                size="icon"
                variant="outline"
                data-testid="nav-new-chat-button"
                aria-label={localize('com_ui_new_chat')}
                className="rounded-md border border-transparent bg-[#d1d6dc] text-[var(--brand-primary)] duration-0 hover:bg-[#c7ccd3] active:bg-[#b9c0c9] focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-sidebar)] md:rounded-md"
                onClick={clickHandler}
              >
                <NewChatIcon className="icon-lg !text-[var(--brand-primary-active)] dark:!text-[var(--brand-primary-active)]" />
              </Button>
            }
          />
        </div>
      </div>
      {subHeaders != null ? subHeaders : null}
    </>
  );
}
