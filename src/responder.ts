import { Model } from 'modelsafe';

import { ApplicationError } from './app';
import { RouterContext } from './router';

/**
 * Handles REST responses to clients using resource.
 * If you would like to change the format Restla sends
 * errors or resource responses, extend this class
 * and provide it as a responder in the application options.
 */
export class Responder {
  /**
   * Handles responding with an error in an application.
   * The default implementation will:
   *
   * The errors are sent in the following format:
   *
   * ```json
   * {
   *   "message": "The message of the error",
   *   "data": [{
   *     "path": "name",
   *     "message": "The name is invalid"
   *   }]
   * }
   * ```
   *
   * The `data` portion is completely contextual based off
   * the error that was raised - but it's most obvious
   * use is for sending down the list of fields and their
   * errors for bad requests.
   *
   * @param err The error to send to the client.
   * @returns A promise that resolves sending the error to the client.
   */
  async error(ctx: RouterContext, err: ApplicationError): Promise<any> {
    ctx.status = err.status;
    ctx.body = {
      message: err.message,
      data: err.data
    };
  }

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
  async single<T extends Model>(ctx: RouterContext, instance: T): Promise<any> {
    ctx.status = 200;
    ctx.body = instance;
  }

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
  async multiple<T extends Model>(ctx: RouterContext, instances: T[]): Promise<any> {
    ctx.status = 200;
    ctx.body = instances;
  }
}
