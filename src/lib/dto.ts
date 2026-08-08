import type {
    Property as PrismaProperty,
    Room as PrismaRoom
} from "../generated/client.js";
import type { PropertyType } from "../generated/client.js";

export type PropertyDTO = {
    id: string;
    title: string;
    description: string;
    location: string;
    type: 'House' | 'Villa' | 'Apartment' | 'Hotel';
    price: string;
    rating: number;
    image: string;
}

const TYPE_LABEL: Record<PropertyType, PropertyDTO['type']> = {
    HOUSE: 'House',
    VILLA: 'Villa',
    APARTMENT: 'Apartment',
    HOTEL: 'Hotel'
}

function compactKilo(n: number): string {
    if (n < 1000) return Math.round(n).toString();
    const k = n / 1000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
}

export function toPropertyDTO(p: PrismaProperty & { rooms?: PrismaRoom[] }): PropertyDTO {
    const prices = (p.rooms ?? [])
        .map(r => Number(r.pricePerMonth.toString()))
        .filter(n => n > 0);

    const minPrice = prices.length ? Math.min(...prices): null;

    return {
        id: p.id,
        title: p.title,
        description: p.description,
        location: `${p.address}, ${p.city}`,
        type: TYPE_LABEL[p.type],
        price: minPrice !== null ? compactKilo(minPrice) : '-',
        rating: Number(p.rating.toString()),
        image: p.imageUrl
    }
}