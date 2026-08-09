import { Prisma, type PrismaClient } from "../generated/client.js";
import { BookingStatus, PaymentStatus } from "../generated/enums.js";
import { prisma as defaultPrisma } from "../lib/prisma.js";
import { Errors } from "../lib/errors.js";
import type { CreateBookingInput } from "../schemas/booking.js";

const TEN_MIN_MS = 10 * 60 * 1000;

function leaseRange(startMonth: string, durationMonths: 3 | 6) {
  const [y, m] = startMonth.split("-").map(Number);
  if (!y || !m) throw Errors.validation("Invalid startMonth format");
  const start = new Date(Date.UTC(y, m - 1, 1));
  // end date with the extra day
  const endExclusive = new Date(Date.UTC(y, m - 1 + durationMonths, 1));
  // removing the last day
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
      });
      if (!room) throw Errors.notFound("Room");
      if (input.seatNumber > room.seatCapacity) {
        throw Errors.validation(
          `Seat ${input.seatNumber} exceeds capacity ${room.seatCapacity}`,
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
          Date.now() - conflict.createdAt.getTime() > TEN_MIN_MS;
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

      const totalAmount = room.pricePerMonth.mul(input.durationMonths);

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
      });
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable, //isolation level ensures that the transaction is executed in a way that prevents other transactions from interfering with it, maintaining data integrity and consistency.
    },
  );
}

export async function confirmBooking(
  bookingId: string,
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.$transaction(
    async (tx) => {
      const booking = await tx.booking.findUnique({ where: { id: bookingId } });
      if (!booking) throw Errors.notFound("Booking");
      if (booking.tenantId !== tenantId) throw Errors.forbidden("Booking");
      if (booking.bookingStatus !== BookingStatus.PENDING) {
        throw Errors.conflict(`Booking is already ${booking.bookingStatus}`);
      }
      if (Date.now() - booking.createdAt.getTime() > TEN_MIN_MS) {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            bookingStatus: BookingStatus.EXPIRED,
            paymentStatus: PaymentStatus.FAILED,
          },
        });
        throw Errors.conflict("Booking expired before payment");
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

export async function listMyBookings(
  tenantId: string,
  db: PrismaClient = defaultPrisma,
) {
  return db.booking.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: {
      room: { include: { property: true } },
    },
  });
}