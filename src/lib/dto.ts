import type {
  Property as PrismaProperty,
  Room as PrismaRoom,
  RoomType as PrismaRoomType,
  Booking as PrismaBooking,
} from "../generated/client.js";
import type { PropertyType } from "../generated/client.js";

export type PropertyDTO = {
  id: string;
  title: string;
  description: string;
  location: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  type: "House" | "Villa" | "Apartment" | "Hotel";
  price: string;
  rating: number;
  image: string;
  amenities: string[];
};

const TYPE_LABEL: Record<PropertyType, PropertyDTO["type"]> = {
  HOUSE: "House",
  VILLA: "Villa",
  APARTMENT: "Apartment",
  HOTEL: "Hotel",
};

function compactKilo(n: number): string {
  if (n < 1000) return Math.round(n).toString();
  const k = n / 1000;
  return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
}

export function toPropertyDTO(
  p: PrismaProperty & { roomTypes?: PrismaRoomType[] },
): PropertyDTO {
  const prices = (p.roomTypes ?? [])
    .map((rt) => Number(rt.pricePerMonth.toString()))
    .filter((n) => n > 0);

  const minPrice = prices.length ? Math.min(...prices) : null;

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    location: `${p.address}, ${p.city}`,
    address: p.address,
    city: p.city,
    latitude: p.latitude,
    longitude: p.longitude,
    type: TYPE_LABEL[p.type],
    price: minPrice !== null ? compactKilo(minPrice) : "-",
    rating: Number(p.rating.toString()),
    image: p.imageUrl,
    amenities: p.amenities,
  };
}

export type PropertyDetailDTO = {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  amenities: string[];
  rating: number;
  seatsAvailable: number;
  minStay: string;
  startingPrice: string;
  image: string;
  roomTypes: RoomTypeDTO[];
};

export type SeatDTO = {
  seatNumber: number;
  isOccupied: boolean;
  tenantInitials: string | null;
};

export type RoomDTO = {
  id: string;
  roomLabel: string;
  isAvailable: boolean;
  seats: SeatDTO[];
};

export type RoomTypeDTO = {
  id: string;
  name: string;
  price: string;
  pricePerMonthRaw: number;
  seatCapacity: number;
  seatsTotal: number;
  seatsFree: number;
  hasAC: boolean;
  amenities: string[];
  rooms?: RoomDTO[];
};

function money(n: number): string {
  return Math.round(n).toLocaleString("en-LK");
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// bookings is optionally injected by routes that need occupancy data
type RoomWithBookings = PrismaRoom & {
  bookings?: { seatNumber: number; tenant: { displayName: string } }[];
};
type RoomTypeWithRooms = PrismaRoomType & { rooms: RoomWithBookings[] };

export function toRoomTypeDTO(roomType: RoomTypeWithRooms): RoomTypeDTO {
  const rooms = roomType.rooms ?? [];
  const activeRooms = rooms.filter((room) => room.isAvailable);
  const totalSeats = roomType.seatCapacity * activeRooms.length;

  // Each booking record represents one occupied seat in a room.
  // Subtract confirmed/pending bookings so seatsFree reflects real availability.
  const occupiedSeats = activeRooms.reduce(
    (sum, room) => sum + (room.bookings?.length ?? 0),
    0,
  );
  const seatsFree = Math.max(0, totalSeats - occupiedSeats);

  return {
    id: roomType.id,
    name: roomType.name,
    price: money(Number(roomType.pricePerMonth.toString())),
    pricePerMonthRaw: Number(roomType.pricePerMonth.toString()),
    seatCapacity: roomType.seatCapacity,
    seatsTotal: totalSeats,
    seatsFree,
    hasAC: roomType.hasAC,
    amenities: roomType.amenities,
    rooms: activeRooms.map((room) => ({
      id: room.id,
      roomLabel: room.roomLabel,
      isAvailable: room.isAvailable,
      seats: Array.from({ length: roomType.seatCapacity }, (_, i) => {
        const seatNum = i + 1;
        const booking = room.bookings?.find((b) => b.seatNumber === seatNum);
        return {
          seatNumber: seatNum,
          isOccupied: !!booking,
          tenantInitials: booking
            ? getInitials(booking.tenant.displayName)
            : null,
        };
      }),
    })),
  };
}

export function toRoomDTO(room: PrismaRoom): RoomDTO {
  return {
    id: room.id,
    roomLabel: room.roomLabel,
    isAvailable: room.isAvailable,
    seats: [],
  };
}

export function toPropertyDetailDTO(
  p: PrismaProperty & { roomTypes: RoomTypeWithRooms[] },
): PropertyDetailDTO {
  const prices = p.roomTypes
    .map((roomTypes) => Number(roomTypes.pricePerMonth.toString()))
    .filter((price) => price > 0);

  const minPrice = prices.length ? Math.min(...prices) : null;
  const roomTypes = p.roomTypes.map(toRoomTypeDTO);
  const seatsAvailable = roomTypes.reduce(
    (sum, room) => sum + room.seatsFree,
    0,
  );

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    address: `${p.address}, ${p.city}`,
    city: p.city,
    latitude: p.latitude,
    longitude: p.longitude,
    amenities: [TYPE_LABEL[p.type], ...p.amenities],
    rating: Number(p.rating.toString()),
    seatsAvailable,
    minStay: p.minStay,
    startingPrice: minPrice !== null ? `LKR ${compactKilo(minPrice)}` : "-",
    image: p.imageUrl,
    roomTypes,
  };
}

type RoomTypeWithProperty = PrismaRoomType & { property: PrismaProperty };
type RoomWithRoomType = PrismaRoom & { roomType: RoomTypeWithProperty };
type BookingWithDetails = PrismaBooking & { room: RoomWithRoomType };
type AdminBookingWithDetails = BookingWithDetails & {
  tenant: { id: string; email: string; displayName: string };
};

export function toBookingDTO(booking: BookingWithDetails) {
  return {
    id: booking.id,
    status: booking.bookingStatus,
    paymentStatus: booking.paymentStatus,
    seatNumber: booking.seatNumber,
    leaseStart: booking.leaseStart.toISOString().slice(0, 10),
    leaseEnd: booking.leaseEnd.toISOString().slice(0, 10),
    durationMonths: booking.durationMonths,
    totalAmount: booking.totalAmount.toString(),
    createdAt: booking.createdAt.toISOString(),
    property: {
      id: booking.room.roomType.property.id,
      title: booking.room.roomType.property.title,
      city: booking.room.roomType.property.city,
    },
    roomType: {
      id: booking.room.roomType.id,
      name: booking.room.roomType.name,
      price: booking.room.roomType.pricePerMonth.toString(),
    },
    room: {
      id: booking.room.id,
      roomLabel: booking.room.roomLabel,
    },
  };
}

export function toAdminBookingDTO(booking: AdminBookingWithDetails) {
  return {
    ...toBookingDTO(booking),
    tenant: booking.tenant,
    createdAt: booking.createdAt.toISOString(),
  };
}
