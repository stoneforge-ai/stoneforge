import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.stoneforge.ai',
  integrations: [
    starlight({
      title: 'stoneforge',
      logo: {
        src: './public/logo.svg',
      },
      social: {
        github: 'https://github.com/stoneforge-ai/stoneforge',
        discord: 'https://discord.gg/NBCaUUv8Vm',
        'x.com': 'https://x.com/stoneforge_ai',
      },
      customCss: [
        './src/styles/tokens.css',
        './src/styles/custom.css',
        './src/styles/dark-theme.css',
        './src/styles/light-theme.css',
        './src/styles/typography.css',
        './src/styles/animations.css',
        './src/styles/expressive-code.css',
      ],
      components: {
        Head: './src/components/overrides/Head.astro',
        Header: './src/components/overrides/Header.astro',
        Hero: './src/components/overrides/Hero.astro',
        Footer: './src/components/overrides/Footer.astro',
      },
      expressiveCode: {
        themes: ['github-dark', 'github-light'],
        styleOverrides: {
          borderRadius: '0.75rem',
        },
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
            { label: 'Core Concepts', slug: 'getting-started/core-concepts' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Your First Multi-Agent Project', slug: 'guides/first-multi-agent-project' },
            { label: 'Agent Roles', slug: 'guides/agent-roles' },
            { label: 'Task Planning', slug: 'guides/task-planning' },
            { label: 'Auto-Dispatch', slug: 'guides/auto-dispatch' },
            { label: 'Auto-Merge', slug: 'guides/auto-merge' },
            { label: 'Multi-Provider Support', slug: 'guides/multi-provider' },
            { label: 'Custom Prompts', slug: 'guides/custom-prompts' },
          ],
        },
        {
          label: 'Architecture',
          items: [
            { label: 'Event Sourcing', slug: 'architecture/event-sourcing' },
            { label: 'Orchestration Loop', slug: 'architecture/orchestration-loop' },
            { label: 'Worktree Isolation', slug: 'architecture/worktree-isolation' },
            { label: 'Dependency System', slug: 'architecture/dependency-system' },
            { label: 'Storage', slug: 'architecture/storage' },
            { label: 'Sync & Merge', slug: 'architecture/sync-and-merge' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'CLI', slug: 'reference/cli' },
            { label: 'Configuration', slug: 'reference/configuration' },
            { label: 'Core Types', slug: 'reference/core-types' },
            { label: 'Quarry API', slug: 'reference/quarry-api' },
            { label: 'Orchestrator API', slug: 'reference/orchestrator-api' },
            { label: 'Identity', slug: 'reference/identity' },
            { label: 'Services', slug: 'reference/services' },
          ],
        },
        {
          label: 'Community',
          items: [
            { label: 'Contributing', slug: 'community/contributing' },
            { label: 'Changelog', slug: 'community/changelog' },
            { label: 'Roadmap', slug: 'community/roadmap' },
          ],
        },
      ],
    }),
  ],
});
