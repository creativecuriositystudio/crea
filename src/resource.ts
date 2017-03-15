/**
 * Provides the REST resource-specific routing functionality of a Crea application.
 */
import * as squell from 'squell';
import * as _ from 'lodash';
import { Model, ModelConstructor } from 'modelsafe';

import { ApplicationError } from './app';
import { Router, RouterContext, Middleware } from './router';

/** A type of action on a REST resource. */
export enum ResourceAction {
  /** GET /:id */
  READ,

  /** GET / */
  LIST,

  /** POST / */
  CREATE,

  /** PUT /:id */
  UPDATE,

  /** DELETE /:id */
  DELETE
}

/**
 * A REST resource version of a middleware interface.
 * Used for any resource middlewares.
 *
 * Note that unlike router middlewares, resource middlewares
 * can span across multiple milestones and it's actually
 * correct behaviour for a large number of resource middlewares
 * to be called during handling a resource action.
 *
 * This is unlikely router middlewares, where generally
 * only one is handled during responding a request,
 * unless it is doing something like parsing cookies.
 */
export interface ResourceMiddleware<T extends Model> {
  (this: Resource<T>, ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any>;
}

/**
 * The resource-specific data associated with a resource context.
 */
export interface ResourceData<T extends Model> {
  /** The model constructor for the resource context. */
  model: ModelConstructor<T>;

  /**
   * The query for the resource context. This can be changed
   * in order to execute a custom query, e.g. to add additional
   * where clauses.
   */
  query: squell.Query<T>;

  /** The data for the resource context (if it's been fetched). */
  data?: Partial<T> | Partial<T>[];
}

/**
 * A REST resource-specific implementation of Crea's router context.
 * This will be given to any middleware for a resource.
 */
export interface ResourceContext<T extends Model> extends RouterContext {
  /** Resource-specific data for a resource context. */
  resource: ResourceData<T>;
}

/** Options to customize the behaviour of a REST resource. */
export interface ResourceOptions {
  /** Which REST resource actions should be enabled. */
  actions: ResourceAction[];
}

/**
 * A REST resource implementation of a router.
 * This has a default implementation for a Squell model
 * and can be indirectly customised using options or
 * middleware hooks. These hooks can be run with a defined priority
 * to support overriding default functionality.
 *
 * This can be used on a router
 * at a specific path to mount the resource, e.g.:
 *
 * ```
 * let resource = new Resource(db, User);
 *
 * router.use('/users', resource.routes());
 * ```
 */
export class Resource<T extends Model> extends Router {
  /** Any resource options. */
  protected resourceOptions: ResourceOptions;

  /** The Squell database connection the resource will use. */
  protected db: squell.Database;

  /** The Squell model constructor that the resource will query. */
  protected model: ModelConstructor<T>;

  /**
   * Construct a resource router.
   *
   * @param db The Squell database.
   * @param model The Squell model constructor to query.
   * @param resOptions Any resource options to use.
   */
  constructor(db: squell.Database, model: ModelConstructor<T>, options?: ResourceOptions) {
    super();

    this.db = db;
    this.model = model;
    this.resourceOptions = {
      actions: [
        ResourceAction.LIST,
        ResourceAction.READ,
        ResourceAction.CREATE,
        ResourceAction.UPDATE,
        ResourceAction.DELETE
      ],

      ... options
    };

    for (let action of _.uniq(this.resourceOptions.actions)) {
      switch (action) {
      case ResourceAction.LIST: this.get('/', this.handleList.bind(this)); break;
      case ResourceAction.READ: this.get('/:id', this.handleRead.bind(this)); break;
      case ResourceAction.CREATE: this.post('/', this.handleCreate.bind(this)); break;
      case ResourceAction.UPDATE: this.put('/:id', this.handleUpdate.bind(this)); break;
      case ResourceAction.DELETE: this.delete('/:id', this.handleDelete.bind(this)); break;
      }
    }
  }

