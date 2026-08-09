import type { RequestHandler } from "express";
import * as svc from "../services/booking-service.js";
//controller functions are responsible for handling incoming HTTP requests, invoking the appropriate service functions, and sending back the HTTP responses. 
// They act as intermediaries between the client and the service layer, ensuring that the business logic is executed correctly and that the client receives the expected data or error messages.
export const create: RequestHandler = async (req, res, next) => {
  try {
    const booking = await svc.createBookingPending(req.user!.id, req.body);
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
};

export const confirm: RequestHandler = async (req, res, next) => {
  try {
    const booking = await svc.confirmBooking(
      String(req.params.id!),
      req.user!.id,
    );
    res.json(booking);
  } catch (err) {
    next(err);
  }
};

export const myBookings: RequestHandler = async (req, res, next) => {
  try {
    res.json(await svc.listMyBookings(req.user!.id));
  } catch (err) {
    next(err);
  }
};