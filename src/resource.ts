/**
 * Provides the REST resource-specific routing functionality of an application.
 */
import * as squell from 'squell';
import * as _ from 'lodash';
import { Model, ModelConstructor } from 'modelsafe';

import { ApplicationError } from './app';
import { Router, RouterContext } from './router';
import { Auth } from './auth';

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
export type ResourceMiddleware<T extends Model> = (this: Resource<T>, ctx: ResourceContext<T>,
                                                   next: () => Promise<any>) => Promise<any>;

/**
 * The resource-specific data associated with a resource context.
 */
export interface ResourceData<T extends Model> {
  /** Resource name */
  name: string;

  /** Action name */
  actionName: string;

  /** The model constructor for the resource context. */
  model: ModelConstructor<T>;

  /**
   * The query for the resource context. This can be changed
   * in order to execute a custom query, e.g. to add additional
   * where clauses.
   */
  query: squell.Query<T>;

  /**
   * Whether this resource is acting on a single instance
   * or multiple instances. The only resource action
   * that acts on multiple currently is listing.
   */
  multiple: boolean;

  /**
   * The data for the request. This is initially
   * populated from the body during the start milestone and then
   * merged onto the actual model instance during
   * the write step.
   */
  data: Partial<T> | Partial<T>[];

  /** The model instance data for the resource context (if it's been fetched). */
  instance?: T | T[];
}

/**
 * A REST resource-specific implementation of a router context.
 * This will be given to any middleware for a resource.
 */
export interface ResourceContext<T extends Model> extends RouterContext {
  /** Resource-specific data for a resource context. */
  resource: ResourceData<T>;
}

/** Options to customize the behaviour of a REST resource. */
export interface ResourceOptions<T extends Model> {
  /** Resource name */
  name: string;

  /** Which REST resource actions should be enabled. */
  actions?: ResourceAction[];

  /** Whether to include all associations on the resource. Defaults to false. */
  associations?: boolean;

  /** Authoriser for authenticating route access */
  auth: Auth<T>;

  /** List of roles that are allowed to access the given actions. '*' means all actions */
  allowedRoles: object;
}

