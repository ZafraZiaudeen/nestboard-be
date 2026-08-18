import { Prisma, type PrismaClient } from "../generated/client.js";
import { BookingStatus, PaymentStatus } from "../generated/enums.js";
import { prisma as defaultPrisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import type { CreateBookingInput } from "../schemas/booking.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { stripe } from "../lib/stripe.js";
import { toAdminBookingDTO } from "../lib/dto.js";
import { BOOKING_EXPIRY_MS } from "../lib/constants.js";

export function leaseRange(startMonth: string, durationMonths: number) {
  const [y, m] = startMonth.split("-").map(Number);
  if (!y || !m) throw Errors.validation("Invalid startMonth format");
  const start = new Date(Date.UTC(y, m - 1, 1));
  const endExclusive = new Date(Date.UTC(y, m - 1 + durationMonths, 1));
  const end = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function createBookingPending(
  tenantId: string,
  input: CreateBookingInput,
  db: PrismaClient = defaultPrisma,
) {
  const { start, end } = leaseRange(input.startMonth, input.durationMonths);
  //transaction is what helps to ensure that the booking creation process is atomic and consistent.
  // It allows us to perform multiple database operations as a single unit of work, ensuring that either all operations succeed or none do.
  // This is particularly important in scenarios where we need to check for conflicts, update existing records, and create new bookings without leaving the database in an inconsistent state.
  //For example let's say two users are trying to book the same seat at the same time. Without a transaction, both users could potentially pass the conflict check and create bookings for the same seat, leading to overbooking.
  // By using a transaction, we ensure that once one user's booking is being processed, the other user's booking will wait until the first transaction is complete, thus preventing conflicts and maintaining data integrity.
  return db.$transaction(
    async (tx) => {
      const room = await tx.room.findUnique({
        where: { id: input.roomId },
        include: { roomType: true },
      });
      if (!room) throw Errors.notFound("Room");
      if (input.seatNumber > room.roomType.seatCapacity) {
        throw Errors.validation(
          `Seat ${input.seatNumber} exceeds capacity ${room.roomType.seatCapacity}`,
        );
      }

      const conflict = await tx.booking.findFirst({
        where: {
          roomId: input.roomId,
          seatNumber: input.seatNumber,
          bookingStatus: {
            in: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
          },
          leaseStart: { lt: end },
          leaseEnd: { gt: start },
        },
        select: { id: true, bookingStatus: true, createdAt: true },
      });

      if (conflict) {
        // If the conflicting booking is in PENDING status and has been created more than 10 minutes ago, we consider it stale and update its status to EXPIRED and payment status to FAILED.
        const isStale =
          conflict.bookingStatus === BookingStatus.PENDING &&
          Date.now() - conflict.createdAt.getTime() > BOOKING_EXPIRY_MS;
        if (isStale) {
          await tx.booking.update({
            where: { id: conflict.id },
            data: {
              bookingStatus: BookingStatus.EXPIRED,
              paymentStatus: PaymentStatus.FAILED,
            },
          });
        } else {
          throw Errors.conflict("Seat unavailable for this period");
        }
      }

      const totalAmount = room.roomType.pricePerMonth.mul(input.durationMonths);

      return tx.booking.create({
        data: {
          tenantId,
          roomId: input.roomId,
          seatNumber: input.seatNumber,
          leaseStart: start,
          leaseEnd: end,
          durationMonths: input.durationMonths,
          totalAmount,
          paymentStatus: PaymentStatus.PENDING,
          bookingStatus: BookingStatus.PENDING,
        },
        include: {
          room: {
            include: {
              roomType: {
                include: {
                  property: true,
                },
              },
            },
          },
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, //isolation level ensures that the transaction is executed in a way that prevents other transactions from interfering with it, maintaining data integrity and consistency.
    },
  );
}

export async function startBookingCheckout(
  bookingId: string,
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  const booking = await db.$transaction(
    async (tx) => {
      const b = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!b) throw Errors.notFound("Booking");
      if (b.tenantId !== tenantId) throw Errors.forbidden("Booking");
      if (b.bookingStatus !== BookingStatus.PENDING) {
        throw Errors.conflict(`Booking is already ${b.bookingStatus}`);
      }
      if (Date.now() - b.createdAt.getTime() > BOOKING_EXPIRY_MS) {
        await tx.booking.update({
          where: { id: b.id },
          data: {
            bookingStatus: BookingStatus.EXPIRED,
            paymentStatus: PaymentStatus.FAILED,
          },
        });
        throw Errors.conflict("Booking expired before payment");
      }

      // Re-check seat availability: a CONFIRMED overlap or another PENDING still within
      // its payment window both block the checkout.
      const seatConflict = await tx.booking.findFirst({
        where: {
          id: { not: b.id },
          roomId: b.roomId,
          seatNumber: b.seatNumber,
          leaseStart: { lt: b.leaseEnd },
          leaseEnd: { gt: b.leaseStart },
          OR: [
            { bookingStatus: BookingStatus.CONFIRMED },
            {
              bookingStatus: BookingStatus.PENDING,
              createdAt: { gte: new Date(Date.now() - BOOKING_EXPIRY_MS) },
            },
          ],
        },
      });
      if (seatConflict) {
        await tx.booking.update({
          where: { id: b.id },
          data: {
            bookingStatus: BookingStatus.EXPIRED,
            paymentStatus: PaymentStatus.FAILED,
          },
        });
        throw Errors.conflict("Seat taken by another user");
      }

      return b;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min — matches BOOKING_EXPIRY_MS
    line_items: [
      {
        price_data: {
          currency: env.STRIPE_CURRENCY,
          unit_amount: Math.round(booking.totalAmount.toNumber() * 100),
          product_data: { name: `Booking ${booking.id}` },
        },
        quantity: 1,
      },
    ],
    success_url: env.STRIPE_SUCCESS_URL,
    cancel_url: env.STRIPE_CANCEL_URL,
    client_reference_id: booking.id,
    metadata: { bookingId: booking.id },
  });

  await db.booking.update({
    where: { id: bookingId },
    data: { stripeSessionId: session.id },
  });

  return session.url;
}

export async function listMyBookings(
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  // Lazy expiry: mark stale PENDING bookings as EXPIRED before returning the list
  await db.booking.updateMany({
    where: {
      tenantId,
      bookingStatus: BookingStatus.PENDING,
      createdAt: { lt: new Date(Date.now() - BOOKING_EXPIRY_MS) },
    },
    data: {
      bookingStatus: BookingStatus.EXPIRED,
      paymentStatus: PaymentStatus.FAILED,
    },
  });

  return db.booking.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      room: { include: { roomType: { include: { property: true } } } },
    },
  });
}

export async function confirmBookingFromWebhook(
  bookingId: string,
  stripeSessionId: string,
  db = defaultPrisma,
) {
  return db.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) return;

      if (booking.stripeSessionId != stripeSessionId) {
        logger.warn(
          `Unexpected session ${stripeSessionId}, expected ${booking.stripeSessionId}`,
        );
      }

      if (booking.bookingStatus !== BookingStatus.PENDING) {
        logger.warn(`Booking ${bookingId} paid already, reconcile manually`);
        return;
      }

      return tx.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          bookingStatus: BookingStatus.CONFIRMED,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function listVendorBookings(
  vendorId: string,
  db: PrismaClient = defaultPrisma,
) {
  const rows = await db.booking.findMany({
    where: { room: { roomType: { property: { vendorId } } } },
    include: {
      tenant: { select: { id: true, email: true, displayName: true } },
      room: { include: { roomType: { include: { property: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toAdminBookingDTO);
}

export async function cancelBooking(
  bookingId: string,
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, tenantId },
  });

  if (!booking) throw Errors.notFound("Booking");
  if (booking.bookingStatus !== BookingStatus.PENDING) {
    throw Errors.conflict("Only PENDING bookings can be cancelled");
  }

  if (booking.stripeSessionId) {
    try {
      await stripe.checkout.sessions.expire(booking.stripeSessionId);
    } catch {
      // Session may already be expired/completed — ignore
    }
  }

  return db.booking.update({
    where: { id: bookingId },
    data: {
      bookingStatus: BookingStatus.CANCELLED,
      paymentStatus: PaymentStatus.FAILED,
    },
  });
}

export async function expireBookingFromWebhook(
  bookingId: string,
  db = defaultPrisma,
) {
  return db.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking || booking.bookingStatus != BookingStatus.PENDING) return;
      return tx.booking.update({
        where: { id: bookingId },
        data: {
          paymentStatus: PaymentStatus.FAILED,
          bookingStatus: BookingStatus.EXPIRED,
        },
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}
