/**
 * Provides the REST resource-specific routing functionality of a Crea application.
 */
import * as squell from 'squell';
import * as _ from 'lodash';

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
 * A REST resource-specific version of Crea's middleware interface.
 * Used for any resource middlewares.
 */
export interface ResourceMiddleware<T extends squell.Model> {
  (ctx: ResourceContext<T>): Promise<any>;
}

/**
 * The resource-specific data associated with a resource context.
 */
export interface ResourceData<T extends squell.Model> {
  /** The model constructor for the resource context. */
  model: squell.ModelConstructor<T>;

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
export interface ResourceContext<T extends squell.Model> extends RouterContext {
  /** Resource-specific data for a resource context. */
  resource: ResourceData<T>;
}

/** Options to customize the behaviour of a REST resource.*/
export interface ResourceOptions {
  /** Which REST resource actions should be enabled. */
  actions: ResourceAction[];
}

/*
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
export class Resource<T extends squell.Model> extends Router {
  /** Any resource options. */
  protected resourceOptions: ResourceOptions;

  /** The Squell database connection the resource will use. */
  protected db: squell.Database;

  /** The Squell model constructor that the resource will query. */
  protected model: squell.ModelConstructor<T>;

  /**
   * Construct a resource router.
   *
   * @param db The Squell database.
   * @param model The Squell model constructor to query.
   * @param resOptions Any resource options to use.
   */
  constructor(db: squell.Database, model: squell.ModelConstructor<T>, options?: ResourceOptions) {
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
   * Handle starting a resource request.
   *
   * @param ctx The resource context.
   * @param singleQuery Whether this is a fetch on a single resource. The query will been
   *                    automatically setup if true.
   * @returns A promise handling the request.
   */
  protected async handleStart(ctx: ResourceContext<T>, singleQuery = false): Promise<any> {
    let db = this.db;

    ctx.resource = {
      model: this.model,
      query: this.db.query(this.model)
    };

    if (singleQuery) {
      // Kinda hacky, but we have to do this to make sure
      // we're fetching by whatever primary key they've defined.
      ctx.resource.query = ctx.resource.query.where(_ => db.getModelPrimary(this.model).eq(ctx.params.id));
    }
  }

  /**
   * Handle sending a resource request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleSend(ctx: ResourceContext<T>, singleQuery = false): Promise<any> {
    if (!ctx.resource.data) {
      throw new ApplicationError(404, 'Not Found');
    }

    if ((<Partial<T>[]> ctx.resource.data).length) {
      ctx.body = ctx.resource.data;
    } else {
      ctx.body = ctx.resource.data;
    }
  }

  /**
   * Handle finishing a resource request.
   *
   * @param ctx The resource context.
   * @returns A promsie handling the request.
   */
  protected async handleFinish(ctx: ResourceContext<T>): Promise<any> { 
  }

  /**
   * Handle starting a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListStart(ctx: ResourceContext<T>): Promise<any> {
    return this.handleStart(ctx);
  }

  /**
   * Handle fetching a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListFetch(ctx: ResourceContext<T>): Promise<any> {
    ctx.resource.data = await ctx.resource.query.find();
  }

  /**
   * Handle sending a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListSend(ctx: ResourceContext<T>): Promise<any> {
    return this.handleSend(ctx);
  }

  /**
   * Handle finishing a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListFinish(ctx: ResourceContext<T>): Promise<any> {
    return this.handleFinish(ctx);
  }

  /**
   * Handle a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleList(ctx: ResourceContext<T>): Promise<any> {

  }

  /**
   * Handle starting a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadStart(ctx: ResourceContext<T>): Promise<any> {
    return this.handleStart(ctx, true);
  }

  /**
   * Handle fetching a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadFetch(ctx: ResourceContext<T>): Promise<any> {
    ctx.resource.data = await ctx.resource.query.findOne();
  }

  /**
   * Handle sending a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadSend(ctx: ResourceContext<T>): Promise<any> {
    return this.handleSend(ctx);
  }

  /**
   * Handle finishing a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadFinish(ctx: ResourceContext<T>): Promise<any> {
    return this.handleFinish(ctx);
  }

  /**
   * Handle a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleRead(ctx: ResourceContext<T>): Promise<any> {
  }

  /**
   * Handle starting a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateStart(ctx: ResourceContext<T>): Promise<any> {
    return this.handleStart(ctx);
  }

  /**
   * Handle writing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateWrite(ctx: ResourceContext<T>): Promise<any> {
    ctx.resource.data = await ctx.resource.query.create(ctx.request.body as T);
  }

  /**
   * Handle sending a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateSend(ctx: ResourceContext<T>): Promise<any> {
    return this.handleSend(ctx);
  }

  /**
   * Handle finishing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateFinish(ctx: ResourceContext<T>): Promise<any> {
    return this.handleFinish(ctx);
  }

  /**
   * Handle a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreate(ctx: ResourceContext<T>): Promise<any> {

  }

  /**
   * Handle starting a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateStart(ctx: ResourceContext<T>): Promise<any> {
    return this.handleStart(ctx, true);
  }

  /**
   * Handle fetching a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateFetch(ctx: ResourceContext<T>): Promise<any> {
    ctx.resource.data = await ctx.resource.query.findOne();
  }

  /**
   * Handle writing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateWrite(ctx: ResourceContext<T>): Promise<any> {
    await ctx.resource.query.update(ctx.request.body as Partial<T>);

    // We reload. Kind of suboptimal but our only solution right now.
    ctx.resource.data = await ctx.resource.query.findOne();
  }

  /**
   * Handle sending a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateSend(ctx: ResourceContext<T>): Promise<any> {
    return this.handleSend(ctx);
  }

  /**
   * Handle finishing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateFinish(ctx: ResourceContext<T>): Promise<any> {
    return this.handleFinish(ctx);
  }

  /**
   * Handle a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdate(ctx: ResourceContext<T>): Promise<any> {

  }

  /**
   * Handle starting a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteStart(ctx: ResourceContext<T>): Promise<any> {
    return this.handleStart(ctx, true);
  }

  /**
   * Handle fetching a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteFetch(ctx: ResourceContext<T>): Promise<any> {
    ctx.resource.data = await ctx.resource.query.findOne();
  }

  /**
   * Handle writing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteWrite(ctx: ResourceContext<T>): Promise<any> {
    // Throw a 404 if we haven't fetched anything.
    // We can't successfully delete without finding something first.
    if (!ctx.resource.data) {
      throw new ApplicationError(404, 'Not Found');
    }

    await ctx.resource.query.destroy();

    // Get rid of the resource data to indicate it was destroyed.
    ctx.resource.data = null;
  }

  /**
   * Handle sending a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteSend(ctx: ResourceContext<T>): Promise<any> {
    // Send an empty body to indicate a successful delete.
    ctx.body = {};
  }

  /**
   * Handle finishing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteFinish(ctx: ResourceContext<T>): Promise<any> {
    return this.handleFinish(ctx);
  }

  /**
   * Handle a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDelete(ctx: ResourceContext<T>): Promise<any> {

  }
}
