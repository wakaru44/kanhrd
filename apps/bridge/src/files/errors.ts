import type { RepoFileErrorCode } from '@kanhrd/schema';

/** A refusal the file methods answer with; `dispatch` maps `code` onto the wire verbatim. */
export class RepoFileError extends Error {
  constructor(
    readonly code: RepoFileErrorCode,
    message: string
  ) {
    super(message);
  }
}
