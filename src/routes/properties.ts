import { Router } from 'express';
import { validateBody } from '../middleware/validate.js';
import { createPropertySchema, type CreatePropertyInput } from '../schemas/property.js';
import { Errors } from '../lib/errors.js';
import { createRoomSchema, type CreateRoomInput } from '../schemas/room.js';
import { roomTypeSchema } from '../schemas/room-type.js';

export const propertiesRouter: Router = Router()

const PROPERTIES = [
  {
    id: 'prop-001',
    title: 'Sunset Apartment',
    location: 'Ethul Kotte, Sri Lanka',
    type: 'Apartment',
    price: '20K',
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400&h=500&fit=crop',
  },
  {
    id: 'prop-002',
    title: 'Palm House',
    location: 'Gampaha, Sri Lanka',
    type: 'House',
    price: '18K',
    rating: 4.2,
    image: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=400&h=500&fit=crop',
  },
];

propertiesRouter.get('/', (_req, res) => {
    res.json(PROPERTIES)
})

// Task 2: forbidden demo
propertiesRouter.get('/secret', () => { throw Errors.forbidden('admin area'); });

// Task 3: unknown-error 500 demo
propertiesRouter.get('/boom', () => { throw new TypeError('something blew up'); });

propertiesRouter.get('/:id', (req, res) => {
    const property = PROPERTIES.find(p => p.id === req.params.id)
    if (!property) {
        throw Errors.notFound('Property');
    }
    res.json(property);
})

//make sure whatever is sent in the request body matches the schema defined in createPropertySchema. 
// If it does, it will be added to the PROPERTIES array and returned in the response. If not, an error will be thrown.
propertiesRouter.post('/', validateBody(createPropertySchema), (req, res) => {
    const newProperty = req.body as CreatePropertyInput;
    PROPERTIES.push(newProperty);
    res
    .status(201)
    .location(`${req.baseUrl}/${newProperty.id}`)
    .json(newProperty);
})

propertiesRouter.delete('/:id', (req, res) => {
    const index = PROPERTIES.findIndex(p => p.id === req.params.id);
    if (index === -1) {
        throw Errors.notFound('Property');
    }
    PROPERTIES.splice(index, 1);
    res.status(204).send();
})

const ROOMS = [
    { id: 'r1', propertyId: 'prop-001', name: 'Room A', price: 20000, seatsTotal: 2, seatsFree: 1, hasAC: true },
    { id: 'r2', propertyId: 'prop-001', name: 'Room B', price: 22000, seatsTotal: 2, seatsFree: 2, hasAC: true },
    { id: 'r3', propertyId: 'prop-002', name: 'Room C', price: 18000, seatsTotal: 3, seatsFree: 0, hasAC: false },
];

// This route handler retrieves all rooms associated with a specific property ID.
propertiesRouter.get('/:id/rooms', (req, res) => {
    const property = PROPERTIES.find(p => p.id === req.params.id);
    if (!property) {
        throw Errors.notFound('Property')
    }
    res.json(ROOMS.filter(r => r.propertyId === req.params.id));
})

// This route handler is responsible for creating a new room for a specific property.
propertiesRouter.post('/:id/rooms', validateBody(createRoomSchema), (req, res) => {
    const newRoom = req.body as CreateRoomInput;
    const propertyId = req.params.id;
    if (!propertyId || typeof propertyId === 'object') {
        throw Errors.validation('Invalid Property ID')
    }
    ROOMS.push({
        propertyId: propertyId,
        ...newRoom //... means spread operator, which takes all the properties of newRoom and adds them to the new object being created.
    });
    res
    .status(201)
    .location(`${req.baseUrl}/${newRoom.id}`)
    .json(newRoom);
})

// Task 1: room-types stub route (in-memory echo, no persistence)
propertiesRouter.post('/:propertyId/room-types', validateBody(roomTypeSchema), (req, res) => {
    res.status(201).json(req.body);
})

