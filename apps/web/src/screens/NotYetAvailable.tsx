import { SCREENS } from '@gglib/shared';

/** Placeholder for a menu item whose screen has not been ported from the desktop yet. */
export function NotYetAvailable({ screenId, count }: { screenId: string; count?: number }) {
  const item = SCREENS.get(screenId);
  return (
    <div className="flex h-full items-center justify-center bg-alice-blue p-6">
      <div className="max-w-md text-center">
        <h3 className="win-label">{item?.label ?? screenId}</h3>
        <p className="mt-2 text-sm text-[#444]">
          This screen is not available on the web yet. Please use the desktop program for now.
        </p>
        {count !== undefined && (
          <p className="mt-2 text-[#444]">Opened for {count} record(s) from another screen.</p>
        )}
        {item && (
          <p className="mt-3 text-xs text-[#444]">
            Desktop form: <code>{item.desktopForm}</code>
          </p>
        )}
      </div>
    </div>
  );
}
