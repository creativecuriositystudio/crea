/**
 * Provides the core features of a Crea application.
 */
import * as KoaApplication from 'koa';
import * as bodyParser from 'koa-bodyparser';

import Router from './router';

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
