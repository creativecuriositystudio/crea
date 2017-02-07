import * as squell from 'squell';
import { model, attr, validate } from 'squell';

@model('user')
export default class User extends squell.Model {
  @attr(squell.INTEGER, { primaryKey: true, autoIncrement: true })
  public id: number;

  @attr(squell.STRING, { unique: true })
  public username: string;

  /*
   * NOTE: *DO NOT* USE A PLAIN TEXT PASSWORD IN PRODUCTION.
   * This is for example purposes only.
   */
  @attr(squell.STRING)
  public password: string;

  @attr(squell.DATE)
  public createdAt: Date;

  @attr(squell.DATE)
  public updatedAt: Date;
}
