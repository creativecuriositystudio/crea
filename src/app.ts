/**
 * Provides the core features of a Crea application.
 */
import * as KoaApplication from 'koa';
import * as bodyParser from 'koa-bodyparser';
import { Model, ValidationError } from 'modelsafe';

import { UserNotFoundError, TokenInvalidError, TokenExpiryError } from './auth';
import { Router, RouterContext } from './router';

/** The error for a specific field on a resource. */
export interface ApplicationFieldError {
  /** The path to the field. */
  path: string;

  /** The error message for the field. */
  message: string;
}

/** An error in an application. */
export class ApplicationError extends Error {
  /** The HTTP status code of the error, to be sent in response. */
  status: number;

  /** The field errors to be sent in response. */
  errors?: ApplicationFieldError[];

  /**
   * Construct an application error.
   *
   * @param status The HTTP status code.
   * @param message The error message.
   * @param errors The application field errors.
   */
  constructor(status: number, message: string, errors?: ApplicationFieldError[]) {
    super(message);

    this.name = 'ApplicationError';
    this.stack = new Error().stack;
    this.status = status;
    this.errors = errors;

    // Required in order for error instances to be able to use instanceof.
    // SEE: https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md
    Object.setPrototypeOf(this, ApplicationError.prototype);
  }
}

/**
 * The web application context, providing
 * a set of helper functions to a router context.
 * Anything defined on the application context will be merged into
 * each router context, allowing extending application contexts
 * for providing helper functions to route/resource handling.
 *
 * The context of each of these functions is bound to the router
 * context.
 */
export interface ApplicationContext {
  /**
   * Handles responding with an error in an application.
   * The default implementation will:
   *
   * * Coerce `UserNotFoundError`, `TokenExpiryError` and `TokenInvalidError` into 402 errors.
   * * Coerce `modelsafe.ValidationError` into 400 errors.
   *
   * The errors are sent in the following format:
   *
   * ```json
   * {
   *   "message": "The message of the error",
   *   "errors": [{
   *     "path": "name",
   *     "message": "The name is invalid"
   *   }]
   * }
   * ```
   *
   * The `errors` portion will only be filled if there was a bad request.
   *
   * @param err The error to send to the client.
   * @returns A promise that resolves sending the error to the client.
   */
  error(this: RouterContext, err: Error | ApplicationError): Promise<any>;

  /**
   * Handles sending a single model instance.
   * The default implementation will send an instance like:
   *
   * ```json
   * {
   *   "id": 1,
   *   "name": "Some name"
   * }
   * ```
   *
   * @param instance The model instance.
   * @returns A promise that resolves sending the model instance to the client.
   */
  single<T extends Model>(this: RouterContext, instance: T): Promise<any>;

  /**
   * Handles sending multiple model instances.
   * The default implementation will send instances like:
   *
   * ```json
   * [{
   *   "id": 1,
   *   "name": "Some name"
   * }, {
   *   "id": 2,
   *   "name": "Other name"
   * }]
   * ```
   *
   * @param instances The model instances.
   * @returns A promise that resolves sending the model instances to the client.
   */
  multiple<T extends Model>(this: RouterContext, instances: T[]): Promise<any>;
}

/**
 * The web application.
 * This is functionally equivalent to a Koa application,
 * except we use some must-have/good-to-have middlewares
 * early on.
 */
export class Application extends KoaApplication {
  /** The context for the application. */
  protected ctx: ApplicationContext;

  /** Construct an application. */
  constructor(ctx?: Partial<ApplicationContext>) {
    super();

    let this_ = this;

    this.ctx = {
      /** Handles sending an error. */
      async error(this: RouterContext, err: Error | ApplicationError): Promise<any> {
        let coerced: ApplicationError = <ApplicationError> err;

        // Coerce error into an ApplicationError with a relevant status code.
        if (!(err instanceof ApplicationError)) {
          if (err instanceof ValidationError) {
            let errors = <ValidationError<any>> err.errors;
            let coercedErrors: ApplicationFieldError[] = [];

            for (let key of Object.keys(errors)) {
              coercedErrors = coercedErrors.concat(errors[key].map((message: string) => {
                return {
                  path: key,
                  message
                };
              }));
            }

            coerced = new ApplicationError(400, err.message, coercedErrors);
          } else if (err instanceof UserNotFoundError ||
                     err instanceof TokenInvalidError ||
                     err instanceof TokenExpiryError) {
            coerced = new ApplicationError(401, err.message);
          } else {
            coerced = new ApplicationError(500, err.message);
          }
        }

        this.status = coerced.status;
        this.body = {
          message: coerced.message,
          errors: Array.isArray(coerced.errors) ? coerced.errors : []
        };
      },

      /** Handles sending a single instance. */
      async single<T extends Model>(this: RouterContext, instance: T): Promise<any> {
        this.status = 200;
        this.body = instance;
      },

      /** Handles sending multiple instances. */
      async multiple<T extends Model>(this: RouterContext, instances: T[]): Promise<any> {
        this.status = 200;
        this.body = instances;
      },

      ... ctx
    };

    this.use(async (ctx: RouterContext, next: () => Promise<any>) => {
      // We extend the context manually so we can magically bind any functions
      // to the router context.
      for (let key of Object.keys(this_.ctx)) {
        let value = this_.ctx[key];

        if (typeof (value) === 'function') {
          ctx[key] = value.bind(ctx);
        } else {
          ctx[key] = value;
        }
      }

      try {
        return await next();
      } catch (err) {
        // Coerce the error.
        return ctx.error(err);
      }
    });

    // Add any default middleware.
    this.use(bodyParser());
  }
}
