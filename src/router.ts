/**
 * Provides all routing functionality of a Crea application, based off koa-router.
 */
import * as koa from 'koa';
import * as KoaRouter from 'koa-router';
import { Files, Fields } from 'formidable';

import { Responder } from './responder';

/**
 * The router handles routing in a Crea application and
 * is directly based off koa-router's implementation.
 */
export class Router extends KoaRouter {}

/** A web application request. */
export interface Request extends koa.Request {
  /** Any multipart files for the request. */
  files?: Files;

  /** Any multipart fields for the request. */
  fields?: Fields;
}

/**
 * A web application's router context.
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
  user?: any;

  /** The responder to use for sending REST responses. */
  responder: Responder;

  /** The request for this context. */
  request: Request;
}

/**
 * A web application's middleware interface. This will just use
 * our specific router context rather than the default.
 */
export interface Middleware {
  (ctx: RouterContext, next: () => Promise<any>): Promise<any>;
}
