# NestBoard - Backend API

## Overview

The **NestBoard** backend is a REST API built with **Express 5** and **TypeScript**, serving as the data layer for the NestBoard co-living and property rental platform. It handles user authentication, property and room management, seat-level booking logic, image uploads, and Stripe payment processing. The API connects to a **PostgreSQL** database through **Prisma ORM** and is built to serve both the web frontend and the React Native mobile app. All environment variables are validated at startup via **Zod**, so the server won't boot with a broken config.

## Features

- **User Authentication**: Register and log in with email/password or Google OAuth. Access tokens are short-lived JWTs (15 minutes), backed by rotating opaque refresh tokens stored as SHA-256 hashes in the database.
- **Role-Based Access Control**: Two roles - ADMIN and USER. Admins manage properties and view all bookings. Tenants browse, favourite, and manage their own bookings only.
- **Property Management**: Full CRUD for properties, room types, and individual rooms. Supports filtering by property type, city, price range, and search query with pagination.
- **Seat-Based Booking**: Tenants pick a specific seat inside a room. A new booking starts as PENDING and expires automatically after 30 minutes if payment is not completed. Double-booking is prevented using a serializable database transaction.
- **Stripe Payments**: A checkout session is created per booking. Stripe webhooks drive the final status transitions - CONFIRMED on successful payment, EXPIRED on abandoned checkout.
- **Image Uploads**: Cover images and avatars can be stored on local disk or Cloudinary depending on the `UPLOAD_PROVIDER` environment variable.
- **Favourites**: Tenants can save and unsave properties, viewable via a dedicated endpoint.
- **Rate Limiting**: 100 requests per 15-minute window by default, adjustable via `RATE_LIMIT` env var.
- **Structured Logging**: JSON logs via Pino with pretty-print in development.
- **Health Checks**: `/api/health/live` for uptime and `/api/health/ready` for database connectivity.
- **Graceful Shutdown**: SIGTERM/SIGINT close the HTTP server and disconnect Prisma cleanly, with a 10-second force-kill fallback.

## Document with all the links related to project
https://docs.google.com/document/d/12UAiaQ-1PiDfTW6s2RhdzWhO8nlJ0XD8jw2iBSHSe6E/edit?usp=sharing

## Repositories

- **Web Frontend**: https://github.com/ZafraZiaudeen/nest-board-fe
- **Mobile App**: https://github.com/ZafraZiaudeen/nest-app

## Tech Stack

- **Express 5**: HTTP server framework.
- **TypeScript**: Strict mode, pure ESM, NodeNext module resolution.
- **Prisma 7**: ORM with a native `pg` driver adapter for PostgreSQL.
- **argon2**: Password hashing.
- **jose**: JWT signing and verification using the JOSE standard.
- **Zod**: Request body validation and environment variable parsing at startup.
- **Stripe**: Checkout session creation and webhook signature verification.
- **Multer**: Multipart file handling for image uploads.
- **Cloudinary**: Optional cloud image storage.
- **Helmet + CORS + express-rate-limit**: Security headers, cross-origin config, and request throttling.
- **Pino**: Structured JSON logging.
- **Vitest + Supertest**: Unit and integration tests.

## Installation & Setup

### Prerequisites

- Node.js v22 or later
- PostgreSQL (local or hosted)
- A Stripe account with a test secret key and webhook secret

### Steps

#### 1. Clone the Repository

```sh
git clone https://github.com/ZafraZiaudeen/nestboard-be.git
cd nestboard-be
```

#### 2. Install Dependencies

```sh
npm install
```

#### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/nestboard
JWT_ACCESS_SECRET=a-secret-string-at-least-32-characters-long
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional (defaults shown)
PORT=3001
NODE_ENV=dev
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173
UPLOAD_PROVIDER=local
UPLOAD_LOCAL_DIR=./uploads
RATE_LIMIT=100
STRIPE_SUCCESS_URL=http://localhost:5173/stripe/success
STRIPE_CANCEL_URL=http://localhost:5173/stripe/cancel
STRIPE_CURRENCY=lkr
GOOGLE_CLIENT_ID=your-google-client-id

