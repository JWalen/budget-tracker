import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { setupInstallPrompt, promptInstall, isStandalone } from '../utils/pwa';

// Renders an "Install app" affordance only when the browser reports the app is
// installable (fires `beforeinstallprompt`) and it isn't already running as an
// installed PWA. Renders nothing otherwise — so it's invisible on iOS Safari
// (which has no prompt event; users install via Share → Add to Home Screen) and
// once installed.
export default function InstallPWA({ className = '', variant = 'button' }) {
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    setupInstallPrompt(setInstallable);
  }, []);

  if (!installable) return null;

  const onClick = async () => {
    const accepted = await promptInstall();
    if (accepted) setInstallable(false);
  };

  if (variant === 'menu') {
    return (
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 ${className}`}
      >
        <Download size={16} />
        Install app
      </button>
    );
  }

  return (
    <button onClick={onClick} className={`btn-secondary btn-sm ${className}`} aria-label="Install app">
      <Download size={16} />
      Install app
    </button>
  );
}
