/**
 * Provides the core features of a Crea application.
 */
import * as KoaApplication from 'koa';
import * as bodyParser from 'koa-bodyparser';

import Router from './router';

/** The error for a specific field on a resource. */
export interface ApplicationFieldError {
  path: string;
  message: string;
}

/** Raised by any middleware handling a REST resource. */
export class ApplicationError extends Error {
  status: number;
  errors?: ApplicationFieldError[];

  constructor(status: number, message: string, errors?: ApplicationFieldError[]) {
    super(message);

    this.name = 'ApplicationError';
    this.stack = new Error().stack;
    this.status = status;
    this.errors = errors;
  }
}

/**
 * The Crea application.
 * This is functionally equivalent to a Koa application,
 * except we use some must-have/good-to-have middlewares
 * early on.
 */
export class Application extends KoaApplication {
  /** Construct an application. */
  constructor() {
    super();

    this.use(bodyParser());
  }
}