  /**
   * Process a list of resource middlewares in the order given.
   * This will run them through a promise chain and continue
   * until the `next` function is not called.
   *
   * @param ctx The resource context.
   * @param mws The resurce middlewares to process.
   */
  private async process(ctx: ResourceContext<T>, mws: ResourceMiddleware<T>[]) {
    let this_ = this;

    return mws.reduce(async (promise, mw) => {
      let result = await promise;

      // If the last promise returned false, then that means
      // it didn't call next and the request should be halted.
      if (!result) {
        return false;
      }

      let cont = false;
      let next = async () => cont = true;

      await mw.bind(this_)(ctx, next);

      return cont;
    }, Promise.resolve(true));
  }

  /**
   * Handle starting a resource request.
   *
   * @param ctx The resource context.
   * @param multiple Whether this is a fetch on multiple instances.
   * @returns A promise handling the request.
   */
  protected async handleStart(ctx: ResourceContext<T>, next: () => Promise<any>, multiple: boolean = false): Promise<any> {
    let db = this.db;

    ctx.resource = {
      model: this.model,
      query: this.db.query(this.model)
    };

    if (!multiple) {
      // Kinda hacky, but we have to do this to make sure
      // we're fetching by whatever primary key they've defined.
      ctx.resource.query = ctx.resource.query.where(_ => db.getInternalModelPrimary(this.model).eq(ctx.params.id));
    }

    return next();
  }

  /**
   * Handle sending a resource request.
   *
   * @param ctx The resource context.
   * @param multiple Whether this is a fetch on multiple instances.
   * @returns A promise handling the request.
   */
  protected async handleSend(ctx: ResourceContext<T>, next: () => Promise<any>, multiple: boolean = false): Promise<any> {
    if (!ctx.resource.data) {
      throw new ApplicationError(404, 'Not Found');
    }

    if (multiple) {
      ctx.multiple(<Partial<T>[]> ctx.resource.data);
    } else {
      ctx.single(<Partial<T>> ctx.resource.data);
    }

    return next();
  }

  /**
   * Handle finishing a resource request.
   *
   * @param ctx The resource context.
   * @returns A promsie handling the request.
   */
  protected async handleFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before starting a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeListStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle starting a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleStart(ctx, next, true);
  }

