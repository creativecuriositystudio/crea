/**
 * Provides bearer token-based authentication via the JSON Web Token standard.
 * The authentication functionality is completely user model agnostic, meaning
 * any data model can be used (whether it be a Squell model, or a simple interface).
 *
 * @see https://jwt.io/
 */
import { decode, encode } from 'jwt-simple';
import * as moment from 'moment';
import * as Bluebird from 'bluebird';

import { RouterContext, Middleware } from './router';

export interface Acl {
  isAllowed(userId: string, resource: string, permissions: string | string[]): Bluebird<boolean>;
  addUserRoles(userId: string, roles: string | string[]): Bluebird<void>;
  removeUserRoles(userId: string, roles: string | string[]): Bluebird<void>;
  userRoles(userId: string): Bluebird<string[]>;
}

/** Raised when a user is not found during authentication. */
export class UserNotFoundError extends Error {
  constructor(message?: string) {
    super(message);

    this.name = 'UserNotFoundError';
    this.stack = new Error().stack;

    // Required in order for error instances to be able to use instanceof.
    // SEE: https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md
    Object.setPrototypeOf(this, UserNotFoundError.prototype);
  }
}

/** Raised when a token has expired. */
export class TokenExpiryError extends Error {
  constructor(message?: string) {
    super(message);

    this.name = 'TokenExpiryError';
    this.stack = new Error().stack;

    // Required in order for error instances to be able to use instanceof.
    // SEE: https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md
    Object.setPrototypeOf(this, TokenExpiryError.prototype);
  }
}

/** Raised when a token is invalid. */
export class TokenInvalidError extends Error {
  constructor(message?: string) {
    super(message);

    this.name = 'TokenInvalidError';
    this.stack = new Error().stack;

    // Required in order for error instances to be able to use instanceof.
    // SEE: https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md
    Object.setPrototypeOf(this, TokenInvalidError.prototype);
  }
}

/** Raised when access to a route isn't allowed */
export class AuthorisationError extends Error {
  constructor(message?: string) {
    super(message);

    this.name = 'AuthorisationError';
    this.stack = new Error().stack;

    // Required in order for error instances to be able to use instanceof.
    // SEE: https://github.com/Microsoft/TypeScript-wiki/blob/master/Breaking-Changes.md
    Object.setPrototypeOf(this, AuthorisationError.prototype);
  }
}

/**
 * The payload representation of a bearer token.
 * This is encrypted into a secure token when sent to clients.
 */
export interface AuthPayload {
  /** The subject of the token (i.e. user identifier). */
  sub: string;
  /** The token issue time (in unix). */
  iat: number;
  /** The expiry time of the token (in unix). */
  exp: number;
}

/**
 * A bearer authentication token that can be sent and received by clients.
 */
export type AuthToken = string;

/**
 * Options for configuring the auth init route.
 */
export interface AuthInitOptions {
  /** The name of the header to look for the bearer token. */
  header?: string;

  /**
   * Whether authentication is optional, i.e. whether
   * other routes should be inaccessible
   * if the user is not logged. Defaults to false.
   */
  optional?: boolean;
}

/**
 * Manages backend authentication for a web application using bearer tokens.
 *
 * This should be extended by an application-specific child class
 * with the relevant method overrides to work with an application's
 * internal representation of a user model.
 *
 * It's important that the relevant middleware is used on either
 * the application or a router.
 *
 * @see init, login, register
 * @param T The type representing a user model.
 */
export abstract class Auth<T> {
  /**
   * The secret key used to encrypt/decrypt the tokens.
   *
   * Changing the secret key will invalidate all existing logins
   * to the system and there is no guarantee that this will work smoothly
   * with whatever MVC frontend a client is using.
   */
  protected secret: string;

  /**
   * The number of days that generated authentication tokens will
   * last for. This should be a high number and defaults
   * to two weeks.
   */
  protected expiryDays: number;

  /**
   * The ACL authorisation to check permissions with
   */
  protected acl: Acl;

  /**
   * @param secret     The secret key.
   * @param expiryDays The number of days auth tokens will be valid for.
   */
  constructor(secret: string, expiryDays: number = 14, acl?: Acl) {
    this.secret = secret;
    this.expiryDays = expiryDays;
    this.acl = acl;
  }

  /**
   * Produces a bearer token that can be sent to a client securely and then used
   * to login to the web application.
   *
   * It is crucial that this is only sent to a user upon successful
   * login or registration, as this token will give them full access to
   * the relevant user model.
   *
   * @see        consumeToken
   * @param user The user to generate an auth token for.
   * @returns    A promise that resolves to an auth token.
   */
  protected async produceToken(user: T): Promise<AuthToken> {
    let payload = {
      exp: moment().add(this.expiryDays, 'days').unix(),
      iat: moment().unix(),
      sub: this.getIdentifier(user)
    };

    return encode(payload, this.secret);
  }

