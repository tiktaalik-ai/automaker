import { useState, useCallback, useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { createLogger } from '@automaker/utils/logger';
import { router } from './utils/router';
import { SplashScreen } from './components/splash-screen';
import { LoadingState } from './components/ui/loading-state';
import { useSettingsMigration } from './hooks/use-settings-migration';
import { useSettingsSync } from './hooks/use-settings-sync';
import { useCursorStatusInit } from './hooks/use-cursor-status-init';
import './styles/global.css';
import './styles/theme-imports';

const logger = createLogger('App');

export default function App() {
  const [showSplash, setShowSplash] = useState(() => {
    // Only show splash once per session
    if (sessionStorage.getItem('automaker-splash-shown')) {
      return false;
    }
    return true;
  });

  // Clear accumulated PerformanceMeasure entries to prevent memory leak in dev mode
  // React's internal scheduler creates performance marks/measures that accumulate without cleanup
  useEffect(() => {
    if (import.meta.env.DEV) {
      const clearPerfEntries = () => {
        performance.clearMarks();
        performance.clearMeasures();
      };
      const interval = setInterval(clearPerfEntries, 5000);
      return () => clearInterval(interval);
    }
  }, []);

  // Run settings migration on startup (localStorage -> file storage)
  // IMPORTANT: Wait for this to complete before rendering the router
  // so that currentProject and other settings are available
  const migrationState = useSettingsMigration();
  if (migrationState.migrated) {
    logger.info('Settings migrated to file storage');
  }

  // Sync settings changes back to server (API-first persistence)
  const settingsSyncState = useSettingsSync();
  if (settingsSyncState.error) {
    logger.error('Settings sync error:', settingsSyncState.error);
  }

  // Initialize Cursor CLI status at startup
  useCursorStatusInit();

  const handleSplashComplete = useCallback(() => {
    sessionStorage.setItem('automaker-splash-shown', 'true');
    setShowSplash(false);
  }, []);

  // Wait for settings migration to complete before rendering the router
  // This ensures currentProject and other settings are available
  if (!migrationState.checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <LoadingState message="Loading settings..." />
      </div>
    );
  }

  return (
    <>
      <RouterProvider router={router} />
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
    </>
  );
}
