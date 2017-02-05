/**
 * Provides generalized concepts of an application user.
 */

/**
 * An abstract class that represents the user model in a web application.
 * This should be extended by an application that needs user authentication,
 * and should be casted from to the application's user model when necessary.
 */
export abstract class User {
  /**
   * An abstract method that fetches the identifier for a specific user
   * in order to generate an auth token. This should be implemented
   * by a child class.
   *
   * The identifier should be unique as it in turn will be used to find a user
   * in the database when the token is decrypted.
   *
   * @param user The user to get the identifier for.
   * @returns    A promise that resolves to the user identifier.
   */
  public abstract getIdentifier(): Promise<string>;
}
