'use client';

import {
  type MenuItem,
  type SessionUser,
  visibleMenu,
  workReportOnClose,
  workReportOnExitMenu,
  workReportOnLoginLogoutMenu,
} from '@gglib/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { useMessageBox } from '@/components/ui/MessageBox';
import { useAuth } from '@/features/auth/AuthProvider';
import { useWorkLog } from '@/features/work-log/WorkLogHost';
import { api, errorMessage } from '@/lib/api';
import { APP_VERSION } from '@/lib/version';
import { MenuBar } from './MenuBar';
import { CaptionButtons, useWorkspace, WorkspaceView } from './Workspace';

/** The main window (Frmlibmain): title, menu bar, MDI workspace and the exit paths. */
export function AppShell({ user }: { user: SessionUser }) {
  const auth = useAuth();
  const router = useRouter();
  const msg = useMessageBox();
  const openWorkLog = useWorkLog();
  const workspace = useWorkspace();

  const endSession = useCallback(
    async (recordLogoutTime: boolean) => {
      await auth.signOut(recordLogoutTime);
      router.replace('/login');
    },
    [auth, router],
  );

  /** Today's report was closed without saving: the desktop still stamps the logout time. */
  const stampLogoutTime = useCallback(async () => {
    try {
      await api.post(`/work-log/${user.logId}/logout-time`);
    } catch (err) {
      await msg.alert(errorMessage(err));
    }
  }, [msg, user.logId]);

  /** Master › Exit (mnuext_Click). */
  const exit = useCallback(async () => {
    if (!workReportOnExitMenu(user)) return endSession(false);
    const result = await openWorkLog();
    if (result === 'closed') await stampLogoutTime();
    else if (result === 'saved-exit') await endSession(false);
  }, [user, openWorkLog, stampLogoutTime, endSession]);

  /** Employee › Login & Log Out (LogOutToolStripMenuItem1_Click). */
  const loginLogout = useCallback(async () => {
    if (!workReportOnLoginLogoutMenu(user)) return;
    const result = await openWorkLog();
    if (result === 'closed') await stampLogoutTime();
    else if (result === 'saved-exit') await endSession(false);
  }, [user, openWorkLog, stampLogoutTime, endSession]);

  /** Closing the program (Frmlibmain_FormClosing). */
  const logout = useCallback(async () => {
    if (!workReportOnClose(user)) return endSession(false);
    const result = await openWorkLog();
    if (result === 'saved-continue') return;
    await endSession(result === 'closed');
  }, [user, openWorkLog, endSession]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        void exit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit]);

  const menus = visibleMenu(user);

  function onMenuSelect(item: Extract<MenuItem, { kind: 'screen' | 'action' }>) {
    if (item.kind === 'screen') return workspace.open(item.screen);
    switch (item.action) {
      case 'exit':
        return void exit();
      case 'login-logout':
        return void loginLogout();
      case 'window-cascade':
        return workspace.cascade();
      case 'window-tile-vertical':
        return workspace.tile('vertical');
      case 'window-tile-horizontal':
        return workspace.tile('horizontal');
      case 'window-arrange-icons':
        return workspace.arrangeIcons();
      case 'window-close-all':
        return workspace.closeAll();
    }
  }

  // Frmlibmain.Text, with the maximized child's title merged in as Windows does for MDI.
  const programTitle = `गीतार्थ गंगा (Library Program) Version - ${APP_VERSION}`;
  const { active, maximized } = workspace;

  return (
    <div className="flex h-screen flex-col">
      <title>{maximized && active ? `${programTitle} - [${active.title}]` : programTitle}</title>
      <MenuBar
        menus={menus}
        onSelect={onMenuSelect}
        windows={workspace.windows.map((w) => ({
          id: w.id,
          title: w.title,
          active: w.id === workspace.activeId,
        }))}
        onWindowSelect={workspace.activate}
        trailing={
          <div className="flex shrink-0 items-center gap-3 pl-2">
            <span
              className="hidden font-bold text-caption-brown md:inline"
              style={{ fontFamily: 'var(--font-field)', fontSize: 16 }}
            >
              Copyright @2026 - Gitarth Ganga
            </span>
            <span aria-label="Signed in as">{user.username}</span>
            <button type="button" onClick={() => void logout()} className="win-menu-top">
              Logout
            </button>
            {maximized && active && (
              <CaptionButtons
                compact
                title={active.title}
                onMinimize={() => workspace.minimize(active.id)}
                onMaximize={workspace.restore}
                restoreIcon
                onClose={() => workspace.close(active.id)}
              />
            )}
          </div>
        }
      />
      <WorkspaceView />
    </div>
  );
}
