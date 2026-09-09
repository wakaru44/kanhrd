/**
 * Bridge-internal helper types. NOT the wire contract — import that from
 * `@kanhrd/schema` (`packages/schema/src/{wire,herdr}.ts`).
 */

/**
 * One newline-delimited-JSON line read off a herdr socket. herdr multiplexes
 * request/response replies and pushed event frames on the same connection;
 * this is the union shape before we know which one we got.
 */
export interface RawHerdrLine {
  id?: string;
  ok?: boolean;
  result?: unknown;
  error?: { code?: string; message?: string };
  event?: string;
  data?: unknown;
}
