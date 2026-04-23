import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://stoneforge.ai',
  output: 'static',
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
    },
  },
  vite: {
    css: {
      postcss: {
        plugins: [
          (await import('@tailwindcss/postcss')).default,
          (await import('autoprefixer')).default,
        ],
      },
    },
  },
});
