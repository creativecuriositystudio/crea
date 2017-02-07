import * as squell from 'squell';
import * as crea from '../../dist/index';

import User from './models/user';

/**
 * Our authentication manager.
 */
export default class Auth extends crea.Auth<User> {
  private db: squell.Database;

  /**
   * Construct the authentication manager.
   *
   * @param db The squell database.
   */
  constructor(db: squell.Database, secret: string) {
    super(secret);

    this.db = db;
  }

  /**
   * Get our user by an ID.
   *
   * @param id The user ID
   * @returns The user with the ID.
   */
  async getUser(id: string): Promise<User> {
    let user = await this.db
      .query(User)
      .where(m => m.id.cast().eq(id))
      .findOne();

    if (!user) {
      throw new crea.UserNotFoundError();
    }

    return user;
  }

  /**
   * Get the user identifier.
   *
   * @param user The user.
   * @returns The user identifier.
   */
  getIdentifier(user: User): string {
    return user.id.toString();
  }
}
