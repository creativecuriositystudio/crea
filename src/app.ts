/**
 * Provides the core features of a Crea application.
 */
import * as KoaApplication from 'koa';
import * as bodyParser from 'koa-bodyparser';
import { Model, ValidationError } from 'modelsafe';

import { UserNotFoundError, TokenInvalidError, TokenExpiryError } from './auth';
import { Responder } from './responder';
import { Router, RouterContext } from './router';

/** An error in an application. */
export class ApplicationError extends Error {
  /** The HTTP status code of the error, to be sent in response. */
  status: number;

  /**
   * Any error data to be sent in response.
   * It is completely up to the instantiater as to what
   * to populate here - it
   */
  data?: any;

  /**
   * Construct an application error.
   *
   * @param status The HTTP status code.
   * @param message The error message.
   * @param data The error data.
   */
  constructor(status: number, message: string, data?: any) {
    super(message);

    this.name = 'ApplicationError';
    this.stack = new Error().stack;
    this.status = status;
    this.data = data;
  }

  /**
   * All of the registered handlers for coercing non-`ApplicationErrors` into
   * their relevant `ApplicationError` form.
   */
  static handlers: Map<Function, (err: any) => ApplicationError> = new Map();

  /**
   * Coerce any error type into an `ApplicationError`.
   *
   * This will lookup the registered coercion handlers based off the error provided.
   * If no coerce handler has been provided, then th
   *
   * By default the following coercion handlers are enabled:
   *
   * * modelsafe.ValidationError: 400 Bad Request, with the `data` field populated with the errors for each request field
   * * restla.TokenExpiryError: 401 Unauthorised
   * * restla.TokenInvalidError: 401 Unauthorised
   * * restla.UserNotFoundError: 401 Unauthorised
   * * restla.AuthorizationError: 403 Forbidden
   */
  static coerce(err: Error | ApplicationError): ApplicationError {
    if (err instanceof ApplicationError) {
      return <ApplicationError> err;
    }

    // Lookup the registered handler by error constructor as the key.
    let handler = ApplicationError.handlers.get(err.constructor as typeof Error);

    if (typeof (handler) === 'function') {
      return handler(<Error> err);
    }

    // No handler found, just coerce to a 500 Internal Server Error.
    return new ApplicationError(500, err.message);
  }

  /**
   * Register a handler for coercing another error type
   * into an application error.
   *
   * This is useful if you ever intend to throw non-`ApplicationError`s
   * anywhere in your code - Restla will automatically catch those
   * and then look for a coerce handler for that error. If no handler
   * has been registered, then it will just coerc into a generic 500 status
   * `ApplicationError` with the error message carried across.
   *
   * @see coerce
   * @param ctor The error constructor to automatically coerce using the handler.
   * @param handler The handler that turns the relevant error type into an application error.
   */
  static register<T extends Error>(ctor: Function, handler: (err: T) => ApplicationError) {
    ApplicationError.handlers.set(ctor, handler);
  }
}

ApplicationError.register(ValidationError, <T extends Model>(err: ValidationError<T>): ApplicationError => {
  return new ApplicationError(400, err.message, err.errors);
});

ApplicationError.register(TokenInvalidError, (err: TokenInvalidError): ApplicationError => {
  return new ApplicationError(401, err.message);
});

ApplicationError.register(TokenExpiryError, (err: TokenExpiryError): ApplicationError => {
  return new ApplicationError(401, err.message);
});

ApplicationError.register(UserNotFoundError, (err: UserNotFoundError): ApplicationError => {
  return new ApplicationError(401, err.message);
});

/** Options for running an application. */
export interface ApplicationOptions {
  /** The responder to use for sending REST responses to clients. */
  responder: Responder;
}

/**
 * The web application.
 *
 * This is functionally equivalent to a Koa application,
 * except we use some must-have/good-to-have middlewares
 * early on and provide some extra things, such as smart error handling.
 */
export class Application extends KoaApplication {
  /** The options for the application. */
  options: ApplicationOptions;

  /**
   * Construct an application.
   *
   * @param options Any options for the application.
   */
  constructor(options?: Partial<ApplicationOptions>) {
    super();

    this.options = {
      responder: new Responder(),

      ... options
    };

    this.use(async (ctx: RouterContext, next: () => Promise<any>) => {
      ctx.responder = this.options.responder;

      try {
        return await next();
      } catch (err) {
        // Coerce the error then send the response.
        return ctx.responder.error(ctx, ApplicationError.coerce(err));
      }
    });

    // Add any default middleware.
    this.use(bodyParser());
  }
}
