'use client';

import { type GridRow, SCREENS } from '@gglib/shared';
import type { ComponentType } from 'react';
import { AnyaBhandar } from './AnyaBhandar';
import { ApprisalStandard } from './ApprisalStandard';
import { AuthorMaster } from './AuthorMaster';
import { AuthorTypeMaster } from './AuthorTypeMaster';
import { BhashaMaster } from './BhashaMaster';
import { BookConfirmation } from './BookConfirmation';
import { BookMaster } from './BookMaster';
import { ColumnMaster } from './ColumnMaster';
import { EmployeeMaster } from './EmployeeMaster';
import { GraphicsDetail } from './GraphicsDetail';
import { GraphicsMaster } from './GraphicsMaster';
import { GrVishayMaster } from './GrVishayMaster';
import { GrWordMaster } from './GrWordMaster';
import { HolidayMaster } from './HolidayMaster';
import { InwardMaster } from './InwardMaster';
import { LeavesMaster } from './LeavesMaster';
import { LetterBhet } from './LetterBhet';
import { LetterDemand } from './LetterDemand';
import { KrutiMaster } from './KrutiMaster';
import { IssueMaster } from './IssueMaster';
import { LabIssueMaster } from './LabIssueMaster';
import { LipiMaster } from './LipiMaster';
import { OldLogReports } from './OldLogReports';
import { OutsiderMaster } from './OutsiderMaster';
import { MagazineMaster } from './MagazineMaster';
import { MagazineVisheshMaster } from './MagazineVisheshMaster';
import { EnglishBookVishesh } from './EnglishBookVishesh';
import { ParishishtNamsuchi } from './ParishishtNamsuchi';
import { PartyMaster } from './PartyMaster';
import { Patrika } from './Patrika';
import { PrakashakMaster } from './PrakashakMaster';
import { SampradayMaster } from './SampradayMaster';
import { TirthRakshaMaster } from './TirthRakshaMaster';
import { VishayMaster } from './VishayMaster';
import { VisheshMaster } from './VisheshMaster';
import { WorkReport } from './WorkReport';

export type ScreenProps = {
  /** The window this screen instance lives in (several may be open, as on the desktop). */
  windowId: number;
  /** Closes this window (the form's Exit button / Me.Close()). */
  close: () => void;
  /** Only these records, when another screen opened this one (the desktop's StrId). */
  initialIds?: number[];
  /**
   * Another screen opened this one in Add mode with these values in its boxes (ActionResult
   * `open` with `newRecord`; `initialIds` is then [0], the desktop's StrId "0").
   */
  initialNew?: GridRow;
};

/**
 * Screens ported so far, keyed by the menu's screen id (packages/shared/src/menu.ts). A menu
 * item without an entry opens the "not yet available" placeholder.
 */
export const SCREEN_COMPONENTS: Partial<Record<string, ComponentType<ScreenProps>>> = {
  'bhasha-master': BhashaMaster,
  'author-master': AuthorMaster,
  'apprisal-standard': ApprisalStandard,
  'author-type-master': AuthorTypeMaster,
  'book-confirmation': BookConfirmation,
  'book-master': BookMaster,
  'column-master': ColumnMaster,
  'employee-master': EmployeeMaster,
  'graphics-detail': GraphicsDetail,
  'graphics-master': GraphicsMaster,
  holiday: HolidayMaster,
  'inward-master': InwardMaster,
  leaves: LeavesMaster,
  'letter-bhet': LetterBhet,
  'letter-demand': LetterDemand,
  'new-word-master': GrWordMaster,
  'new-vishay-master': GrVishayMaster,
  'kruti-master': KrutiMaster,
  'issue-master': IssueMaster,
  'lab-issue-master': LabIssueMaster,
  'lipi-master': LipiMaster,
  'old-log-reports': OldLogReports,
  'outsider-master': OutsiderMaster,
  'magazine-master': MagazineMaster,
  'magazine-vishesh-master': MagazineVisheshMaster,
  'tirth-raksha-master': TirthRakshaMaster,
  'anya-bhandar': AnyaBhandar,
  patrika: Patrika,
  'english-book-vishesh': EnglishBookVishesh,
  'parishisht-namsuchi': ParishishtNamsuchi,
  'party-master': PartyMaster,
  'prakashak-master': PrakashakMaster,
  'sampraday-master': SampradayMaster,
  'vishesh-master': VisheshMaster,
  'vishay-master': VishayMaster,
  'work-report': WorkReport,
};

export function screenTitle(screenId: string): string {
  return SCREENS.get(screenId)?.label ?? screenId;
}
