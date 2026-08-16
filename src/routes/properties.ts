import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  toPropertyDetailDTO,
  toPropertyDTO,
  toRoomDTO,
  toRoomTypeDTO,
} from "../lib/dto.js";
import { validateBody } from "../middleware/validate.js";
import {
  createPropertySchema,
  updatePropertySchema,
  type CreatePropertyInput,
} from "../schemas/property.js";
import { Errors } from "../lib/errors.js";
import {
  createRoomSchema,
  createRoomTypeSchema,
  updateRoomTypeSchema,
  type CreateRoomInput,
} from "../schemas/room.js";
import { requireRole, verifyJwt } from "../middleware/auth.js";
import { BookingStatus, Role } from "../generated/enums.js";
import { BOOKING_EXPIRY_MS } from "../lib/constants.js";

export const propertiesRouter: Router = Router();

// Utility function to parse a positive integer from a string, with a fallback value.
function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getPagination(query: Record<string, unknown>) {
  const page = parsePositiveInt(query.page, 1);
  const rawLimit = parsePositiveInt(query.limit, 10);
  const limit = Math.min(rawLimit, 50);
  const skip = (page - 1) * limit;
  return { page, limit, skip, take: limit };
}

propertiesRouter.get("/", async (req, res, next) => {
  try {
    const { page, limit, skip, take } = getPagination(req.query);
    const where = { isActive: true };
    const [total, properties] = await prisma.$transaction([
      prisma.property.count({
        where,
      }),
      prisma.property.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { roomTypes: true },
      }),
    ]);
    const totalPages = Math.ceil(total / limit);
    res.json({
      data: properties.map(toPropertyDTO),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

propertiesRouter.get(
  "/mine",
  verifyJwt,
  requireRole("ADMIN"),
  async (req, res, next) => {
    try {
      const vendorId = req.user?.id;
      if (!vendorId) throw Errors.unauthenticated();
      const properties = await prisma.property.findMany({
        where: { isActive: true, vendorId },
        orderBy: { createdAt: "desc" },
        include: { roomTypes: true },
      });
      res.json(properties.map(toPropertyDTO));
    } catch (err) {
      next(err);
    }
  },
);

propertiesRouter.get("/map-list", async (_req, res, next) => {
  try {
    const properties = await prisma.property.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        city: true,
        latitude: true,
        longitude: true,
        imageUrl: true,
        rating: true,
      },
    });

    res.json(
      properties.map((property) => ({
        id: property.id,
        title: property.title,
        city: property.city,
        lat: property.latitude,
        lng: property.longitude,
        image: property.imageUrl,
        rating: Number(property.rating.toString()),
      })),
    );
  } catch (err) {
    next(err);
  }
});

propertiesRouter.get(
  "/my-favourites",
  verifyJwt,
  requireRole(Role.USER),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw Errors.unauthenticated();

      const favorites = await prisma.favorite.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
          property: { include: { roomTypes: { include: { rooms: true } } } },
        },
      });

      res.json(favorites.map((favorite) => toPropertyDTO(favorite.property)));
    } catch (err) {
      next(err);
    }
  },
);

// This route handler toggles the favorite status of a property for the authenticated user.
// If the property is already favorited, it will be removed from favorites;
// if not, it will be added to favorites.
propertiesRouter.patch(
  "/:id/toggle-favorite",
  verifyJwt,
  requireRole(Role.USER),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw Errors.unauthenticated();
      const requestedPropertyId = String(req.params.id);

      const property = await prisma.property.findFirst({
        where: { id: requestedPropertyId, isActive: true },
        select: { id: true },
      });
      if (!property) throw Errors.notFound("Property");
      const propertyId = property.id;

      // Create a composite key for the favorite relationship using userId and propertyId
      // to identify the unique favorite entry for this user and property combination.
      const key = { userId_propertyId: { userId, propertyId } };

      const existing = await prisma.favorite.findUnique({ where: key });
      if (existing) {
        await prisma.favorite.delete({ where: key });
        res.json({ propertyId, isFavorite: false });
        return;
      }

      await prisma.favorite.create({
        data: { userId, propertyId },
      });

      res.json({ propertyId, isFavorite: true });
    } catch (err) {
      next(err);
    }
  },
);

