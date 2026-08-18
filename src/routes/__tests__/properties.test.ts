/**
 * Route-level tests for GET /api/properties endpoints.
 *
 * Contract under test (B3):
 *   When startMonth + durationMonths are supplied, the Prisma query MUST include
 *   a half-open interval overlap filter on bookings:
 *     { leaseStart: { lt: window.end }, leaseEnd: { gt: window.start } }
 *
 *   When they are absent, no overlap filter is added (backward-compatible default).
 *
 * Prisma and env are fully mocked — no database or .env file required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// ── Mocks (hoisted by Vitest before any imports)

vi.mock("../../lib/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 3001,
    RATE_LIMIT: 1000,
    UPLOAD_LOCAL_DIR: "/tmp",
    UPLOAD_PROVIDER: "local",
  },
  corsOrigins: [],
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    property: { findUnique: vi.fn(), findMany: vi.fn() },
    roomType: { findFirst: vi.fn() },
  },
}));

vi.mock("../../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../generated/client.js", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, info: { code: string }) {
        super(message);
        this.code = info.code;
      }
    },
  },
}));

// Imports (after mocks) 

const { propertiesRouter } = await import("../../routes/properties.js");
const { errorHandler } = await import("../../middleware/error-handler.js");
const { prisma } = await import("../../lib/prisma.js");

// Helpers

function buildTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api/properties", propertiesRouter);
  app.use(errorHandler);
  return app;
}

const decimal = (n: number) => ({ toString: () => String(n), toNumber: () => n });

function fakeProperty(overrides: object = {}) {
  return {
    id: "prop-1",
    title: "Test House",
    description: "desc",
    address: "1 Main St",
    city: "Colombo",
    latitude: 6.9,
    longitude: 79.8,
    amenities: [],
    rating: decimal(4.5),
    minStay: "1 month",
    imageUrl: "https://example.com/img.jpg",
    type: "HOUSE",
    isActive: true,
    vendorId: "vendor-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    roomTypes: [],
    ...overrides,
  };
}

// Traverse the captured Prisma call args and extract the bookings `where` clause.
function extractBookingWhere(args: unknown): Record<string, unknown> {
  const a = args as {
    include?: {
      roomTypes?: {
        include?: {
          rooms?: {
            include?: {
              bookings?: { where?: Record<string, unknown> };
            };
          };
        };
      };
    };
  };
  return (
    a.include?.roomTypes?.include?.rooms?.include?.bookings?.where ?? {}
  );
}

// Tests

describe("GET /api/properties/:id — lease-window contract", () => {
  const app = buildTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls findUnique WITHOUT overlap filter when no lease params are given", async () => {
    vi.mocked(prisma.property.findUnique).mockResolvedValue(fakeProperty() as never);

    await request(app).get("/api/properties/prop-1").expect(200);

    const [args] = vi.mocked(prisma.property.findUnique).mock.calls[0] as [{ include: unknown }][];
    const bookingWhere = extractBookingWhere(args);

    expect(bookingWhere).not.toHaveProperty("leaseStart");
    expect(bookingWhere).not.toHaveProperty("leaseEnd");
  });

  it("calls findUnique WITH overlap filter when startMonth + durationMonths are given", async () => {
    vi.mocked(prisma.property.findUnique).mockResolvedValue(fakeProperty() as never);

    await request(app)
      .get("/api/properties/prop-1")
      .query({ startMonth: "2025-09", durationMonths: "1" })
      .expect(200);

    const [args] = vi.mocked(prisma.property.findUnique).mock.calls[0] as [{ include: unknown }][];
    const bookingWhere = extractBookingWhere(args);

    expect(bookingWhere).toHaveProperty("leaseStart");
    expect(bookingWhere).toHaveProperty("leaseEnd");
    // Sep 2025 window: start = 2025-09-01, end = 2025-09-30
    const leaseStart = bookingWhere.leaseStart as { lt: Date };
    const leaseEnd = bookingWhere.leaseEnd as { gt: Date };
    expect(leaseStart.lt).toBeInstanceOf(Date);
    expect(leaseEnd.gt).toBeInstanceOf(Date);
    // end is Sep 30 (last day of Sep, month index 8 in UTC)
    expect(leaseStart.lt.getUTCMonth()).toBe(8);
    expect(leaseEnd.gt.getUTCFullYear()).toBe(2025);
  });

  it("ignores invalid startMonth and falls back to no overlap filter", async () => {
    vi.mocked(prisma.property.findUnique).mockResolvedValue(fakeProperty() as never);

    await request(app)
      .get("/api/properties/prop-1")
      .query({ startMonth: "bad-value", durationMonths: "3" })
      .expect(200);

    const [args] = vi.mocked(prisma.property.findUnique).mock.calls[0] as [{ include: unknown }][];
    const bookingWhere = extractBookingWhere(args);

    expect(bookingWhere).not.toHaveProperty("leaseStart");
  });

  it("returns 404 when the property does not exist", async () => {
    vi.mocked(prisma.property.findUnique).mockResolvedValue(null);

    const res = await request(app).get("/api/properties/missing-id");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});


function extractBookingWhereFromRoomTypes(args: unknown): Record<string, unknown> {
  const a = args as {
    include?: {
      roomTypes?: {
        include?: {
          rooms?: {
            include?: {
              bookings?: { where?: Record<string, unknown> };
            };
          };
        };
      };
    };
  };
  return (
    a.include?.roomTypes?.include?.rooms?.include?.bookings?.where ?? {}
  );
}

describe("GET /api/properties/:id/room-types — lease-window contract", () => {
  const app = buildTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards lease window params to Prisma include", async () => {
    vi.mocked(prisma.property.findUnique).mockResolvedValue(fakeProperty() as never);

    await request(app)
      .get("/api/properties/prop-1/room-types")
      .query({ startMonth: "2025-11", durationMonths: "3" })
      .expect(200);

    const [args] = vi.mocked(prisma.property.findUnique).mock.calls[0] as [{ include: unknown }][];
    const bookingWhere = extractBookingWhereFromRoomTypes(args);

    expect(bookingWhere).toHaveProperty("leaseStart");
    expect(bookingWhere).toHaveProperty("leaseEnd");
  });

  it("omits overlap filter when no lease params", async () => {
    vi.mocked(prisma.property.findUnique).mockResolvedValue(fakeProperty() as never);

    await request(app).get("/api/properties/prop-1/room-types").expect(200);

    const [args] = vi.mocked(prisma.property.findUnique).mock.calls[0] as [{ include: unknown }][];
    const bookingWhere = extractBookingWhereFromRoomTypes(args);

    expect(bookingWhere).not.toHaveProperty("leaseStart");
  });

  it("returns 404 when property is not found", async () => {
    vi.mocked(prisma.property.findUnique).mockResolvedValue(null);

    const res = await request(app).get("/api/properties/missing/room-types");
    expect(res.status).toBe(404);
  });
});


function extractBookingWhereFromRoomType(args: unknown): Record<string, unknown> {
  const a = args as {
    include?: {
      rooms?: {
        include?: {
          bookings?: { where?: Record<string, unknown> };
        };
      };
    };
  };
  return a.include?.rooms?.include?.bookings?.where ?? {};
}

describe("GET /api/properties/:id/room-types/:roomTypeId — lease-window contract", () => {
  const app = buildTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function fakeRoomType(overrides: object = {}) {
    return {
      id: "rt-1",
      name: "Standard",
      pricePerMonth: decimal(40000),
      seatCapacity: 2,
      hasAC: true,
      amenities: [],
      isAvailable: true,
      propertyId: "prop-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      rooms: [],
      ...overrides,
    };
  }

  it("forwards lease window params to Prisma findFirst include", async () => {
    vi.mocked(prisma.roomType.findFirst).mockResolvedValue(fakeRoomType() as never);

    await request(app)
      .get("/api/properties/prop-1/room-types/rt-1")
      .query({ startMonth: "2026-01", durationMonths: "6" })
      .expect(200);

    const [args] = vi.mocked(prisma.roomType.findFirst).mock.calls[0] as [{ include: unknown }][];
    const bookingWhere = extractBookingWhereFromRoomType(args);

    expect(bookingWhere).toHaveProperty("leaseStart");
    expect(bookingWhere).toHaveProperty("leaseEnd");
  });

  it("omits overlap filter when no lease params", async () => {
    vi.mocked(prisma.roomType.findFirst).mockResolvedValue(fakeRoomType() as never);

    await request(app).get("/api/properties/prop-1/room-types/rt-1").expect(200);

    const [args] = vi.mocked(prisma.roomType.findFirst).mock.calls[0] as [{ include: unknown }][];
    const bookingWhere = extractBookingWhereFromRoomType(args);

    expect(bookingWhere).not.toHaveProperty("leaseStart");
  });

  it("returns 404 when room type is not found", async () => {
    vi.mocked(prisma.roomType.findFirst).mockResolvedValue(null);

    const res = await request(app).get("/api/properties/prop-1/room-types/missing-rt");
    expect(res.status).toBe(404);
  });
});
