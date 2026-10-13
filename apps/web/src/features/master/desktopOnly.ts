/** The message for a desktop feature the web app cannot run (file shares, Crystal Reports …). */
export function desktopOnlyMessage(what: string): string {
  return `${what} needs the desktop computers and cannot run in the web app.`;
}

/**
 * Utility › Show Attachments (CommonLibrary.frmAttachments): the files are paths on the desktop
 * computers' drives, which the web app cannot reach yet.
 */
export const ATTACHMENTS_DESKTOP_ONLY = desktopOnlyMessage(
  'Show Attachments (the files are on the desktop computers’ drives)',
);
