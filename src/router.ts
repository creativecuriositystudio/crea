/**
 * Provides all routing functionality of a Crea application, based off koa-router.
 */

import * as KoaRouter from 'koa-router';

import { User } from './user';

/**
 * The router handles routing in a Crea application and
 * is directly based off koa-router's implementation.
 */
export class Router extends KoaRouter {}

/**
 * A Crea-specific implementation of koa-router's router context.
 * This will be the router context passed to any middleware in Crea,
 * but it is functionally equivalent to both Koa's default contexts
 * and koa-router's contexts.
 */
export interface RouterContext extends KoaRouter.IRouterContext {
  /**
   * An optional user authenticated.
   * This will need to be casted to an application-specific user model.
   *
   * @see Auth
   */
  user?: User;
}

/**
 * A Crea-specific middleware interface. This will just use
 * our specific router context rather than the default.
 */
export interface Middleware {
  (ctx: RouterContext, next: () => Promise<any>): Promise<any>;
}
