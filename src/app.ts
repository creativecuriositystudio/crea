/**
 * Provides the core features of a Crea application.
 */

import KoaApplication from 'koa';
import bodyParser from 'koa-bodyparser';

import Router from './router';

/**
 * The Crea application.
 * This is functionally equivalent to a Koa application,
 * except we use some must-have/good-to-have middlewares
 * early on.
 */
export abstract class Application extends KoaApplication {
  /** Construct an application. */
  constructor() {
    super();

    this.use(bodyParser());
  }
}
