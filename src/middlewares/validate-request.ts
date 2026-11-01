import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { z } from 'zod';

type RequestSchemas = Partial<Record<'body' | 'query' | 'params', z.ZodType>>;

export type ValidatedRequest<S extends RequestSchemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

export type ValidatedRequestLocals<S extends RequestSchemas> = {
  validated: ValidatedRequest<S>;
};

export function validateRequest<const S extends RequestSchemas>(
  schemas: S,
): RequestHandler<
  ParamsDictionary,
  unknown,
  unknown,
  ParsedQs,
  ValidatedRequestLocals<S>
> {
  return (req, res, next) => {
    const validated: Record<string, unknown> = {};
    const issues: z.ZodIssue[] = [];

    for (const source of ['body', 'query', 'params'] as const) {
      const schema = schemas[source];
      if (!schema) {
        continue;
      }

      const result = schema.safeParse(req[source]);
      if (result.success) {
        validated[source] = result.data;
      } else {
        issues.push(
          ...result.error.issues.map((issue) => ({
            ...issue,
            path: [source, ...issue.path],
          })),
        );
      }
    }

    if (issues.length > 0) {
      next(new z.ZodError(issues));
      return;
    }

    res.locals.validated = validated as ValidatedRequest<S>;
    next();
  };
}
