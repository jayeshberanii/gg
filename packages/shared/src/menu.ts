import { type SessionUser, UserType } from './auth.js';

/**
 * The main menu of Frmlibmain (GGLibrarySolution/Library/CommonForms/Frmlibmain.Designer.vb),
 * item for item and in order. Items hidden in the designer and never shown at runtime are
 * left out. `visible` holds the runtime rules from Frmlibmain_Load; the same rules decide on
 * the API whether a user may use a screen at all (`canOpenScreen`).
 */
export type MenuUser = Pick<SessionUser, 'id' | 'isAdmin' | 'userType'>;
type Rule = (user: MenuUser) => boolean;

export type MenuAction =
  | 'exit'
  | 'login-logout'
  | 'window-cascade'
  | 'window-tile-vertical'
  | 'window-tile-horizontal'
  | 'window-close-all'
  | 'window-arrange-icons';

export type MenuItem =
  | { kind: 'separator' }
  | {
      kind: 'screen';
      /** Stable id, also used by the API's screen access check. */
      screen: string;
      label: string;
      /** The desktop form this item opens: the spec for the screen. */
      desktopForm: string;
      shortcut?: string;
      disabled?: boolean;
      visible?: Rule;
    }
  | { kind: 'action'; action: MenuAction; label: string; shortcut?: string; visible?: Rule }
  | { kind: 'submenu'; label: string; items: MenuItem[]; visible?: Rule };

export type Menu = {
  label: string;
  /** Alt+key opens the menu (the `&` in the desktop caption). */
  accessKey?: string;
  items: MenuItem[];
  visible?: Rule;
};

const sep: MenuItem = { kind: 'separator' };
const screen = (
  screenId: string,
  label: string,
  desktopForm: string,
  extra: { shortcut?: string; disabled?: boolean; visible?: Rule } = {},
): MenuItem => ({ kind: 'screen', screen: screenId, label, desktopForm, ...extra });

// const isAdmin: Rule = (u) => u.isAdmin;

