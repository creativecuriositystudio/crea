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
  /** The router context being used to respond. */
  protected ctx: RouterContext;

  /**
   * Constructs a responder for a router context.
   *
   * @param ctx The router context to respond to.
   */
  constructor(ctx: RouterContext) {
    this.ctx = ctx;
  }

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
  async error(err: ApplicationError): Promise<any> {
    this.ctx.status = err.status;
    this.ctx.body = {
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
  async single<T extends Model>(instance: T): Promise<any> {
    this.ctx.status = 200;
    this.ctx.body = instance;
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
  async multiple<T extends Model>(instances: T[]): Promise<any> {
    this.ctx.status = 200;
    this.ctx.body = instances;
  }
}

/*
 * A responder class/constructor to be used to instantiate
 * the responder for a request.
 */
export type ResponderConstructor = typeof Responder & { new (ctx: RouterContext): Responder };
