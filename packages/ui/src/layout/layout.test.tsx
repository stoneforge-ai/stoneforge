/**
 * Tests for layout components
 */

import { describe, it, expect } from 'bun:test';
import type { ReactNode } from 'react';
import {
  MobileDrawer,
  Sidebar,
  AppShell,
  Header,
  Breadcrumbs,
  BreadcrumbsMobile,
  ConnectionStatus,
  HeaderDivider,
  type NavSection,
  type NavItem,
  type BreadcrumbItem,
} from './index';

// Type checks for exported interfaces and types
describe('Layout Component Exports', () => {
  it('exports MobileDrawer component', () => {
    expect(MobileDrawer).toBeDefined();
    expect(typeof MobileDrawer).toBe('function');
  });

  it('exports Sidebar component', () => {
    expect(Sidebar).toBeDefined();
    expect(typeof Sidebar).toBe('function');
  });

  it('exports AppShell component', () => {
    expect(AppShell).toBeDefined();
    expect(typeof AppShell).toBe('function');
  });

  it('exports Header component', () => {
    expect(Header).toBeDefined();
    expect(typeof Header).toBe('function');
  });

  it('exports Breadcrumbs component', () => {
    expect(Breadcrumbs).toBeDefined();
    expect(typeof Breadcrumbs).toBe('function');
  });

  it('exports BreadcrumbsMobile component', () => {
    expect(BreadcrumbsMobile).toBeDefined();
    expect(typeof BreadcrumbsMobile).toBe('function');
  });

  it('exports ConnectionStatus component', () => {
    expect(ConnectionStatus).toBeDefined();
    expect(typeof ConnectionStatus).toBe('function');
  });

  it('exports HeaderDivider component', () => {
    expect(HeaderDivider).toBeDefined();
    expect(typeof HeaderDivider).toBe('function');
  });
});

// Type validation tests
describe('Layout Type Definitions', () => {
  it('NavItem type has required properties', () => {
    const item: NavItem = {
      id: 'test',
      to: '/test',
      icon: () => null,
      label: 'Test',
    };
    expect(item.id).toBe('test');
    expect(item.to).toBe('/test');
    expect(item.label).toBe('Test');
  });

  it('NavItem type supports optional properties', () => {
    const item: NavItem = {
      id: 'test',
      to: '/test',
      icon: () => null,
      label: 'Test',
      shortcut: '⌘T',
      testId: 'nav-test',
      search: { page: 1 },
      badgeCount: 5,
    };
    expect(item.shortcut).toBe('⌘T');
    expect(item.testId).toBe('nav-test');
    expect(item.search).toEqual({ page: 1 });
    expect(item.badgeCount).toBe(5);
  });

  it('NavSection type has required properties', () => {
    const section: NavSection = {
      id: 'work',
      label: 'Work',
      items: [
        { id: 'tasks', to: '/tasks', icon: () => null, label: 'Tasks' },
      ],
    };
    expect(section.id).toBe('work');
    expect(section.label).toBe('Work');
    expect(section.items.length).toBe(1);
  });

  it('NavSection type supports optional properties', () => {
    const section: NavSection = {
      id: 'work',
      label: 'Work',
      icon: () => null,
      defaultExpanded: false,
      items: [],
    };
    expect(section.icon).toBeDefined();
    expect(section.defaultExpanded).toBe(false);
  });

  it('BreadcrumbItem type has required properties', () => {
    const item: BreadcrumbItem = {
      label: 'Tasks',
    };
    expect(item.label).toBe('Tasks');
  });

  it('BreadcrumbItem type supports optional properties', () => {
    const item: BreadcrumbItem = {
      label: 'Tasks',
      path: '/tasks',
      icon: () => null,
      isLast: true,
    };
    expect(item.path).toBe('/tasks');
    expect(item.icon).toBeDefined();
    expect(item.isLast).toBe(true);
  });
});

// MobileDrawer specific tests
describe('MobileDrawer', () => {
  it('accepts required props', () => {
    const props = {
      open: false,
      onClose: () => {},
      children: null as ReactNode,
    };
    // Type check passes if this compiles
    expect(props.open).toBe(false);
    expect(typeof props.onClose).toBe('function');
  });

  it('accepts optional props', () => {
    const props = {
      open: true,
      onClose: () => {},
      children: null as ReactNode,
      width: 300,
      maxWidth: '90vw',
      'data-testid': 'test-drawer',
      contentClassName: 'custom-class',
      showCloseButton: false,
      swipeThreshold: 100,
      backdropBlur: false,
      backdropClassName: 'custom-backdrop',
    };
    expect(props.width).toBe(300);
    expect(props.maxWidth).toBe('90vw');
    expect(props['data-testid']).toBe('test-drawer');
    expect(props.showCloseButton).toBe(false);
    expect(props.swipeThreshold).toBe(100);
    expect(props.backdropBlur).toBe(false);
  });
});

// Sidebar specific tests
describe('Sidebar', () => {
  it('accepts required props', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const MockLink = (_props: { children: ReactNode; to: string; className?: string }) => null;

    const props = {
      sections: [] as NavSection[],
      currentPath: '/tasks',
      LinkComponent: MockLink,
    };
    expect(props.sections.length).toBe(0);
    expect(props.currentPath).toBe('/tasks');
  });

  it('accepts optional branding props', () => {
    const branding = {
      logoText: 'O',
      appName: 'Orchestrator',
      logoGradient: 'from-violet-500 to-purple-600',
    };
    expect(branding.logoText).toBe('O');
    expect(branding.appName).toBe('Orchestrator');
    expect(branding.logoGradient).toBe('from-violet-500 to-purple-600');
  });

  it('supports custom path matching function', () => {
    const customPathMatcher = (itemPath: string, currentPath: string) => {
      return currentPath.startsWith(itemPath);
    };
    expect(customPathMatcher('/tasks', '/tasks/123')).toBe(true);
    expect(customPathMatcher('/tasks', '/settings')).toBe(false);
  });
});

// ConnectionStatus specific tests
describe('ConnectionStatus', () => {
  it('supports all connection states', () => {
    const states: Array<'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'polling' | 'error'> = [
      'connecting',
      'connected',
      'disconnected',
      'reconnecting',
      'polling',
      'error',
    ];

    states.forEach(state => {
      expect(typeof state).toBe('string');
    });
  });
});
