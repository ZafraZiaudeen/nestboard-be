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
  type: "House" | "Villa" | "Apartment" | "Hotel";
  price: string;
  rating: number;
  image: string;
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
    type: TYPE_LABEL[p.type],
    price: minPrice !== null ? compactKilo(minPrice) : "-",
    rating: Number(p.rating.toString()),
    image: p.imageUrl,
  };
}

export type PropertyDetailDTO = {
  id: string;
  title: string;
  address: string;
  amenities: string[];
  rating: number;
  seatsAvailable: number;
  minStay: string;
  startingPrice: string;
  image: string;
  roomTypes: RoomTypeDTO[];
};

export type RoomDTO = {
  id: string;
  roomLabel: string;
  isAvailable: boolean;
};

export type RoomTypeDTO = {
  id: string;
  name: string;
  price: string;
  seatsTotal: number;
  seatsFree: number;
  hasAC: boolean;
  rooms?: RoomDTO[];
};

function money(n: number): string {
  return Math.round(n).toLocaleString("en-LK");
}

type RoomTypeWithRooms = PrismaRoomType & { rooms: PrismaRoom[] };

export function toRoomTypeDTO(roomType: RoomTypeWithRooms): RoomTypeDTO {
  const rooms = roomType.rooms ?? [];
  const activeRooms = rooms.filter((room) => room.isAvailable);
  const totalSeats = roomType.seatCapacity * activeRooms.length;

  return {
    id: roomType.id,
    name: roomType.name,
    price: money(Number(roomType.pricePerMonth.toString())),
    seatsTotal: totalSeats,
    seatsFree: totalSeats,
    hasAC: roomType.hasAC,
    rooms: activeRooms.map((room) => ({
      id: room.id,
      roomLabel: room.roomLabel,
      isAvailable: room.isAvailable,
    })),
  };
}

export function toRoomDTO(room: PrismaRoom): RoomDTO {
  return {
    id: room.id,
    roomLabel: room.roomLabel,
    isAvailable: room.isAvailable,
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
    address: `${p.address}, ${p.city}`,
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
