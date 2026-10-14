import type { LibraryFolder } from '@gglib/shared';
import { api, apiUrl } from '@/lib/api';

/** The address of a file of the desktop's folders (scans, e-books, graphics …), by its desktop path. */
export const libraryFileUrl = (screen: string, path: string) =>
  apiUrl(`/master/${screen}/library-file?path=${encodeURIComponent(path)}`);

/**
 * The file in a new browser tab: the image viewer's "Open in New Tab", and its download for a
 * file it cannot show. Screens open files with useImageViewer (Process.Start's equivalent).
 */
export function openLibraryFile(screen: string, path: string): void {
  window.open(libraryFileUrl(screen, path), '_blank', 'noopener');
}

/** One folder of the desktop's folders for LibraryFileDialog; '' lists the folders themselves. */
export const listLibraryFolder = (screen: string, path: string) =>
  api.get<LibraryFolder>(`/master/${screen}/library-folder?path=${encodeURIComponent(path)}`);