export const MAIN_MENU: Menu[] = [
  {
    label: 'Master',
    accessKey: 'm',
    items: [
      // screen('prakashak-master-old', 'Old Prakashak Master', 'frmPrakashakMasterOld'),
      screen('prakashak-master', 'Prakashak Master', 'frmPrakashakMaster'),
      screen('author-master', 'Author Master', 'frmAuthorMaster'),
      screen('party-master', 'Party Master', 'frmPartyMaster'),
      screen('author-type-master', 'Author Type Master', 'frmAuthorType'),
      screen('bhasha-master', 'Bhasha Master', 'frmBhashaMaster'),
      screen('lipi-master', 'Lipi Master', 'frmLipiMaster'),
      sep,
      screen('column-master', 'Column Master', 'frmColumnMaster'),
      screen('sampraday-master', 'Sampraday Master', 'frmSampraday'),
      screen('vishesh-master', 'Vishesh Master', 'frmVisheshMaster'),
      sep,
      screen('vishay-master', 'Vishay Master', 'frmVishayMaster'),
      // screen('vishay-tree', 'Vishay Tree', 'frmTreeMast (Vishay)'),
      // screen('sampraday-tree', 'Sampraday Tree', 'frmTreeMast (visheshMast, sampraday)'),
      // Frmlibmain_Load: admins, and users 5 and 100 only.
      screen('apprisal-standard', 'Apprisal Standard', 'frmApprisalStandard', {
        visible: (u) => u.isAdmin || u.id === 5 || u.id === 100,
      }),
      // screen('prakashak-match-excel', 'Prakashak Match Excel', 'frmPrakashakMatchExcel'),
      screen('parishisht-namsuchi', 'Parishisht Namsuchi', 'frmParishistNamSuchi'),
      sep,
      { kind: 'action', action: 'exit', label: 'Exit', shortcut: 'Ctrl+Q' },
    ],
  },
  {
    label: 'Issue',
    accessKey: 'i',
    items: [
      screen('issue-master', 'Issue Master', 'frmIssueTran'),
      screen('inward-master', 'Inward Master', 'frmInwordMaster'),
      // screen('work-given-master', 'Work Given Master', 'frmWorkGivenMaster'),
      // Frmlibmain_Load: admins and user types Admin / AMaster only.
      screen('outsider-master', 'Outsider(Visitor) Master', 'frmOutsiderM', {
        visible: (u) =>
          u.isAdmin || u.userType === UserType.Admin || u.userType === UserType.AMaster,
      }),
      screen('lab-issue-master', 'Lab Issue Master', 'frmLabIssueMaster'),
      screen('book-confirmation', 'Book Confirmation', 'frmBookConfirmation'),
      sep,
      screen('letter-demand', 'Letter Demand', 'frmLetterDemandM'),
      screen('letter-bhet', 'Letter Bhet', 'frmLetterBhetM'),
      screen('patrika', 'Patrika', 'frmPatrika'),
      // screen('missing-libno', 'Missing LibNo', 'frmIssueMissingLibNo'),
    ],
  },
  {
    label: 'Library',
    accessKey: 'l',
    items: [
      screen('book-master', 'Book Master', 'frmBookMasterNew'),
      // screen('vyakhyan-master', 'Vyakhyan Master', 'frmVyakhyan'),
      screen('kruti-master', 'Kruti Master', 'frmKrutiMasterNew'),
      // screen('backup-detail', 'Backup Detail', 'frmBackupDetail'),
      sep,
      screen('english-book-vishesh', 'English Book Vishesh', 'frmEnglishBookVishesh'),
      screen('magazine-vishesh-master', 'Magazine Vishesh Master New', 'frmMagazineVisheshNew'),
      // Disabled in the designer.
      // screen('magazine-vishesh-master-old', 'Magazine Vishesh Master', 'frmMagazineVishesh', {
      //   disabled: true,
      // }),
      // screen('selection-master', 'Selection Master', 'frmSelectionMaster'),
      // screen('catalogue-master', 'Catalogue Master', 'frmBhandTranNew'),
      // screen('libno-stock-report', 'LibNo Stock Report', 'StockLibNo'),
      screen('anya-bhandar', 'Anya Bhandar', 'frmAnyaBhandar'),
      // screen('book-master-anya-bhandar', 'Book Master Anya Bhandar', 'FormPrakashanList'),
      sep,
      screen('magazine-master', 'Magazine Master', 'frmMagazineMaster'),
      // screen('inventory-management', 'Inventory Management', 'frmInventory'),
      // screen('hastprat-master', 'Hastprat Master', 'frmHastprat'),
      screen('tirth-raksha-master', 'Tirth Raksha Master', 'frmTirthRakshaMaster'),
    ],
  },
  {
    label: 'Graphics',
    accessKey: 'g',
    items: [
      screen('new-word-master', 'New Word Master', 'frmGrWordMaster'),
      // screen('graphics-word-master', 'Word Master', 'FormGraphicsWordMaster (Word)'),
      screen('new-vishay-master', 'New Vishay Master', 'frmGrVishayMaster'),
      // screen('graphics-vishay-master', 'Vishay Master', 'FormGraphicsWordMaster (Vishay)'),
      // screen('vishay-member', 'Vishay Member', 'frmTreeMast (GrVishay)'),
      sep,
      screen('graphics-master', 'Graphics Master', 'frmGraphicMaster'),
      screen('graphics-detail', 'Graphics Detail', 'frmGraphicsDetail'),
    ],
  },
  // {
  //   label: 'Article',
  //   items: [
  //     screen('read-lekh', 'Read Lekh', 'FormReadArticles'),
  //     screen('lekh-master', 'Lekh Master', 'frmLekhMasterNew'),
  //   ],
  // },
  // {
  //   label: 'Utility',
  //   items: [
  //     screen('global-search', 'Global Search New', 'frmGlobalSearchNew'),
  //     screen('insert-special-characters', 'Insert Special Characters', 'frmList1'),
  //     sep,
  //     screen('read-files', 'Read Files', 'FormReadFile'),
  //     screen('file-master', 'File Master', 'frmFileMst'),
  //     screen('rename-file-with-increment', 'Rename File With Increment', 'frmReadFileWithInc'),
  //     screen('import-data-from-excel', 'Imports Data From Excel', 'FrmImportData'),
  //     screen('compare-table', 'Compare Table', 'frmCompareTable'),
  //     sep,
  //     screen('complain-master', 'Complain Master', 'frmComplainList'),
  //     screen('backup-database', 'Back Up Data Base', 'DataBaseBackupUtility.exe'),
  //     sep,
  //     {
  //       kind: 'submenu',
  //       label: 'Word File Update',
  //       items: [
  //         screen('word-file-update-mangal', 'Mangal', 'UpdateDocFile (Mangal)'),
  //         screen('word-file-update-surekh', 'DV-TTSurekh', 'UpdateDocFile (DV-TTSurekh)'),
  //         {
  //           kind: 'submenu',
  //           label: 'Admin',
  //           visible: isAdmin,
  //           items: [
  //             screen(
  //               'replace-substring-admin',
  //               "Replace Specific SubString Globally in Specific Table's Column",
  //               'FormUpdataTable',
  //               { visible: isAdmin },
  //             ),
  //             screen('global-search-engine', 'GLOBAL SEARCH ENGINE', 'frmglobal', {
  //               visible: isAdmin,
  //             }),
  //             screen('export-table', 'Export Table', 'frmExportTable', { visible: isAdmin }),
  //           ],
  //         },
  //       ],
  //     },
  //     screen('akshar-garna', 'Akshar Garna', 'FormAksharGarna'),
  //     screen('proofing', 'Proofing', 'frmProofing'),
  //     screen('create-dictionary', 'Create Dictionary', 'frmDictionaryNew'),
  //     sep,
  //     screen('remove-substring-from-file', 'Remove Substring From File', 'UpdateDocFile'),
  //     screen('set-search-condition', 'Set Search Condition', 'clsCommon.SetSearchCondition'),
  //     screen('general-settings', 'General Settings', 'frmSearchAndSave (UserConfig)'),
  //     // Frmlibmain_Load: admins and user 13 only.
  //     screen(
  //       'replace-substring',
  //       "Replace Specific SubString Globally in Specific Table's Column",
  //       'FormUpdataTable',
  //       { visible: (u) => u.isAdmin || u.id === 13 },
  //     ),
  //     screen('match-records-from-excel', 'Match Records From Excel', 'frmMatchRecordsFromExcel'),
  //   ],
  // },
  {
    label: 'Windows',
    accessKey: 'w',
    items: [
      // { kind: 'action', action: 'window-cascade', label: 'Cascade' },
      // { kind: 'action', action: 'window-tile-vertical', label: 'Tile Vertical' },
      // { kind: 'action', action: 'window-tile-horizontal', label: 'Tile Horizontal' },
      { kind: 'action', action: 'window-close-all', label: 'Close All' },
      // { kind: 'action', action: 'window-arrange-icons', label: 'Arrange Icons' },
    ],
  },
  {
    label: 'Employee',
    items: [
      screen('employee-master', 'Employee Master', 'frmEmployeeNew'),
      { kind: 'action', action: 'login-logout', label: 'Login & Log Out' },
      screen('work-report', 'Work Report', 'frmWorkReportM'),
      screen('old-log-reports', 'Old Log Reports', 'frmLogReport'),
      screen('holiday', 'Holiday', 'frmHolidayM'),
      screen('leaves', 'Leaves', 'frmLeaveM'),
      // screen('tasks', 'Tasks', 'frmTask'),
      // screen('show-last-activity', 'Show Last Activity', 'frmLastActivity'),
      // screen('apprisal-report', 'Apprisal Report', 'frmEmpAppraisalReport'),
    ],
  },
  // {
  //   // Hidden in the designer; Frmlibmain_Load shows it to admins and user 100.
  //   label: 'Reports',
  //   visible: (u) => u.isAdmin || u.id === 100,
  //   items: [screen('employee-work-report', 'Employee Work Report', 'EmpWorkReport.rpt')],
  // },
];

