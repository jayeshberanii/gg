'use client';

import {
  type LeaveRequirement,
  type LoginResponse,
  type LoginSuccess,
  MAX_DECLINABLE_PENDING_WORK_REPORTS,
  type PendingWorkReport,
} from '@gglib/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useMessageBox } from '@/components/ui/MessageBox';
import { useWorkLog } from '@/features/work-log/WorkLogHost';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { APP_VERSION } from '@/lib/version';
import { useAuth } from './AuthProvider';
import { LeaveDialog } from './LeaveDialog';

/** frmlogin.vb plus the attendance steps of frmLogoutNew.SaveLog that follow it. */
export function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const msg = useMessageBox();
  const openWorkLog = useWorkLog();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [leave, setLeave] = useState<{ ticket: string; leave: LeaveRequirement } | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (auth.status === 'authenticated' && !busy) router.replace('/');
  }, [auth.status, busy, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (username.trim() === '') {
      await msg.alert('Please Enter User Name');
      usernameRef.current?.focus();
      return;
    }
    if (password.trim() === '') {
      await msg.alert('Please Enter Password');
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<LoginResponse>('/auth/login', { username, password });
      if (res.status === 'leave-required') setLeave({ ticket: res.ticket, leave: res.leave });
      else await afterLogin(res);
    } catch (err) {
      await msg.alert(errorMessage(err), 'Information');
      usernameRef.current?.focus();
      setBusy(false);
    }
  }

  async function onLeaveSave(leaveTypeId: number, reason: string) {
    if (!leave) return;
    if (leaveTypeId === 0) {
      await msg.alert('Please SELECT LeaveType');
      return;
    }
    if (leave.leave.mode === 'short-hours' && reason === '') {
      await msg.alert('Please Enter Reason');
      return;
    }
    try {
      const res = await api.post<LoginSuccess>('/auth/login/leave', {
        ticket: leave.ticket,
        leaveTypeId,
        reason,
      });
      setLeave(null);
      await afterLogin(res);
    } catch (err) {
      await msg.alert(errorMessage(err));
    }
  }

  /** "Last LogIn" message, then the pending work reports, then into the app. */
  async function afterLogin(res: LoginSuccess) {
    if (res.lastLogin) {
      await msg.alert(
        `Last LogIn Date : ${formatDate(res.lastLogin.date, '/')}\n` +
          `Last LogIn Time : ${res.lastLogin.time ?? ''}\n` +
          `Current LogIn Time : ${res.currentLoginTime}`,
      );
    }
    auth.signedIn(res.user);
    const entered = await resolvePendingWorkReports(res.pendingWorkReports);
    setBusy(false);
    if (entered) router.replace('/');
  }

  /**
   * SaveLog's loop: offer each pending day in turn. Declining is allowed while at most
   * MAX_DECLINABLE_PENDING_WORK_REPORTS are pending; otherwise the app exits. Closing the report
   * without saving ends the loop and continues into the app, as on the desktop.
   */
  async function resolvePendingWorkReports(initial: PendingWorkReport[]): Promise<boolean> {
    let pending = initial;
    while (pending.length > 0) {
      const first = pending[0]!;
      const fill = await msg.confirm(
        'Do You Want to Fill the Work Report?',
        `Your Work Report on: (${formatDate(first.logDate)}) is Pending`,
      );
      if (!fill) {
        if (pending.length <= MAX_DECLINABLE_PENDING_WORK_REPORTS) return true;
        await auth.signOut(false);
        await msg.alert(
          `You have ${pending.length} pending work reports. Please fill them to use the program.`,
        );
        return false;
      }
      if ((await openWorkLog({ logId: first.logId })) !== 'saved') return true;
      pending = await api.get<PendingWorkReport[]>('/auth/pending-work-reports');
    }
    return true;
  }

  /** btnexit_Click (`End`): close the program. A browser only lets a script close windows it opened. */
  function exitProgram() {
    window.close();
    setUsername('');
    setPassword('');
    usernameRef.current?.focus();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-2">
      <title>{`गीतार्थ गंगा (Library Login) Version - ${APP_VERSION}`}</title>
      <form
        onSubmit={(e) => void onSubmit(e)}
        aria-labelledby="login-title"
        className="win-frame w-[min(460px,100%)]"
      >
        <div className="win-titlebar">
          <img src="/favicon.ico" alt="" width={16} height={16} />
          <h1 id="login-title" className="truncate font-normal">
            गीतार्थ गंगा (Library Login) Version - {APP_VERSION}
          </h1>
        </div>
        {/* 458 x 242, white, the Gitarth Ganga logo zoomed behind the controls (frmlogin). */}
        <div
          className="relative h-[242px] bg-white bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/legacy/login-logo.jpg')" }}
        >
          <div className="grid grid-cols-[1fr] gap-y-2 px-3 pt-2 min-[470px]:grid-cols-[94px_264px] min-[470px]:gap-x-0 min-[470px]:pl-[94px]">
            <label htmlFor="uname" className="win-label self-center">
              User Name
            </label>
            <input
              id="uname"
              ref={usernameRef}
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              // frmlogin: the Left arrow key clears the user name.
              onKeyDown={(e) => e.key === 'ArrowLeft' && setUsername('')}
              className="win-textbox w-full"
            />
            <label htmlFor="upwd" className="win-label self-center">
              Password
            </label>
            <input
              id="upwd"
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="win-textbox w-full"
            />
            <div className="flex gap-1.5 min-[470px]:col-start-2">
              <button type="submit" disabled={busy} className="win-popup-button h-[27px] w-[88px]">
                Login
              </button>
              <button
                type="button"
                onClick={exitProgram}
                className="win-popup-button h-[26px] w-[86px]"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      </form>

      {leave && (
        <LeaveDialog
          leave={leave.leave}
          busy={false}
          onSave={(t, r) => void onLeaveSave(t, r)}
          onExit={() => {
            setLeave(null);
            setBusy(false);
          }}
        />
      )}
    </main>
  );
}
