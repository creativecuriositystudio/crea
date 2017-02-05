/**
 * Provides bearer token-based authentication via the JSON Web Token standard.
 * The authentication functionality is completely user model agnostic, meaning
 * any data model can be used (whether it be a Squell model, or a simple interface).
 *
 * @see https://jwt.io/
 */

import { decode, encode } from 'jwt-simple';
import moment from 'moment';

import { RouterContext, Middleware } from './router';
import { User } from './user';

/** Raised when a user is not found during authentication. */
export class UserNotFoundError extends Error {
  constructor(message?: string) {
    super(message);

    this.name = 'UserNotFoundError';
    this.stack = new Error().stack;
  }
}

/** Raised when a token has expired. */
export class TokenExpiryError extends Error {
  constructor(message?: string) {
    super(message);

    this.name = 'TokenExpiryError';
    this.stack = new Error().stack;
  }
}

/** Raised when a token is invalid. */
export class TokenInvalidError extends Error {
  constructor(message?: string) {
    super(message);

    this.name = 'TokenInvalidError';
    this.stack = new Error().stack;
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
 * Manages backend authentication for a web application using bearer tokens.
 *
 * This should be extended by an application-specific child class
 * with the relevant method overrides to work with an application's
 * internal representation of a user model.
 *
 * It's important that the relevant middleware is used on either
 * the Crea application or a Crea router.
 *
 * @see init, login, register
 * @param T The type representing a user model.
 */
export abstract class Auth<T extends User> {
  /**
   * The secret key used to encrypt/decrypt the tokens.
   *
   * Changing the secret key will invalidate all existing logins
   * to the system and there is no guarantee that this will work smoothly
   * with whatever MVC frontend a client is using.
   */
  private secret: string;

  /*
   * The number of days that generated authentication tokens will
   * last for. This should be a high number and defaults
   * to two weeks.
   */
  private expiryDays: number;

  /**
   * @param secret The secret key.
   */
  constructor(secret: string);

  /**
   * @param secret     The secret key.
   * @param expiryDays The number of days auth tokens will be valid for.
   */
  constructor(secret: string, expiryDays = 14) {
    this.secret = secret;
    this.expiryDays = expiryDays;
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
  public async produceToken(user: T): Promise<AuthToken> {
    let payload = {
      exp: moment().add(this.expiryDays, 'days').unix(),
      iat: moment().unix(),
      sub: user.getIdentifier(),
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
  public async consumeToken(token: AuthToken): Promise<T> {
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

    return this.getUser(payload.sub);
  }

  /**
   * An abstract method that fetches a user from a relevant identifier.
   * This should be implemented by a child class and will be used to
   * find a user from a decrypted token's original identifier value.
   * This will fail if the user could not be found.
   *
   * @throws   UserNotFoundError
   * @param id The identifier.
   * @returns  A promise that resolves to the user model, or rejects if not found.
   */
  public abstract getUser(id: string): Promise<T>;

  /**
   * A middleware used to check if the user is authed,
   * and if so populates the router context with the user
   * object.
   *
   * This should be added on the Crea application during
   * its configuration.
   *
   * @returns the auth initializer middleware
   */
  public init(): Middleware {
    return (ctx: RouterContext, next: () => Promise<any>) => {
      return next();
    };
  }

  /**
   * A middleware used to login a user.
   *
   * This should be added on the Crea router
   * at the relevant URL.
   *
   * @returns the auth login middleware
   */
  public login(): Middleware {
    return (ctx: RouterContext, next: () => Promise<any>) => {
      return next();
    };
  }

  /**
   * A middleware used to register a user.
   *
   * This should be added on the Crea router
   * at the relevant URL.
   *
   * @returns the auth register middleware
   */
  public register(): Middleware {
    return (ctx: RouterContext, next: () => Promise<any>) => {
      return next();
    };
  }
}
