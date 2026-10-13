/** The message for a desktop feature the web app cannot run (file shares, Crystal Reports …). */
export function desktopOnlyMessage(what: string): string {
  return `${what} needs the desktop computers and cannot run in the web app.`;
}