# Required only when UPLOAD_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

#### 4. Run Database Migrations

```sh
npx prisma migrate deploy
```

#### 5. Seed the Database (Optional)

```sh
npm run seed
```

This populates the database with sample Sri Lanka property listings.

#### 6. Start the Development Server

```sh
npm run dev
```

The API runs at **http://localhost:3001**. The dev server uses `tsx watch` for auto-reload on file changes.

## API Endpoints

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | None | Register with email and password |
| POST | `/api/auth/login` | None | Login, returns access and refresh tokens |
| POST | `/api/auth/refresh` | None | Rotate refresh token, returns new token pair |
| POST | `/api/auth/google` | None | Google OAuth - send `idToken` from the client |
| GET | `/api/auth/me` | JWT | Get the current user's profile |
| PATCH | `/api/auth/me` | JWT | Update display name or avatar URL |

### Properties

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/properties` | None | Paginated list with filters (type, city, price, search) |
| GET | `/api/properties/:id` | None | Property detail including room types and seat availability |
| GET | `/api/properties/my-favourites` | JWT (USER) | Current user's saved properties |
| PATCH | `/api/properties/:id/toggle-favorite` | JWT (USER) | Add or remove from favourites |
| GET | `/api/properties/mine` | JWT (ADMIN) | Admin's own properties |
| POST | `/api/properties` | JWT (ADMIN) | Create a property |
| PATCH | `/api/properties/:id` | JWT (ADMIN) | Update a property |
| DELETE | `/api/properties/:id` | JWT (ADMIN) | Delete a property |
| GET | `/api/properties/:id/room-types` | None | List room types with availability |
| GET | `/api/properties/:id/room-types/:roomTypeId` | None | Single room type detail |
| POST | `/api/properties/:id/room-types` | JWT (ADMIN) | Add a room type |
| PATCH | `/api/properties/:id/room-types/:roomTypeId` | JWT (ADMIN) | Update a room type |
| DELETE | `/api/properties/:id/room-types/:roomTypeId` | JWT (ADMIN) | Delete a room type |
| POST | `/api/properties/:id/room-types/:roomTypeId/rooms` | JWT (ADMIN) | Add a room |
| PATCH | `/api/properties/:id/room-types/:roomTypeId/rooms/:roomId` | JWT (ADMIN) | Update a room |
| DELETE | `/api/properties/:id/room-types/:roomTypeId/rooms/:roomId` | JWT (ADMIN) | Delete a room |

### Bookings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/bookings` | JWT (USER) | Create a PENDING booking |
| POST | `/api/bookings/:id/confirm` | JWT (USER) | Start Stripe checkout, returns `{url}` |
| POST | `/api/bookings/:id/cancel` | JWT (USER) | Cancel a PENDING booking |
| GET | `/api/bookings/my` | JWT (USER) | Current user's booking history |
| GET | `/api/bookings/vendor` | JWT (ADMIN) | All bookings across admin's properties |

### Uploads

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/uploads/avatar` | JWT | Upload a profile photo (max 5 MB, JPG/PNG/WEBP) |
| POST | `/api/uploads/cover-image` | JWT (ADMIN) | Upload a property cover image |

### Stripe Webhook

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/stripe` | Receives `checkout.session.completed` and `checkout.session.expired` events from Stripe |

## Usage

- **Development**: `npm run dev` starts the server with auto-reload.
- **Production build**: `npm run build` compiles TypeScript to `dist/`, then `npm start` runs it.
- **Type checking**: `npm run typecheck`
- **Tests**: `npm test`
- **Stripe webhooks locally**: Use the Stripe CLI to forward events to `http://localhost:3001/webhooks/stripe`.

## Contributing

Fork the repository.

Create a branch:

```sh
git checkout -b feature/your-feature
```

Commit your changes:

```sh
git commit -m "Add your feature"
```

Push to your branch:

```sh
git push origin feature/your-feature
```

Open a pull request.

## Contact

For any inquiries, feel free to reach out: zafraziaudeen@gmail.com
