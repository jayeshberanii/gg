import { bookFullCardPortrait } from '../../reports/book-cards.js';
import {
  krutiAgamSuchiNewReport,
  krutiFullCardLandscape,
  krutiFullCardPortrait,
} from '../../reports/kruti-cards.js';
import { int, text } from './book-common.js';
import type { ActionContext, ScreenDefinition } from './registry.js';

/**
 * The card and Crystal items of Kruti Master's and Book Master's Print menus
 * (reports/kruti-cards.ts, reports/book-cards.ts), kept apart from the screens' own action
 * files. See docs/screens/kruti-master.md and book-master.md, "Cards".
 */

type Actions = NonNullable<ScreenDefinition['actions']>;

const idsParam = (ctx: ActionContext, name: string): number[] => {
  const v = ctx.params[name];
  const list = Array.isArray(v) ? v : text(v).split(',');
  return list.map((s) => Number(s)).filter((n) => Number.isFinite(n) && n !== 0);
};

export const krutiCardActions: Actions = {
  // dv.ToTable: every row the grid shows, in its order.
  async 'full-card-portrait'(db, _user, _selected, ctx) {
    return { kind: 'report', document: await krutiFullCardPortrait(db, idsParam(ctx, 'gridIds')) };
  },
  async 'full-card-landscape'(db, _user, _selected, ctx) {
    return { kind: 'report', document: await krutiFullCardLandscape(db, idsParam(ctx, 'gridIds')) };
  },
  async 'agam-suchi-new'(db, _user, _selected, ctx) {
    return {
      kind: 'report',
      document: await krutiAgamSuchiNewReport(
        { db, env: ctx.env },
        {
          sampraday: int(ctx.params.sampraday),
          krutis: idsParam(ctx, 'ids'),
          printAdiAnt: ctx.params.printAdiAnt === true,
        },
      ),
    };
  },
};

export const bookCardActions: Actions = {
  // GetIdFrom_GridRecord(dgMain, "ColBookkm", False): the selected rows.
  async 'full-card-portrait'(db, _user, selected, ctx) {
    return {
      kind: 'report',
      document: await bookFullCardPortrait(db, selected, ctx.params.withParichayak === true),
    };
  },
};
