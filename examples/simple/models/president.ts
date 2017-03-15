import * as modelsafe from 'modelsafe';
import * as squell from 'squell';

/**
 * The president model, defined using Squell.
 */
@modelsafe.model()
export class President extends modelsafe.Model {
  @modelsafe.attr(modelsafe.INTEGER, { primary: true })
  @squell.attr({ autoIncrement: true })
  public id: number;

  @modelsafe.attr(modelsafe.STRING)
  @squell.attr({ allowNull: false })
  public givenNames: string;

  @modelsafe.attr(modelsafe.STRING)
  @squell.attr({ allowNull: false })
  public lastName: string;

  @modelsafe.attr(modelsafe.STRING)
  @squell.attr({ defaultValue: false })
  public active: boolean;

  @modelsafe.attr(modelsafe.DATE)
  public electedAt: Date;

  @modelsafe.attr(modelsafe.DATE)
  public inauguratedAt: Date;

  @modelsafe.attr(modelsafe.DATE)
  public createdAt: Date;

  @modelsafe.attr(modelsafe.DATE)
  public updatedAt: Date;
}
