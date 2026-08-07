import { prisma } from '../src/lib/prisma.js';
import { Role, PropertyType } from '../src/generated/enums.js';

async function main() {
  const vendor = await prisma.user.upsert({
    where: { email: 'vendor@nestboard.dev' },
    create: { email: 'vendor@nestboard.dev', displayName: 'Aisha Perera', role: Role.ADMIN, bioTag: 'Property Manager' },
    update: {},
  });

  // 3 tenant users (USER role) — full list in nestboard-api-complete/prisma/seed.ts
  for (const t of [
    { email: 'tenant1@nestboard.dev', displayName: 'Kavindu Silva' },
    { email: 'tenant2@nestboard.dev', displayName: 'Nethmi Fernando' },
    { email: 'tenant3@nestboard.dev', displayName: 'Tharindu Bandara' },
  ]) {
    await prisma.user.upsert({ where: { email: t.email }, create: { ...t, role: Role.USER }, update: {} });
  }

  const existing = await prisma.property.findFirst({ where: { vendorId: vendor.id, title: 'Sunset Apartment' } });
  const property = existing ?? (await prisma.property.create({
    data: {
      vendorId: vendor.id,
      title: 'Sunset Apartment',
      description: 'A modern co-living apartment in the heart of Ethul Kotte.',
      address: '45 Temple Road, Ethul Kotte',
      city: 'Ethul Kotte',
      type: PropertyType.APARTMENT,
      rating: 4.8,
      amenities: ['Apartment', 'AC', 'WiFi', 'Parking'],
      latitude: 6.8956,
      longitude: 79.9092,
      imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&h=500&fit=crop',
      minStay: '2 months',
    },
  }));

  for (const r of [
    { name: 'Room A', pricePerMonth: 20000, seatCapacity: 2, hasAC: true },
    { name: 'Room B', pricePerMonth: 22000, seatCapacity: 2, hasAC: true },
    { name: 'Room C', pricePerMonth: 18000, seatCapacity: 3, hasAC: false },
  ]) {
    const room = await prisma.room.findFirst({ where: { propertyId: property.id, name: r.name } });
    if (!room) await prisma.room.create({ data: { ...r, propertyId: property.id } });
  }

  console.log('Seed complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());