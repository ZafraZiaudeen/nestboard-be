/**
 * B3 contract tests for lease-window availability.
 *
 * Proves three invariants:
 *   1. A seat is unavailable when a CONFIRMED booking overlaps the requested window.
 *   2. A seat is unavailable when a PENDING booking is still inside its payment window.
 *   3. A PENDING booking whose payment window has expired is marked EXPIRED and the
 *      new booking proceeds.
 *
 * Prisma is fully mocked — no database required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks (hoisted before imports) 

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

// Imports (after mocks) 

import { leaseRange } from "../booking-service.js";
const { prisma } = await import("../../lib/prisma.js");
const { createBookingPending } = await import("../booking-service.js");

// leaseRange unit tests

describe("leaseRange", () => {
  it("start is the first day of startMonth (UTC midnight)", () => {
    const { start } = leaseRange("2025-09", 1);
    expect(start).toEqual(new Date(Date.UTC(2025, 8, 1)));
  });

  it("end is the last day of the final month", () => {
    const { end } = leaseRange("2025-09", 1);
    expect(end).toEqual(new Date(Date.UTC(2025, 9, 1) - 86400_000)); // 2025-09-30
  });

  it("correctly spans a year boundary (Nov 2025 + 3 months → Jan 2026-31)", () => {
    const { start, end } = leaseRange("2025-11", 3);
    expect(start).toEqual(new Date(Date.UTC(2025, 10, 1)));
    expect(end).toEqual(new Date(Date.UTC(2026, 1, 1) - 86400_000)); // 2026-01-31
  });

  it("throws a validation error for a malformed startMonth", () => {
    expect(() => leaseRange("bad-month", 1)).toThrow();
  });
});

// createBookingPending conflict-detection tests 

const BOOKING_EXPIRY_MS = 30 * 60 * 1000;

function makeDecimal(n: number) {
  return { mul: (m: number) => ({ toString: () => String(n * m), toNumber: () => n * m }) };
}

function makeRoom(seatCapacity = 4) {
  return {
    id: "room-1",
    roomTypeId: "rt-1",
    roomType: {
      pricePerMonth: makeDecimal(40000),
      seatCapacity,
    },
  };
}

function makeTx(conflictBooking: object | null, room = makeRoom()) {
  return {
    room: {
      findUnique: vi.fn().mockResolvedValue(room),
    },
    booking: {
      findFirst: vi.fn().mockResolvedValue(conflictBooking),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: "new-booking" }),
    },
  };
}

const baseInput = {
  roomId: "room-1",
  seatNumber: 2,
  startMonth: "2025-09",
  durationMonths: 3,
};

describe("createBookingPending — conflict detection (B3 contract)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws 409 when a CONFIRMED booking overlaps the requested window", async () => {
    const confirmedConflict = {
      id: "existing-booking",
      bookingStatus: "CONFIRMED",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    };
    const tx = makeTx(confirmedConflict);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(createBookingPending("tenant-1", baseInput)).rejects.toThrow(/unavailable/i);
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it("throws 409 when a PENDING booking is inside its payment window", async () => {
    const freshPendingConflict = {
      id: "pending-booking",
      bookingStatus: "PENDING",
      createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago — still live
    };
    const tx = makeTx(freshPendingConflict);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(createBookingPending("tenant-1", baseInput)).rejects.toThrow(/unavailable/i);
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it("expires a stale PENDING booking and creates the new booking", async () => {
    const stalePendingConflict = {
      id: "stale-booking",
      bookingStatus: "PENDING",
      createdAt: new Date(Date.now() - BOOKING_EXPIRY_MS - 60_000), // expired
    };
    const tx = makeTx(stalePendingConflict);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(createBookingPending("tenant-1", baseInput)).resolves.toBeDefined();
    expect(tx.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stale-booking" },
        data: expect.objectContaining({ bookingStatus: "EXPIRED" }),
      }),
    );
    expect(tx.booking.create).toHaveBeenCalled();
  });

  it("creates the booking when no conflict exists", async () => {
    const tx = makeTx(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(createBookingPending("tenant-1", baseInput)).resolves.toBeDefined();
    expect(tx.booking.create).toHaveBeenCalled();
  });

  it("throws when seatNumber exceeds room seatCapacity", async () => {
    const tx = makeTx(null, makeRoom(1)); // capacity = 1, requested seat = 2
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(
      createBookingPending("tenant-1", { ...baseInput, seatNumber: 3 }),
    ).rejects.toThrow(/capacity/i);
  });
});
