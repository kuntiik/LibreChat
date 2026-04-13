import { useRecoilState } from 'recoil';
import { Button, Checkbox } from '@librechat/client';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function AutoSendPrompt({
  onCheckedChange,
}: {
  onCheckedChange?: (value: boolean) => void;
}) {
  const [autoSendPrompts, setAutoSendPrompts] = useRecoilState<boolean>(store.autoSendPrompts);
  const localize = useLocalize();

  const handleCheckedChange = (value: boolean) => {
    setAutoSendPrompts(value);
    if (onCheckedChange) {
      onCheckedChange(value);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => handleCheckedChange(!autoSendPrompts)}
      aria-label={localize('com_nav_auto_send_prompts')}
      aria-pressed={autoSendPrompts}
    >
      <Checkbox
        checked={autoSendPrompts}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none mr-2 data-[state=checked]:border-border-xheavy data-[state=checked]:bg-transparent data-[state=checked]:text-current"
      />
      {localize('com_nav_auto_send_prompts')}
    </Button>
  );
}
