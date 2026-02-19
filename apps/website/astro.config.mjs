import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://stoneforge.ai',
  output: 'static',
  integrations: [sitemap()],
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
