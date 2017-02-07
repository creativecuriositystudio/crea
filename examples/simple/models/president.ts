import * as squell from 'squell';
import { model, attr, validate } from 'squell';

/**
 * The president model, defined using Squell.
 */
@model('president')
export default class President extends squell.Model {
  @attr(squell.INTEGER, { primaryKey: true, autoIncrement: true })
  public id: number;

  @attr(squell.STRING, { allowNull: false })
  public givenNames: string;

  @attr(squell.STRING, { allowNull: false })
  public lastName: string;

  @attr(squell.BOOLEAN, { defaultValue: false })
  public active: boolean;

  @attr(squell.DATE)
  public electedAt: Date;

  @attr(squell.DATE)
  public inauguratedAt: Date;

  @attr(squell.DATE)
  public createdAt: Date;

  @attr(squell.DATE)
  public updatedAt: Date;
}
