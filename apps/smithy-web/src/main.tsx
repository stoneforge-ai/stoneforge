import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { router } from './router';
import { TooltipProvider } from '@stoneforge/ui';
import { DataPreloader } from './components/shared/DataPreloader';
import { CurrentUserProvider, WorkspaceProvider } from './contexts';
import './index.css';

// Initialize theme before React renders to prevent flash of wrong theme
function initializeTheme() {
  const stored = localStorage.getItem('settings.theme');
  const theme = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;

  // Remove all theme classes first
  root.classList.remove('dark', 'theme-dark', 'theme-light');

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  if (resolvedTheme === 'dark') {
    root.classList.add('dark', 'theme-dark');
  } else {
    root.classList.add('theme-light');
  }
}

// Initialize theme immediately
initializeTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CurrentUserProvider>
        <WorkspaceProvider>
          <TooltipProvider>
            <DataPreloader>
              <RouterProvider router={router} />
            </DataPreloader>
            <Toaster
              position="bottom-right"
              duration={5000}
              richColors
              closeButton
            />
          </TooltipProvider>
        </WorkspaceProvider>
      </CurrentUserProvider>
    </QueryClientProvider>
  </StrictMode>
);
