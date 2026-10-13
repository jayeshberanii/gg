import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type ActionResult,
  actionRequestSchema,
  blankRequestSchema,
  f2ParamsSchema,
  type GridRow,
  type GridValue,
  listRequestSchema,
  logWorkReportRequestSchema,
  lockRequestSchema,
  type MasterMeta,
  type PickList,
  type PrintLayout,
  type PrintResult,
  printRequestSchema,
  rangeRequestSchema,
  saveHelpRequestSchema,
  saveLayoutRequestSchema,
  saveRequestSchema,
  type SaveResult,
  searchRequestSchema,
  searchValuesRequestSchema,
  securedIdsRequestSchema,
  type SessionUser,
  transLookupRequestSchema,
  type TransGrid,
  type WorkReportEntry,
} from '@gglib/shared';
import type { z } from 'zod';
import { CurrentUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MasterService } from './master.service.js';
import { ScreenParamGuard } from './screen-param.guard.js';
import { SecurityPassword } from './security-password.js';

/** The engine behind every master screen: /api/master/<screen-id>/... */
@UseGuards(ScreenParamGuard)
@Controller('master/:screen')
export class MasterController {
  constructor(
    private readonly master: MasterService,
    private readonly security: SecurityPassword,
  ) {}

  @Get('meta')
  meta(@Param('screen') screen: string, @CurrentUser() user: SessionUser): Promise<MasterMeta> {
    return this.master.meta(screen, undefined, user);
  }