const shown = (item: { visible?: Rule }, user: MenuUser) => !item.visible || item.visible(user);

function filterItems(items: MenuItem[], user: MenuUser): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    if (item.kind === 'separator') {
      if (out.length > 0 && out[out.length - 1]!.kind !== 'separator') out.push(item);
      continue;
    }
    if (!shown(item, user)) continue;
    if (item.kind === 'submenu') {
      const children = filterItems(item.items, user);
      if (children.length > 0) out.push({ ...item, items: children });
      continue;
    }
    out.push(item);
  }
  while (out.length > 0 && out[out.length - 1]!.kind === 'separator') out.pop();
  return out;
}

/** The menu as this user sees it. */
export function visibleMenu(user: MenuUser): Menu[] {
  return MAIN_MENU.filter((m) => shown(m, user))
    .map((m) => ({ ...m, items: filterItems(m.items, user) }))
    .filter((m) => m.items.length > 0);
}

type ScreenItem = Extract<MenuItem, { kind: 'screen' }>;

function screensOf(items: MenuItem[]): ScreenItem[] {
  return items.flatMap((i) =>
    i.kind === 'screen' ? [i] : i.kind === 'submenu' ? screensOf(i.items) : [],
  );
}

/** Every screen in the menu, keyed by id. */
export const SCREENS: ReadonlyMap<string, ScreenItem> = new Map(
  MAIN_MENU.flatMap((m) => screensOf(m.items)).map((s) => [s.screen, s]),
);

/**
 * Whether the user may use a screen: some enabled menu item that opens it is visible to
 * them. The API checks this for every screen's endpoints, so hiding a menu item also locks
 * the screen's data (the desktop only hid the menu item).
 */
export function canOpenScreen(user: MenuUser, screenId: string): boolean {
  return visibleMenu(user)
    .flatMap((m) => screensOf(m.items))
    .some((s) => s.screen === screenId && !s.disabled);
}
