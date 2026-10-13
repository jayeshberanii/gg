import type { Metadata } from 'next';
import {
  Noto_Sans,
  Noto_Sans_Gujarati,
  Noto_Serif_Devanagari,
  Noto_Serif_Gujarati,
} from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// Fallbacks only: the desktop fonts (Times New Roman, Verdana, Arial Unicode MS, Segoe UI) are
// used where installed; these supply Gujarati/Devanagari and Latin glyphs elsewhere.
const notoSans = Noto_Sans({ subsets: ['latin', 'devanagari'], variable: '--font-noto-sans' });
const notoGujarati = Noto_Sans_Gujarati({
  subsets: ['gujarati'],
  variable: '--font-noto-gujarati',
});
const notoSerifGujarati = Noto_Serif_Gujarati({
  subsets: ['gujarati'],
  variable: '--font-noto-serif-gujarati',
});

// The reports' font (features/report), where the desktop's DVOT / Shree fonts are not installed.
const notoSerifDevanagari = Noto_Serif_Devanagari({
  subsets: ['devanagari', 'latin'],
  variable: '--font-noto-serif-devanagari',
});

// No static title: each page renders its window caption (the form's Text) as <title>.
export const metadata: Metadata = {
  description: 'GGLibrary web',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="gu"
      className={`${notoSans.variable} ${notoGujarati.variable} ${notoSerifGujarati.variable} ${notoSerifDevanagari.variable}`}
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
