import { Router } from 'express';
import { validateBody } from '../middleware/validate.js';
import { createPropertySchema, type CreatePropertyInput } from '../schemas/property.js';
import { Errors } from '../lib/errors.js';
import { createRoomSchema, type CreateRoomInput } from '../schemas/room.js';
import { roomTypeSchema } from '../schemas/room-type.js';
import { toPropertyDTO } from '../lib/dto.js';
export const propertiesRouter: Router = Router()
import { prisma } from '../lib/prisma.js';
import { verifyJwt } from '../middleware/auth.js';

propertiesRouter.get('/', async (_req, res, next) => {
    try {
        const properties = await prisma.property.findMany({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            include: { rooms: true }
        })
        res.json(properties.map(toPropertyDTO));
    } catch (err) {
        next(err)
      }
})
// Task 2: forbidden demo
propertiesRouter.get('/secret', () => { throw Errors.forbidden('admin area'); });

// Task 3: unknown-error 500 demo
propertiesRouter.get('/boom', () => { throw new TypeError('something blew up'); });

propertiesRouter.get('/:id', async (req, res, next) => {
    try {
        const property = await prisma.property.findUnique({
            where: { id: req.params.id },
            include: { rooms: true },
        });
        if (!property) throw Errors.notFound('Property');
        res.json(property.rooms);
    } catch (err) {
        next(err);
    }
})
//make sure whatever is sent in the request body matches the schema defined in createPropertySchema. 
// If it does, it will be added to the PROPERTIES array and returned in the response. If not, an error will be thrown.
propertiesRouter.post('/', verifyJwt, validateBody(createPropertySchema), async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) throw Errors.unauthenticated()
        const property = await prisma.property.create({ data: {
            ...req.body,
            vendorId: userId
        }});
        res
            .status(201)
            .location(`${req.baseUrl}/${property.id}`)
            .json(property);
    } catch (err) {
        next(err);
    }
})

propertiesRouter.delete('/:id', async (req, res, next) => {
    try {
        await prisma.property.delete({
            where: {
                id: req.params.id
            }
        })
        res.status(204).send()
    } catch (err) {
        next(err)
    }
})
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

