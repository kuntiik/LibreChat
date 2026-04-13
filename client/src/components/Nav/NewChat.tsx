import { useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { TooltipAnchor, Button, NewChatIcon } from '@librechat/client';
import type { MouseEventHandler } from 'react';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import { clearMessagesCache, cn } from '~/utils';
import store from '~/store';

const defaultAppTitle = 'Mattoni 1873 - M Chat';

export default function NewChat({ className }: { className?: string }) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { data: startupConfig } = useGetStartupConfig();
  const appTitle = startupConfig?.appTitle ?? defaultAppTitle;

  const clickHandler: MouseEventHandler<HTMLButtonElement> = (e) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      window.open('/c/new', '_blank');
      return;
    }
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
  };

  return (
    <>
      <div className="flex items-center justify-center px-2 pb-1 pt-2 md:pt-3">
        <img
          src="assets/logo.png"
          alt={localize('com_ui_logo', { 0: appTitle })}
          className="h-16 w-28 shrink-0 object-contain"
        />
      </div>
      <TooltipAnchor
        description={localize('com_ui_new_chat')}
        render={
          <Button
            size="icon"
            variant="outline"
            data-testid="nav-new-chat-button"
            aria-label={localize('com_ui_new_chat')}
            className={cn(
              'size-9 rounded-xl bg-presentation duration-0 hover:bg-surface-active-alt max-md:hidden',
              className,
            )}
            onClick={clickHandler}
          >
            <NewChatIcon />
          </Button>
        }
      />
    </>
  );
}