  /**
   * Consumes a bearer token and translates it to the relevant user model.
   * This will fail if the user could not be found or the token has expired.
   *
   * @see         produceToken
   * @throws      TokenExpiryError, UserNotFoundError
   * @param token The auth token to find a user from.
   * @returns     A promise that resolves to the user model, or rejects if not
   *              found/the token has expired.
   */
  protected async consumeToken(token: AuthToken): Promise<T> {
    let payload: AuthPayload;

    try {
      payload = decode(token, this.secret);
    } catch (err) {
      // Ignore the context of the error and just throw a generic error.
      // We do this because if the token could not be decrypted,
      // it probably means something didgy-dodge has happened (or
      // the JWT secret has been changed). In the case, let's expose
      // as little info as possible to the client.
      throw new TokenInvalidError('Token was invalid');
    }

    if (moment().unix() >= payload.exp) {
      throw new TokenExpiryError('Token has expired');
    }

    try {
      return this.getUser(payload.sub);
    } catch (err) {
      // Same logic as above.
      throw new TokenInvalidError('Token was invalid');
    }
  }

  /**
   * An abstract method that fetches a user from a relevant identifier.
   * This should be implemented by a child class and will be used to
   * find a user from a decrypted token's original identifier value.
   * This will fail if the user could not be found.
   *
   * @rejects  UserNotFoundError
   * @param id The identifier.
   * @returns  A promise that resolves to the user model, or rejects if not found.
   */
  protected abstract async getUser(id: string): Promise<T>;

  /**
   * An abstract method that fetches the identifier for a specific user
   * in order to generate an auth token.
   *
   * The identifier should be unique as it in turn will be used to find a user
   * when the token is decrypted. It is however not necessarily a constraint
   * of this design to have the identifier not unique if required.
   *
   * @param user The user to get the identifier for.
   * @returns    The user identifier.
   */
  protected abstract getIdentifier(user: T): string;

  /**
   * An abstract method that fetches the roles for a specific user
   * in order to restrict access to resources/routes
   *
   * @param user The user to get the roles for
   * @returns    The user roles
   */
  protected abstract async getRoles(user: T): Promise<string[]>;

  /**
   * Log a user in using a provided router context
   * with all of the request information available.
   * This should reject with a UserNotFoundError
   * if the login details were incorrect.
   * If the promise resolves with a user,
   * then the a new token will be immediately
   * sent to the user marking a successful login.
   *
   * This must be implemented by the child
   * authentication manager class if a login route
   * is required. Without a child implementation
   * it will always reject.
   *
   * @rejects UserNotFoundError, Error
   * @see login
   */
  protected async loginUser(_ctx: RouterContext): Promise<T> {
    throw new Error('Login unimplemented');
  }

  /**
   * Register a user in using a provided router context
   * with all of the request information available.
   * If the promise resolves with a user,
   * then the a new token will be immediately
   * sent to the user marking a successful login.
   *
   * This must be implemented by the child
   * authentication manager class if a register route
   * is required. Without a child implementation
   * it will always reject.
   *
   * @rejects Error
   * @see login
   */
  protected async registerUser(_ctx: RouterContext): Promise<T> {
    throw new Error('Register unimplemented');
  }

  /**
   * A middleware used to check if the user is authed,
   * and if so populates the router context with the user
   * object.
   *
   * This should be added on the application during
   * its configuration.
   *
   * @returns The auth initialization middleware.
   */
  public init(options?: AuthInitOptions): Middleware {
    options = {
      header: 'Authorization',
      optional: false,

      ... options
    };

    let self = this;
    let header = options.header.toLowerCase();

    return async (ctx: RouterContext, next: () => Promise<any>): Promise<any> => {
      let token = ctx.request.headers[header];

      if (!token || typeof (token) !== 'string') {
        if (options.optional) {
          return next();
        }

        throw new TokenInvalidError('No token header set');
      }

      // The bearer token is always has the prefix of 'bearer <token>',
      // or 'token <token>'. We only care about the actual token portion.
      ctx.user = await self.consumeToken(token.split(/\s/g)[1] || '');

      if (self.acl) {
        let userId = self.getIdentifier(ctx.user);
        await self.acl.removeUserRoles(userId, await self.acl.userRoles(userId));
        await self.acl.addUserRoles(userId, await self.getRoles(ctx.user));
      }

      // Keep going along the chain, with the user available.
      return next();
    };
  }

  /**
   * A middleware used to login a user.
   *
   * This should be added on the router at the relevant URL.
   *
   * @returns The auth login middleware.
   */
  public login(): Middleware {
    let self = this;

    return async (ctx: RouterContext, _next: () => Promise<any>): Promise<any> => {
      let user = await self.loginUser(ctx);

      ctx.body = {
        token: await self.produceToken(user)
      };
    };
  }

  /**
   * A middleware used to register a user.
   *
   * This should be added on the router at the relevant URL.
   *
   * @returns The auth registration middleware.
   */
  public register(): Middleware {
    let self = this;

    return async (ctx: RouterContext, _next: () => Promise<any>): Promise<any> => {
      let user = await self.registerUser(ctx);

      ctx.body = {
        token: await self.produceToken(user)
      };
    };
  }

  /**
   * A middleware used to ensure a user is authorised to access a route
   *
   * This should be added on the router at the relevant URL.
   *
   * @returns The authorisation middleware
   */
  public authorised(resource: string, permissions: string | string[]): Middleware {
    let self = this;

    return async (ctx: RouterContext, next: () => Promise<any>): Promise<any> => {
      if (self.acl) {
        const isAllowed = await self.acl.isAllowed(self.getIdentifier(ctx.user), resource, permissions);
        if (!isAllowed) throw new AuthorisationError();
      }

      return next();
    };
  }
}