// Returns a Prisma include that counts only bookings that currently block a seat:
//   - CONFIRMED bookings (always block)
//   - PENDING bookings still inside the 3-day payment window
// Called as a function so the cutoff date is fresh on every request.
function activeBookingsInclude() {
  const paymentWindowCutoff = new Date(Date.now() - BOOKING_EXPIRY_MS);
  return {
    bookings: {
      where: {
        OR: [
          { bookingStatus: BookingStatus.CONFIRMED },
          {
            bookingStatus: BookingStatus.PENDING,
            createdAt: { gte: paymentWindowCutoff },
          },
        ],
      },
      select: {
        seatNumber: true,
        tenant: { select: { displayName: true } },
      },
    },
  };
}

propertiesRouter.get("/:id", async (req, res, next) => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: {
        roomTypes: {
          where: { isAvailable: true },
          include: { rooms: { include: activeBookingsInclude() } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!property) throw Errors.notFound("Property");
    res.json(toPropertyDetailDTO(property));
  } catch (err) {
    next(err);
  }
});

//make sure whatever is sent in the request body matches the schema defined in createPropertySchema.
// If it does, it will be added to the PROPERTIES array and returned in the response. If not, an error will be thrown.
propertiesRouter.post(
  "/",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(createPropertySchema),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw Errors.unauthenticated();
      const property = await prisma.property.create({
        data: {
          ...req.body,
          vendorId: userId,
        },
      });
      res.status(201).location(`${req.baseUrl}/${property.id}`).json(property);
    } catch (err) {
      next(err);
    }
  },
);