/**
 * A REST resource implementation of a router.
 * This has a default implementation of a REST resource.
 * Each action and milestone are broken up into
 * their own methods, allowing extending this class
 * with changes to the default functionality.
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
  protected resourceOptions: ResourceOptions<T>;

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
  constructor(db: squell.Database, model: ModelConstructor<T>, options?: ResourceOptions<T>) {
    super();

    this.db = db;
    this.model = model;
    this.resourceOptions = {
      name: null,
      associations: false,
      actions: [
        ResourceAction.LIST,
        ResourceAction.READ,
        ResourceAction.CREATE,
        ResourceAction.UPDATE,
        ResourceAction.DELETE
      ],
      auth: null,
      allowedRoles: {},
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
   * Process a single resource middleware or a chain of resource middlewares in the order given.
   * This normally will be called with the default chain of middlewares to run through for a specific
   * REST action, but you should use it if you intend to process any sub-chain of middlewares
   * in your own resource methods.
   *
   * Using this function ensures that every middlware (or the single middleware) will receive
   * a `next` function.
   *
   * This function takes a `parentNext` function which should be the `next` function given to the
   * the callee of this function (i.e. the middleware of the parent chain). The `next` function
   * then passes to the sub-chain of this process will automatically call the callee's provided
   * `parentNext` function if the last middleware returns/calls `next`. This ensures
   * that when you process a chain of middlewares, the `next` behaviour will carry across
   * from the chain to the parent function.
   *
   * This uses the same logic as Koa's middleware composing.
   *
   * @see https://github.com/koajs/compose/blob/master/index.js
   * @param ctx The resource context.
   * @param chain The resurce middleware[s] to process.
   * @param parentNext The next function of the middleware, if available.
   * @returns A promise processing the resource middleware[s].
   */
  private async process(ctx: ResourceContext<T>, chain: ResourceMiddleware<T> | ResourceMiddleware<T>[],
                        parentNext?: () => Promise<any>): Promise<any> {
    let mws = chain as ResourceMiddleware<T>[];

    if (!Array.isArray(chain)) {
      mws = [chain as ResourceMiddleware<T>];
    }

    if (typeof (parentNext) !== 'function') {
      parentNext = async () => undefined;
    }

    // The last called middleware number.
    let index = -1;
    let dispatch = async (i: number) => {
      let mw = mws[i];

      if (i <= index) {
        throw new Error('next() called multiple times in resource middleware');
      }

      index = i;

      if (i === mws.length) return parentNext();
      if (!mw) return;

      return (mw.bind(this))(ctx, async () => {
        return dispatch(i + 1);
      });
    };

    return dispatch(0);
  }

  /**
   * Handle starting a resource request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    let model = this.model;
    let db = this.db;
    let resource = {
      multiple: false,
      model,
      query: db.query(model),
      data: _.clone(ctx.request.body) as Partial<T> | Partial<T>[],

      ... ctx.resource,
    };

    if (!resource.multiple) {
      // Kinda hacky, but we have to do this to make sure
      // we're fetching by whatever primary key they've defined.
      resource.query = resource.query.where(_ => db.getInternalModelPrimary(this.model).eq(ctx.params.id));
    }

    // Iterate through all of the associations add them as includes.
    if (this.resourceOptions.associations) resource.query = resource.query.includeAll({ associateOnly: true });

    ctx.resource = resource;

    return next();
  }

  /**
   * Handle authenticating a resource request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleAuth(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.resourceOptions.auth ?
      this.process(ctx, this.resourceOptions.auth.authorised(ctx.resource.name, ctx.resource.actionName), next) :
      next();
  }

  /**
   * Handle sending a resource request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    if (!ctx.resource.instance) {
      throw new ApplicationError(404, 'Not Found');
    }

    if (ctx.resource.multiple) {
      ctx.responder.multiple(ctx.resource.instance as T[]);
    } else {
      ctx.responder.single(ctx.resource.instance as T);
    }

    return next();
  }

  /**
   * Handle finishing a resource request.
   *
   * @param ctx The resource context.
   * @returns A promsie handling the request.
   */
  protected async handleFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before starting a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeListStart(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle starting a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource = {
      name: this.resourceOptions.name,
      actionName: 'list',
      multiple: true
    } as ResourceData<T>;

    return this.process(ctx, this.handleStart, next);
  }

  /**
   * Do something before authenticating a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeListAuth(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle authenticating a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListAuth(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleAuth, next);
  }

  /**
   * Do something after authenticating a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterListAuth(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something after starting a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterListStart(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before fetching a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeListFetch(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle fetching a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource.instance = await ctx.resource.query.find();

    return next();
  }

  /**
   * Do something after fetching a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterListFetch(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before sending a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeListSend(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle sending a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleSend, next);
  }

  /**
   * Do something after sending a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterListSend(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before finishing a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeListFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle finishing a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleFinish, next);
  }

  /**
   * Do something after finishing a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterListFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
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
  protected async beforeReadStart(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle starting a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource = {
      name: this.resourceOptions.name,
      actionName: 'read',
    } as ResourceData<T>;

    return this.process(ctx, this.handleStart, next);
  }

  /**
   * Do something after starting a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterReadStart(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before authenticating a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeReadAuth(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle authenticating a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadAuth(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleAuth, next);
  }

  /**
   * Do something after authenticating a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterReadAuth(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before fetching a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeReadFetch(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle fetching a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource.instance = await ctx.resource.query.findOne();

    return next();
  }

  /**
   * Do something after finishing a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterReadFetch(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before sending a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeReadSend(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle sending a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleSend, next);
  }

  /**
   * Do something after sending a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterReadSend(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before finishing a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeReadFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
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
  protected async afterReadFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
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
  protected async beforeCreateStart(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle starting a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource = {
      name: this.resourceOptions.name,
      actionName: 'create',
    } as ResourceData<T>;

    return this.process(ctx, this.handleStart, next);
  }

  /**
   * Do something after starting a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterCreateStart(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before authenticating a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeCreateAuth(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle authenticating a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateAuth(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleAuth, next);
  }

  /**
   * Do something after authenticating a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterCreateAuth(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before writing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeCreateWrite(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle writing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource.instance = await ctx.resource.query.create(ctx.resource.data as T);

    return next();
  }

  /**
   * Do something after writing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterCreateWrite(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before sending a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeCreateSend(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle sending a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleSend, next);
  }

  /**
   * Do something after sending a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterCreateSend(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before finishing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeCreateFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle finishing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleFinish, next);
  }

  /**
   * Do something after finishing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterCreateFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
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
  protected async beforeUpdateStart(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle starting a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource = {
      name: this.resourceOptions.name,
      actionName: 'update',
    } as ResourceData<T>;

    return this.process(ctx, this.handleStart, next);
  }

  /**
   * Do something after starting a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateStart(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before authenticating a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeUpdateAuth(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle authenticating a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateAuth(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleAuth, next);
  }

  /**
   * Do something after authenticating a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateAuth(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before fetching a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeUpdateFetch(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle fetching a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource.instance = await ctx.resource.query.findOne();

    return next();
  }

  /**
   * Do something after fetching a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateFetch(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before writing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeUpdateWrite(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle writing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateWrite(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    await ctx.resource.query.update(ctx.resource.data as Partial<T>);

    // We reload. Kind of suboptimal but our only solution right now.
    ctx.resource.instance = await ctx.resource.query.findOne();

    return next();
  }

  /**
   * Do something after writing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateWrite(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before sending a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeUpdateSend(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle sending a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateSend(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleSend, next);
  }

  /**
   * Do something after sending a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateSend(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before finishing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeUpdateFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle finishing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleFinish, next);
  }

  /**
   * Do something after finishing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterUpdateFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
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
  protected async beforeDeleteStart(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle starting a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteStart(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource = {
      name: this.resourceOptions.name,
      actionName: 'delete',
    } as ResourceData<T>;

    return this.process(ctx, this.handleStart, next);
  }

  /**
   * Do something after starting a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteStart(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before authenticating a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeDeleteAuth(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle authenticating a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteAuth(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleAuth, next);
  }

  /**
   * Do something after authenticating a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteAuth(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before fetching a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeDeleteFetch(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle fetching a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteFetch(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    ctx.resource.instance = await ctx.resource.query.findOne();

    return next();
  }

  /**
   * Do something after fetching a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteFetch(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before writing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeDeleteWrite(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
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
    if (!ctx.resource.instance) {
      throw new ApplicationError(404, 'Not Found');
    }

    await ctx.resource.query.destroy();

    // Get rid of the resource data to indicate it was destroyed.
    ctx.resource.instance = null;

    return next();
  }

  /**
   * Do something after writing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteWrite(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before sending a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeDeleteSend(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle sending a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteSend(ctx: ResourceContext<T>, _next: () => Promise<any>): Promise<any> {
    // Send an empty body to indicate a successful delete.
    ctx.body = {};
  }

  /**
   * Do something after sending a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteSend(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Do something before finishing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async beforeDeleteFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return next();
  }

  /**
   * Handle finishing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteFinish(ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
    return this.process(ctx, this.handleFinish, next);
  }

  /**
   * Do something after finishing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async afterDeleteFinish(_ctx: ResourceContext<T>, next: () => Promise<any>): Promise<any> {
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
      this.beforeDeleteAuth,
      this.handleDeleteAuth,
      this.afterDeleteAuth,
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
