import type { NavLink } from '~/common';
import { useActivePanel, resolveActivePanel } from '~/Providers';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';

export default function Nav({ links }: { links: NavLink[] }) {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const appTitle = startupConfig?.appTitle ?? 'Mattoni 1873 - M chat';
  const { active } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-center px-2 pb-1 pt-2 md:pt-3">
        <img
          src="assets/logo.png"
          alt={localize('com_ui_logo', { 0: appTitle })}
          className="h-16 w-28 shrink-0 object-contain"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pt-2 text-text-primary">
        {links.map((link) =>
          link.id === effectiveActive && link.Component ? <link.Component key={link.id} /> : null,
        )}
      </div>
    </div>
  );
}