propertiesRouter.delete(
  "/:id",
  verifyJwt,
  requireRole(Role.ADMIN),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw Errors.unauthenticated();
      await prisma.property.delete({
        where: { id: String(req.params.id), vendorId: userId },
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

propertiesRouter.patch(
  "/:id",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(updatePropertySchema),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw Errors.unauthenticated();
      const updated = await prisma.property.update({
        where: { id: String(req.params.id), vendorId: userId },
        data: req.body,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

propertiesRouter.get("/:id/room-types", async (req, res, next) => {
  try {
    const property = await prisma.property.findUnique({
      where: { id: req.params.id },
      include: {
        roomTypes: {
          where: { isAvailable: true },
          include: { rooms: { include: activeBookingsInclude() } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!property) throw Errors.notFound("Property");

    res.json(property.roomTypes.map(toRoomTypeDTO));
  } catch (err) {
    next(err);
  }
});

propertiesRouter.get("/:id/room-types/:roomTypeId", async (req, res, next) => {
  try {
    const roomType = await prisma.roomType.findFirst({
      where: {
        id: req.params.roomTypeId,
        propertyId: req.params.id,
      },
      include: {
        rooms: {
          include: activeBookingsInclude(),
          orderBy: { roomLabel: "asc" },
        },
      },
    });

    if (!roomType) throw Errors.notFound("RoomType");

    res.json(toRoomTypeDTO(roomType));
  } catch (err) {
    next(err);
  }
});

propertiesRouter.post(
  "/:id/room-types",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(createRoomTypeSchema),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw Errors.unauthenticated();
      const property = await prisma.property.findFirst({
        where: { id: req.params.id as string, vendorId: userId },
      });
      if (!property) throw Errors.notFound("Property");
      const roomType = await prisma.roomType.create({
        data: {
          ...req.body,
          propertyId: property.id,
        },
      });
      res.status(201).json(roomType);
    } catch (err) {
      next(err);
    }
  },
);

propertiesRouter.delete(
  "/:id/room-types/:roomTypeId",
  verifyJwt,
  requireRole(Role.ADMIN),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw Errors.unauthenticated();
      const roomType = await prisma.roomType.findFirst({
        where: {
          id: req.params.roomTypeId as string,
          propertyId: req.params.id as string,
          property: { vendorId: userId },
        },
      });
      if (!roomType) throw Errors.notFound("RoomType");
      await prisma.roomType.delete({ where: { id: roomType.id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

propertiesRouter.patch(
  "/:id/room-types/:roomTypeId",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(updateRoomTypeSchema),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw Errors.unauthenticated();
      const roomType = await prisma.roomType.findFirst({
        where: {
          id: req.params.roomTypeId as string,
          propertyId: req.params.id as string,
          property: { vendorId: userId },
        },
      });
      if (!roomType) throw Errors.notFound("RoomType");
      const updated = await prisma.roomType.update({
        where: { id: roomType.id },
        data: req.body,
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

propertiesRouter.post(
  "/:id/room-types/:roomTypeId/rooms",
  verifyJwt,
  requireRole(Role.ADMIN),
  validateBody(createRoomSchema),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw Errors.unauthenticated();
      const roomType = await prisma.roomType.findFirst({
        where: {
          id: req.params.roomTypeId as string,
          propertyId: req.params.id as string,
          property: { vendorId: userId },
        },
      });
      if (!roomType) throw Errors.notFound("RoomType");
      const room = await prisma.room.create({
        data: { ...req.body, roomTypeId: roomType.id },
      });
      res.status(201).json(room);
    } catch (err) {
      next(err);
    }
  },
);

propertiesRouter.delete(
  "/:id/room-types/:roomTypeId/rooms/:roomId",
  verifyJwt,
  requireRole(Role.ADMIN),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) throw Errors.unauthenticated();
      const roomType = await prisma.roomType.findFirst({
        where: {
          id: req.params.roomTypeId as string,
          propertyId: req.params.id as string,
          property: { vendorId: userId },
        },
      });
      if (!roomType) throw Errors.notFound("RoomType");
      await prisma.room.delete({ where: { id: req.params.roomId as string } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// const ROOMS = [
//     { id: 'r1', propertyId: 'prop-001', name: 'Room A', price: 20000, seatsTotal: 2, seatsFree: 1, hasAC: true },
//     { id: 'r2', propertyId: 'prop-001', name: 'Room B', price: 22000, seatsTotal: 2, seatsFree: 2, hasAC: true },
//     { id: 'r3', propertyId: 'prop-002', name: 'Room C', price: 18000, seatsTotal: 3, seatsFree: 0, hasAC: false },
// ];

// This route handler retrieves all rooms associated with a specific property ID.
// propertiesRouter.get('/:id/rooms', (req, res) => {
//     const property = PROPERTIES.find(p => p.id === req.params.id);
//     if (!property) {
//         throw Errors.notFound('Property')
//     }
//     res.json(ROOMS.filter(r => r.propertyId === req.params.id));
// })

// // This route handler is responsible for creating a new room for a specific property.
// propertiesRouter.post('/:id/rooms', validateBody(createRoomSchema), (req, res) => {
//     const newRoom = req.body as CreateRoomInput;
//     const propertyId = req.params.id;
//     if (!propertyId || typeof propertyId === 'object') {
//         throw Errors.validation('Invalid Property ID')
//     }
//     ROOMS.push({
//         propertyId: propertyId,
//         ...newRoom //... means spread operator, which takes all the properties of newRoom and adds them to the new object being created.
//     });
//     res
//     .status(201)
//     .location(`${req.baseUrl}/${newRoom.id}`)
//     .json(newRoom);
// })

// // Task 1: room-types stub route (in-memory echo, no persistence)
// propertiesRouter.post('/:propertyId/room-types', validateBody(roomTypeSchema), (req, res) => {
//     res.status(201).json(req.body);
// })
