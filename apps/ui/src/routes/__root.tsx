import { createRootRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, useCallback, useDeferredValue, useRef } from 'react';
import { createLogger } from '@automaker/utils/logger';
import { Sidebar } from '@/components/layout/sidebar';
import {
  FileBrowserProvider,
  useFileBrowser,
  setGlobalFileBrowser,
} from '@/contexts/file-browser-context';
import { useAppStore } from '@/store/app-store';
import { useSetupStore } from '@/store/setup-store';
import { useAuthStore } from '@/store/auth-store';
import { getElectronAPI, isElectron } from '@/lib/electron';
import { isMac } from '@/lib/utils';
import {
  initApiKey,
  isElectronMode,
  verifySession,
  getServerUrlSync,
  checkExternalServerMode,
  isExternalServerMode,
} from '@/lib/http-api-client';
import { Toaster } from 'sonner';
import { ThemeOption, themeOptions } from '@/config/theme-options';
import { LoadingState } from '@/components/ui/loading-state';

const logger = createLogger('RootLayout');

function RootLayoutContent() {
  const location = useLocation();
  const { setIpcConnected, currentProject, getEffectiveTheme } = useAppStore();
  const { setupComplete } = useSetupStore();
  const navigate = useNavigate();
  const [isMounted, setIsMounted] = useState(false);
  const [streamerPanelOpen, setStreamerPanelOpen] = useState(false);
  // Since we removed persist middleware (settings now sync via API),
  // we consider the store "hydrated" immediately - the useSettingsMigration
  // hook in App.tsx handles loading settings from the API
  const [setupHydrated, setSetupHydrated] = useState(true);
  const authChecked = useAuthStore((s) => s.authChecked);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { openFileBrowser } = useFileBrowser();

  const isSetupRoute = location.pathname === '/setup';
  const isLoginRoute = location.pathname === '/login';

  // Hidden streamer panel - opens with "\" key
  const handleStreamerPanelShortcut = useCallback((event: KeyboardEvent) => {
    const activeElement = document.activeElement;
    if (activeElement) {
      const tagName = activeElement.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return;
      }
      if (activeElement.getAttribute('contenteditable') === 'true') {
        return;
      }
      const role = activeElement.getAttribute('role');
      if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
        return;
      }
      // Don't intercept when focused inside a terminal
      if (activeElement.closest('.xterm') || activeElement.closest('[data-terminal-container]')) {
        return;
      }
    }

    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.key === '\\') {
      event.preventDefault();
      setStreamerPanelOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleStreamerPanelShortcut);
    return () => {
      window.removeEventListener('keydown', handleStreamerPanelShortcut);
    };
  }, [handleStreamerPanelShortcut]);

  const effectiveTheme = getEffectiveTheme();
  // Defer the theme value to keep UI responsive during rapid hover changes
  const deferredTheme = useDeferredValue(effectiveTheme);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Ref to prevent concurrent auth checks from running
  const authCheckRunning = useRef(false);

  // Initialize authentication
  // - Electron mode: Uses API key from IPC (header-based auth)
  // - Web mode: Uses HTTP-only session cookie
  useEffect(() => {
    // Prevent concurrent auth checks
    if (authCheckRunning.current) {
      return;
    }

    const initAuth = async () => {
      authCheckRunning.current = true;

      try {
        // Initialize API key for Electron mode
        await initApiKey();

        // Check if running in external server mode (Docker API)
        const externalMode = await checkExternalServerMode();

        // In Electron mode (but NOT external server mode), we're always authenticated via header
        if (isElectronMode() && !externalMode) {
          useAuthStore.getState().setAuthState({ isAuthenticated: true, authChecked: true });
          return;
        }

        // In web mode OR external server mode, verify the session cookie is still valid
        // by making a request to an authenticated endpoint
        const isValid = await verifySession();

        if (isValid) {
          useAuthStore.getState().setAuthState({ isAuthenticated: true, authChecked: true });
          return;
        }

        // Session is invalid or expired - treat as not authenticated
        useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
      } catch (error) {
        logger.error('Failed to initialize auth:', error);
        // On error, treat as not authenticated
        useAuthStore.getState().setAuthState({ isAuthenticated: false, authChecked: true });
      } finally {
        authCheckRunning.current = false;
      }
    };

    initAuth();
  }, []); // Runs once per load; auth state drives routing rules

  // Note: Setup store hydration is handled by useSettingsMigration in App.tsx
  // No need to wait for persist middleware hydration since we removed it

  // Routing rules (web mode and external server mode):
  // - If not authenticated: force /login (even /setup is protected)
  // - If authenticated but setup incomplete: force /setup
  useEffect(() => {
    if (!setupHydrated) return;

    // Check if we need session-based auth (web mode OR external server mode)
    const needsSessionAuth = !isElectronMode() || isExternalServerMode() === true;

    // Wait for auth check to complete before enforcing any redirects
    if (needsSessionAuth && !authChecked) return;

    // Unauthenticated -> force /login
    if (needsSessionAuth && !isAuthenticated) {
      if (location.pathname !== '/login') {
        navigate({ to: '/login' });
      }
      return;
    }

    // Authenticated -> determine whether setup is required
    if (!setupComplete && location.pathname !== '/setup') {
      navigate({ to: '/setup' });
      return;
    }

    // Setup complete but user is still on /setup -> go to app
    if (setupComplete && location.pathname === '/setup') {
      navigate({ to: '/' });
    }
  }, [authChecked, isAuthenticated, setupComplete, setupHydrated, location.pathname, navigate]);

  useEffect(() => {
    setGlobalFileBrowser(openFileBrowser);
  }, [openFileBrowser]);

  // Test IPC connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        if (isElectron()) {
          const api = getElectronAPI();
          const result = await api.ping();
          setIpcConnected(result === 'pong');
          return;
        }

        // Web mode: check backend availability without instantiating the full HTTP client
        const response = await fetch(`${getServerUrlSync()}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        setIpcConnected(response.ok);
      } catch (error) {
        logger.error('IPC connection failed:', error);
        setIpcConnected(false);
      }
    };

    testConnection();
  }, [setIpcConnected]);

  // Restore to board view if a project was previously open
  useEffect(() => {
    if (isMounted && currentProject && location.pathname === '/') {
      navigate({ to: '/board' });
    }
  }, [isMounted, currentProject, location.pathname, navigate]);

  // Apply theme class to document - use deferred value to avoid blocking UI
  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes dynamically from themeOptions
    const themeClasses = themeOptions
      .map((option) => option.value)
      .filter((theme) => theme !== ('system' as ThemeOption['value']));
    root.classList.remove(...themeClasses);

    if (deferredTheme === 'dark') {
      root.classList.add('dark');
    } else if (deferredTheme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(isDark ? 'dark' : 'light');
    } else if (deferredTheme && deferredTheme !== 'light') {
      root.classList.add(deferredTheme);
    } else {
      root.classList.add('light');
    }
  }, [deferredTheme]);

  // Show login page (full screen, no sidebar)
  if (isLoginRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  // Check if we need session-based auth (web mode OR external server mode)
  const needsSessionAuth = !isElectronMode() || isExternalServerMode() === true;

  // Wait for auth check before rendering protected routes (web mode and external server mode)
  if (needsSessionAuth && !authChecked) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <LoadingState message="Loading..." />
      </main>
    );
  }

  // Redirect to login if not authenticated (web mode and external server mode)
  // Show loading state while navigation to login is in progress
  if (needsSessionAuth && !isAuthenticated) {
    return (
      <main className="flex h-screen items-center justify-center" data-testid="app-container">
        <LoadingState message="Redirecting to login..." />
      </main>
    );
  }

  // Show setup page (full screen, no sidebar) - authenticated only
  if (isSetupRoute) {
    return (
      <main className="h-screen overflow-hidden" data-testid="app-container">
        <Outlet />
      </main>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden" data-testid="app-container">
      {/* Full-width titlebar drag region for Electron window dragging */}
      {isElectron() && (
        <div
          className={`fixed top-0 left-0 right-0 h-6 titlebar-drag-region z-40 pointer-events-none ${isMac ? 'pl-20' : ''}`}
          aria-hidden="true"
        />
      )}
      <Sidebar />
      <div
        className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
        style={{ marginRight: streamerPanelOpen ? '250px' : '0' }}
      >
        <Outlet />
      </div>

      {/* Hidden streamer panel - opens with "\" key, pushes content */}
      <div
        className={`fixed top-0 right-0 h-full w-[250px] bg-background border-l border-border transition-transform duration-300 ${
          streamerPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      />
      <Toaster richColors position="bottom-right" />
    </main>
  );
}

function RootLayout() {
  return (
    <FileBrowserProvider>
      <RootLayoutContent />
    </FileBrowserProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
