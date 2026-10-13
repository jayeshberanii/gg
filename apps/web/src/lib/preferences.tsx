'use client';

import {
  DEFAULT_SEARCH_SYNTAX,
  type FontSpec,
  type SearchSyntax,
  type UiPreferences,
} from '@gglib/shared';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const DEFAULT_FONT: FontSpec = {
  family: 'Arial Unicode MS',
  sizePt: 18,
  bold: false,
  italic: false,
};

type Preferences = {
  textBoxFont: FontSpec;
  gridFont: FontSpec;
  /** AndChar / OrChar / SplitChar / SearchCondition: for this session only, as on the desktop. */
  search: SearchSyntax;
  setSearch: (s: SearchSyntax) => void;
};

const Ctx = createContext<Preferences | null>(null);

/** 1pt = 4/3 px at 96 dpi, as WinForms draws them. */
export const ptToPx = (pt: number) => Math.round((pt * 4) / 3);

export function fontCss(f: FontSpec): React.CSSProperties {
  return {
    fontFamily: `'${f.family}', var(--font-grid-header)`,
    fontSize: ptToPx(f.sizePt),
    fontWeight: f.bold ? 700 : 400,
    fontStyle: f.italic ? 'italic' : 'normal',
  };
}

/**
 * The signed-in user's form fonts (UserConfig, applied to every text box and grid by
 * clsCommon.SetTextboxEvent) and search syntax.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<UiPreferences | null>(null);
  const [search, setSearch] = useState<SearchSyntax>(DEFAULT_SEARCH_SYNTAX);

  useEffect(() => {
    api
      .get<UiPreferences>('/me/preferences')
      .then((p) => {
        setLoaded(p);
        setSearch(p.search);
      })
      .catch(() => setLoaded(null));
  }, []);

  const value = useMemo<Preferences>(
    () => ({
      textBoxFont: loaded?.textBoxFont ?? DEFAULT_FONT,
      gridFont: loaded?.gridFont ?? DEFAULT_FONT,
      search,
      setSearch,
    }),
    [loaded, search],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences(): Preferences {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePreferences needs PreferencesProvider');
  return ctx;
}