  /**
   * Do something after starting a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterListStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before fetching a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeListFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle fetching a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource.data = await ctx.resource.query.find();

    return next();
  }

  /**
   * Do something after fetching a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterListFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before sending a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeListSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle sending a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleSend(ctx, next, true);
  }

  /**
   * Do something after sending a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterListSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before finishing a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeListFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle finishing a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleFinish(ctx, next);
  }

  /**
   * Do something after finishing a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterListFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleList(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      this.beforeListStart,
      this.handleListStart,
      this.afterListStart,
      this.beforeListFetch,
      this.handleListFetch,
      this.afterListFetch,
      this.beforeListSend,
      this.handleListSend,
      this.afterListSend,
      this.beforeListFinish,
      this.handleListFinish,
      this.afterListFinish
    ]);
  }

  /**
   * Do something before starting a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeReadStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle starting a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleStart(ctx, next);
  }

  /**
   * Do something after starting a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterReadStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before fetching a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeReadFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle fetching a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource.data = await ctx.resource.query.findOne();

    return next();
  }

  /**
   * Do something after finishing a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterReadFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before sending a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeReadSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle sending a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleSend(ctx, next);
  }

  /**
   * Do something after sending a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterReadSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before finishing a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeReadFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle finishing a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleFinish(ctx, next);
  }

  /**
   * Do something after finishing a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterReadFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleRead(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      this.beforeReadStart,
      this.handleReadStart,
      this.afterReadStart,
      this.beforeReadFetch,
      this.handleReadFetch,
      this.afterReadFetch,
      this.beforeReadSend,
      this.handleReadSend,
      this.afterReadSend,
      this.beforeReadFinish,
      this.handleReadFinish,
      this.afterReadFinish
    ]);
  }

  /**
   * Do something before starting a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeCreateStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle starting a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleStart(ctx, next);
  }

  /**
   * Do something after starting a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterCreateStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before writing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeCreateWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle writing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource.data = await ctx.resource.query.create(ctx.request.body as T);

    return next();
  }

  /**
   * Do something after writing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterCreateWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before sending a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeCreateSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle sending a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleSend(ctx, next);
  }

  /**
   * Do something after sending a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterCreateSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before finishing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeCreateFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle finishing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleFinish(ctx, next);
  }

  /**
   * Do something after finishing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterCreateFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreate(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      this.beforeCreateStart,
      this.handleCreateStart,
      this.afterCreateStart,
      this.beforeCreateWrite,
      this.handleCreateWrite,
      this.afterCreateWrite,
      this.beforeCreateSend,
      this.handleCreateSend,
      this.afterCreateSend,
      this.beforeCreateFinish,
      this.handleCreateFinish,
      this.afterCreateFinish
    ]);
  }

  /**
   * Do something before starting a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeUpdateStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle starting a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleStart(ctx, next);
  }

  /**
   * Do something after starting a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before fetching a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeUpdateFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle fetching a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource.data = await ctx.resource.query.findOne();

    return next();
  }

  /**
   * Do something after fetching a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before writing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeUpdateWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle writing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    await ctx.resource.query.update(ctx.request.body as Partial<T>);

    // We reload. Kind of suboptimal but our only solution right now.
    ctx.resource.data = await ctx.resource.query.findOne();

    return next();
  }

  /**
   * Do something after writing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before sending a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeUpdateSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle sending a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleSend(ctx, next);
  }

  /**
   * Do something after sending a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before finishing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeUpdateFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle finishing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleFinish(ctx, next);
  }

  /**
   * Do something after finishing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdate(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      this.beforeUpdateStart,
      this.handleUpdateStart,
      this.afterUpdateStart,
      this.beforeUpdateFetch,
      this.handleUpdateFetch,
      this.afterUpdateFetch,
      this.beforeUpdateWrite,
      this.handleUpdateWrite,
      this.afterUpdateWrite,
      this.beforeUpdateSend,
      this.handleUpdateSend,
      this.afterUpdateSend,
      this.beforeUpdateFinish,
      this.handleUpdateFinish,
      this.afterUpdateFinish
    ]);
  }

  /**
   * Do something before starting a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeDeleteStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle starting a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleStart(ctx, next);
  }

  /**
   * Do something after starting a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before fetching a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeDeleteFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle fetching a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource.data = await ctx.resource.query.findOne();

    return next();
  }

  /**
   * Do something after fetching a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before writing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeDeleteWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle writing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    // Throw a 404 if we haven't fetched anything.
    // We can't successfully delete without finding something first.
    if (!ctx.resource.data) {
      throw new ApplicationError(404, 'Not Found');
    }

    await ctx.resource.query.destroy();

    // Get rid of the resource data to indicate it was destroyed.
    ctx.resource.data = null;

    return next();
  }

  /**
   * Do something after writing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before sending a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeDeleteSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle sending a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    // Send an empty body to indicate a successful delete.
    ctx.body = {};
  }

  /**
   * Do something after sending a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before finishing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeDeleteFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle finishing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.handleFinish(ctx, next);
  }

  /**
   * Do something after finishing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDelete(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      this.beforeDeleteStart,
      this.handleDeleteStart,
      this.afterDeleteStart,
      this.beforeDeleteFetch,
      this.handleDeleteFetch,
      this.afterDeleteFetch,
      this.beforeDeleteWrite,
      this.handleDeleteWrite,
      this.afterDeleteWrite,
      this.beforeDeleteSend,
      this.handleDeleteSend,
      this.afterDeleteSend,
      this.beforeDeleteFinish,
      this.handleDeleteFinish,
      this.afterDeleteFinish
    ]);
  }
}
