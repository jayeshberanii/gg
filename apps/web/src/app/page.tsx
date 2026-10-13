'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppShell } from '@/features/shell/AppShell';
import { WorkspaceProvider } from '@/features/shell/Workspace';
import { PreferencesProvider } from '@/lib/preferences';

export default function Home() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === 'anonymous') router.replace('/login');
  }, [auth.status, router]);

  if (auth.status !== 'authenticated') {
    return (
      <>
        <title>गीतार्थ गंगा (Library Program)</title>
        <p className="p-6">Loading…</p>
      </>
    );
  }
  return (
    <PreferencesProvider>
      <WorkspaceProvider>
        <AppShell user={auth.user} />
      </WorkspaceProvider>
    </PreferencesProvider>
  );
}
