import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** `@Body(new ZodValidationPipe(schema))`. A failure becomes a 400 via HttpExceptionFilter. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
