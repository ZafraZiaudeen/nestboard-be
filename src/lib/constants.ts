/** Reservation window: a PENDING booking holds its seat for this long before it is considered stale.
 *  Must match the Stripe checkout session expires_at offset set in booking-service.ts. */
export const BOOKING_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
