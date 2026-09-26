import type { Queryable } from "../db/index.ts";
export interface BookingExtension {
  validate(
    tx: Queryable,
    tenantId: string,
    customerId: string,
    data: unknown,
  ): Promise<void>;
  save(
    tx: Queryable,
    tenantId: string,
    bookingId: string,
    data: unknown,
  ): Promise<void>;
}
export type VerticalRegistry = Record<string, BookingExtension>;
