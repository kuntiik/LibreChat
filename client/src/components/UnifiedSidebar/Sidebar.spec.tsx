import React from 'react';
import { render } from '@testing-library/react';
import type { NavLink } from '~/common';
import Sidebar from './Sidebar';

jest.mock('~/components/SidePanel/Nav', () => () => <div data-testid="side-panel-nav" />);
jest.mock('./ExpandedPanel', () => () => <div data-testid="expanded-panel" />);

const MockIcon: React.FC = () => <svg aria-hidden="true" />;

describe('Unified Sidebar', () => {
  it('applies sidebar-theme on the root wrapper', () => {
    const links: NavLink[] = [
      {
        id: 'conversations',
        title: 'com_ui_chat_history',
        icon: MockIcon,
      },
    ];

    const { container } = render(
      <Sidebar
        links={links}
        expanded={true}
        onCollapse={jest.fn()}
        onExpand={jest.fn()}
        onResizeStart={jest.fn()}
        onResizeKeyboard={jest.fn()}
      />,
    );

    expect(container.querySelector('.sidebar-theme')).toBeInTheDocument();
  });
});
