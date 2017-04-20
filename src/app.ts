/**
 * Provides the core features of a Crea application.
 */
import * as KoaApplication from 'koa';
import * as bodyParser from 'koa-bodyparser';
import * as _ from 'lodash';
import { Fields, Files, IncomingForm } from 'formidable';
import { Model, ValidationError } from 'modelsafe';

import { UserNotFoundError, TokenInvalidError, TokenExpiryError } from './auth';
import { Responder, ResponderConstructor } from './responder';
import { RouterContext } from './router';

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
  // tslint:disable-next-line:ban-types
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
      return err as ApplicationError;
    }

    // Lookup the registered handler by error constructor as the key.
    let handler = ApplicationError.handlers.get(err.constructor as typeof Error);

    if (typeof (handler) === 'function') {
      return handler(err as Error);
    }

    // No handler found, just coerce to a 500 Internal Server Error.
    let result = new ApplicationError(500, err.message);

    // Merge the stacks.
    result.stack = `${result.stack}\ncaused by ${err.stack}`;

    return result;
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
  // tslint:disable-next-line:ban-types
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
  /** The responder class to use for sending REST responses to clients. */
  responder: ResponderConstructor;

  /**
   * Whether multipart requests should be parsed. Off by default to prevent overhead
   * in apps that don't need file uploads or other multipart requests.
   *
   * If a set of formidable options are provided instead of a boolean,
   * then they will be used as the options for parsing multipart with formidable.
   */
  multipart: boolean | Partial<IncomingForm>;
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
  protected options: ApplicationOptions;

  /**
   * Construct an application.
   *
   * @param options Any options for the application.
   */
  constructor(options?: Partial<ApplicationOptions>) {
    super();

    this.options = options = {
      multipart: false,
      responder: Responder,

      ... options
    };

    // Setup default values on the router context, such as the responder.
    this.use(async (ctx: RouterContext, next: () => Promise<any>) => {
      ctx.responder = new options.responder(ctx) as Responder;

      try {
        return await next();
      } catch (err) {
        // Coerce the error then send the response.
        return ctx.responder.error(ApplicationError.coerce(err));
      }
    });

    if (options.multipart) {
      // Parse multipart forms using formidable, if multipart mode is on.
      this.use(async (ctx: RouterContext, next: () => Promise<any>) => {
        if (!ctx.request.is('multipart/form-data')) return next();

        let form = new IncomingForm();

        // If a non-boolean was provided, extend the form with the user's options.
        if (typeof (options.multipart) !== 'boolean') {
          _.extend(form, options.multipart as Partial<IncomingForm>);
        }

        [ctx.request.fields, ctx.request.files] = await new Promise(
          (resolve: (x: [Fields, Files]) => void, reject: (err: any) => void) => {
            form.parse(ctx.req, (err, fields, files) => {
              // Reject and our app error handler will pick it up
              if (err) {
                return reject(err);
              }

              resolve([fields, files]);
            });
          }
        );

        return next();
      });
    }

    // Add any default middleware.
    this.use(bodyParser());
  }
}