  @Post('list')
  @HttpCode(HttpStatus.OK)
  list(
    @Param('screen') screen: string,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(listRequestSchema)) body: z.infer<typeof listRequestSchema>,
  ): Promise<GridRow[]> {
    return this.master.list(screen, body.ids, undefined, user, body.params);
  }

  @Get('record/:id')
  record(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUser,
  ): Promise<GridRow> {
    return this.master.record(screen, id, undefined, user);
  }

  /** lblEntry: who entered and last modified the record. */
  @Get('record/:id/entry')
  async entry(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUser,
  ): Promise<{ text: string }> {
    return { text: await this.master.entryUser(screen, id, undefined, user) };
  }

  /** btnNew_Click's starting values. */
  @Get('new-defaults')
  newDefaults(
    @Param('screen') screen: string,
    @CurrentUser() user: SessionUser,
    @Query() query: Record<string, unknown>,
  ): Promise<GridRow> {
    // The values the form carries into the new record (ScreenSpec.onNew): plain text only.
    const params = Object.fromEntries(
      Object.entries(query).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
    return this.master.newDefaults(screen, undefined, user, params);
  }

  /** F2 on a "…Tran" box: the popup's rows for record `id` (0 for a new record). */
  @Get('trans/:column/:id')
  trans(
    @Param('screen') screen: string,
    @Param('column') column: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUser,
  ): Promise<TransGrid> {
    return this.master.transGrid(screen, column, id, undefined, user);
  }

  /** F2 on a cell of a popup: its list, for the row it is on. */
  @Post('trans/:column/lookup/:lookup')
  @HttpCode(HttpStatus.OK)
  transLookup(
    @Param('screen') screen: string,
    @Param('column') column: string,
    @Param('lookup') lookup: string,
    @Body(new ZodValidationPipe(transLookupRequestSchema))
    body: z.infer<typeof transLookupRequestSchema>,
  ): Promise<PickList> {
    return this.master.transLookup(screen, column, lookup, body.row);
  }

  /** A list the form's menu picks from (DisplayListForm with a fixed query). */
  @Get('lists/:name')
  namedList(
    @Param('screen') screen: string,
    @Param('name') name: string,
    @Query() query: Record<string, unknown>,
  ): Promise<PickList> {
    // Only plain text values: a repeated or nested query key is dropped.
    const params = Object.fromEntries(
      Object.entries(query).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
    return this.master.namedList(screen, name, params);
  }

  /** F1 on a box: the field's reference rows, or null when it has none. */
  @Get('help/:column')
  async help(
    @Param('screen') screen: string,
    @Param('column') column: string,
  ): Promise<{ grid: TransGrid | null }> {
    return { grid: await this.master.helpGrid(screen, column) };
  }

  @Post('help/:column')
  @HttpCode(HttpStatus.NO_CONTENT)
  saveHelp(
    @Param('screen') screen: string,
    @Param('column') column: string,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(saveHelpRequestSchema)) body: z.infer<typeof saveHelpRequestSchema>,
  ): Promise<void> {
    return this.master.saveHelp(screen, user, column, body.rows);
  }

  @Get('f2/:column')
  pickList(
    @Param('screen') screen: string,
    @Param('column') column: string,
    @Query(new ZodValidationPipe(f2ParamsSchema)) params: z.infer<typeof f2ParamsSchema>,
    @CurrentUser() user: SessionUser,
  ): Promise<PickList> {
    return this.master.pickList(screen, column, params, undefined, user);
  }

  @Post('search-values')
  @HttpCode(HttpStatus.OK)
  searchValues(
    @Param('screen') screen: string,
    @Body(new ZodValidationPipe(searchValuesRequestSchema))
    body: z.infer<typeof searchValuesRequestSchema>,
    @CurrentUser() user: SessionUser,
  ): Promise<PickList> {
    return this.master.searchValues(screen, body, undefined, user);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  search(
    @Param('screen') screen: string,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(searchRequestSchema)) body: z.infer<typeof searchRequestSchema>,
  ): Promise<GridRow[]> {
    return this.master.search(screen, body, undefined, user);
  }

  @Post('search-range')
  @HttpCode(HttpStatus.OK)
  range(
    @Param('screen') screen: string,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(rangeRequestSchema)) body: z.infer<typeof rangeRequestSchema>,
  ): Promise<GridRow[]> {
    return this.master.range(screen, body, undefined, user);
  }

  @Post('search-blank')
  @HttpCode(HttpStatus.OK)
  blank(
    @Param('screen') screen: string,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(blankRequestSchema)) body: z.infer<typeof blankRequestSchema>,
  ): Promise<GridRow[]> {
    return this.master.blank(screen, body, undefined, user);
  }

  @Post('edit-lock/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  acquire(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.master.acquireEditLock(screen, user, id);
  }

  @Delete('edit-lock/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  release(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.master.releaseEditLock(screen, user, id);
  }

  @Post('save')
  @HttpCode(HttpStatus.OK)
  save(
    @Param('screen') screen: string,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(saveRequestSchema)) body: z.infer<typeof saveRequestSchema>,
  ): Promise<SaveResult> {
    return this.master.save(screen, user, body.id, body.fields);
  }

  /** The Work Type picked after a modification: write the pending work report entry. */
  @Post('work-report-log/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  logWorkReport(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(logWorkReportRequestSchema))
    body: z.infer<typeof logWorkReportRequestSchema>,
  ): Promise<void> {
    return this.master.logWorkReport(screen, user, id, body);
  }

  /** The WorkType choices a modification asks for. */
  @Get('work-report-types')
  async workReportTypes(): Promise<PickList> {
    return this.master.modifyWorkTypes();
  }

  @Post('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('screen') screen: string,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(securedIdsRequestSchema))
    body: z.infer<typeof securedIdsRequestSchema>,
  ): Promise<void> {
    this.security.assert(body.password);
    for (const id of body.ids) await this.master.delete(screen, user, id);
  }

  @Post('lock')
  @HttpCode(HttpStatus.OK)
  lock(
    @Param('screen') screen: string,
    @Body(new ZodValidationPipe(lockRequestSchema)) body: z.infer<typeof lockRequestSchema>,
  ): Promise<{ message: string; rows: GridRow[] }> {
    this.security.assert(body.password);
    return this.master.setLocked(screen, body.ids, body.lock);
  }

  @Get('work-report/:id')
  workReport(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: SessionUser,
  ): Promise<WorkReportEntry[]> {
    return this.master.workReport(screen, id, undefined, user);
  }

  @Get('work-report/:id/compare/:km')
  workReportCompare(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('km', ParseIntPipe) km: number,
    @CurrentUser() user: SessionUser,
  ): Promise<{ columns: string[]; rows: GridValue[][] }> {
    return this.master.workReportCompare(screen, id, km, undefined, user);
  }

  @Post('print')
  @HttpCode(HttpStatus.OK)
  print(
    @Param('screen') screen: string,
    @Body(new ZodValidationPipe(printRequestSchema)) body: z.infer<typeof printRequestSchema>,
    @CurrentUser() user: SessionUser,
  ): Promise<PrintResult> {
    return this.master.printSelectedColumn(screen, body, undefined, user);
  }

  @Post('print-layouts')
  @HttpCode(HttpStatus.OK)
  saveLayout(
    @Param('screen') screen: string,
    @Body(new ZodValidationPipe(saveLayoutRequestSchema))
    body: z.infer<typeof saveLayoutRequestSchema>,
  ): Promise<PrintLayout> {
    return this.master.savePrintLayout(screen, body);
  }

  @Delete('print-layouts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteLayout(
    @Param('screen') screen: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.master.deletePrintLayout(screen, id);
  }

  @Post('action/:name')
  @HttpCode(HttpStatus.OK)
  action(
    @Param('screen') screen: string,
    @Param('name') name: string,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(actionRequestSchema)) body: z.infer<typeof actionRequestSchema>,
  ): Promise<ActionResult> {
    return this.master.action(screen, user, name, body.ids, body.params);
  }
}
