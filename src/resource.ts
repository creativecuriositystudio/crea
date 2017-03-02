/**
 * Provides the REST resource-specific routing functionality of a Crea application.
 */
import * as squell from 'squell';
import * as _ from 'lodash';

import { Router, RouterContext, Middleware } from './router';

/** The error for a specific field on a resource. */
export interface ResourceFieldError {
  path: string;
  message: string;
}

/** Raised by any middleware handling a REST resource. */
export class ResourceError extends Error {
  status: number;
  errors?: ResourceFieldError[];

  constructor(status: number, message: string, errors?: ResourceFieldError[]) {
    super(message);

    this.name = 'ResourceError';
    this.stack = new Error().stack;
    this.status = status;
    this.errors = errors;
  }

  /**
   * Coerce a Squell validation error into our resource error
   * form.
   *
   * @param err The Squell validation error.
   * @returns A resource error version.
   */
  static coerce(err: squell.ValidationError<any>): ResourceError {
    let errors = err.errors;
    let coercedErrors: ResourceFieldError[] = [];

    for (let key in errors) {
      if (errors.hasOwnProperty(key)) {
        coercedErrors = coercedErrors.concat(_.map(errors[key], (attrErr: squell.AttributeError) => {
          return {
            path: key,
            message: attrErr.message
          };
        }));
      }
    }

    return new ResourceError(400, err.message, coercedErrors);
  }
}

/** A result of a resource middleware. */
export enum ResourceStatus {
  /** Will have the resource action keep handling as normal. */
  CONTINUE,

  /** Will have the resource action stop handling. No further hooks will be handled. */
  STOP,

  /** Will skip the next resource middleware. */
  SKIP
}

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

/** A type of milestone on a REST resource action. */
export enum ResourceMilestone {
  /** The request has started (all actions). */
  START,

  /** The data for the resource is being fetched from the database (READ/LIST/UPDATE). */
  FETCH,

  /** The data is being changed in the database (CREATE/UPDATE). */
  WRITE,

  /** The data is being sent in a response (all actions). */
  SEND,

  /** The request is finishing (all actions). */
  FINISH
}

/**
 * A REST resource-specific version of Crea's middleware interface.
 * Used for any resource middlewares.
 */
export interface ResourceMiddleware<T extends squell.Model> {
  (ctx: ResourceContext<T>): Promise<ResourceStatus>;
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

/**
 * Options to customize the behaviour of a REST resource.
 */
export interface ResourceOptions {}

/**
 * Options to customize the behaviour of middleware hooked into a REST resource's action.
 */
export interface ResourceHookOptions {
  priority: number;
}

/**
 * A hook for a specific REST action.
 */
export interface ResourceHook<T extends squell.Model> {
  /** The priority of a hook. A higher number will run first. */
  priority: number;

  /** The middleware to run for the hook. */
  mw: ResourceMiddleware<T>;
}

/**
 * A map of hooks available for a specific REST action milestone.
 *
 * Unfortunately TypeScript does not allow us to use the ResourceAction
 * type as the key here, so we use its numerical version.
 *
 * @see ResourceAction
 */
export interface ResourceMilestoneHooks<T extends squell.Model> {
  [key: number]: ResourceHook<T>[];
}

/**
 * A map of milestones available for a specific REST action.
 */
export interface ResourceActionMilestones<T extends squell.Model> {
  [key: number]: ResourceMilestoneHooks<T>;
}

let defaultOptions = {};

let defaultHookOptions: ResourceHookOptions = {
  priority: 0
};

let defaultUserHookOptions: ResourceHookOptions = {
  ... defaultHookOptions,

  priority: 1
};

/**
 * A definition of a resource action's milestones,
 * with a default middleware for handling the action.
 */
export interface ResourceMilestoneDefinition<T extends squell.Model> {
  /** The action for the definition. */
  action: ResourceAction;

  /** The action for the resource milestone. */
  milestone: ResourceMilestone;

  /**
   * The base middleware for the definition.
   * This will run as the default definition behaviour.
   */
  mw: ResourceMiddleware<T>;
}

/** Hooks for a resource. */
export interface ResourceHooks<T extends squell.Model> {
  /**
   * All of the before hooks added to the resource.
   *
   * Note that these hooks have already been pre-sorted by priority
   * to minimise sorting functions done (i.e. they're only sorted
   * when added instead of every time routes is called).
   */
  before: ResourceActionMilestones<T>;

  /** All of the on hooks added to the resource. */
  on: ResourceActionMilestones<T>;

  /** All of the after hooks added to the resource. */
  after: ResourceActionMilestones<T>;
}

/** Options for a resource. */
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
  /** Hooks for the resource. */
  protected hooks: ResourceHooks<T>;

  /** Any resource options. */
  protected resOptions: ResourceOptions;

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
   * @param hooks Any existing resource hooks.
   */
  constructor(db: squell.Database, model: squell.ModelConstructor<T>,
              resOptions?: ResourceOptions, hooks?: ResourceHooks<T>) {
    super();

    this.db = db;
    this.model = model;
    this.hooks = {
      before: [],
      on: [],
      after: [],

      ... hooks
    };

    this.resOptions = {
      actions: [ResourceAction.LIST, ResourceAction.READ, ResourceAction.CREATE,
                ResourceAction.UPDATE, ResourceAction.DELETE],

      ... resOptions
    };

    for (let action of _.uniq(this.resOptions.actions)) {
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
   * A helper function that returns the action milestones with an added hook.
   * This returns a copy of the hooks with the new changes, allowing
   * resources to be functionally chained.
   *
   * @param hooks The resource action milestones.
   * @param action The resource action to add a hook for.
   * @param milestone The resource milestone to add a hook for.
   * @param mw The hook's middleware.
   * @param options Any options that are used to customize the resource's hook behaviour.
   * @returns The resource action milestones mutated.
   */
  private hook(hooks: ResourceActionMilestones<T>,
               action: ResourceAction, milestone: ResourceMilestone,
               mw: ResourceMiddleware<T>, options: ResourceHookOptions): ResourceActionMilestones<T> {
    let cloned = _.clone(hooks);
    let hook: ResourceHook<T> = {
      priority: options.priority,
      mw
    };

    if (!cloned[action]) {
      cloned[action] = {};
    }

    if (!cloned[action][milestone]) {
      cloned[action][milestone] = [];
    }

    let arr = cloned[action][milestone];

    // Insert into the hook array based off priority.
    arr.splice(_.sortedIndexBy(arr, hook, _.property('priority')), 0, hook);

    return cloned;
  }

  /**
   * Adds a before hook to a specific resource action milestone.
   * Before hooks will be called before a certain resource action's milestone is triggered.
   * This will return a new resource and can be used to chain middleware hooks.
   *
   * @param action The resource action.
   * @param milestone The resource milestone.
   * @param mw The resource middleware the hook will call.
   * @param options Any options to be used by the hook.
   * @return The new resource with the before hook added.
   */
  before(action: ResourceAction, milestone: ResourceMilestone,
         mw: ResourceMiddleware<T>, options?: ResourceHookOptions): Resource<T> {
    let beforeHooks = this.hook(this.hooks.before, action, milestone, mw, {
      ... defaultUserHookOptions,
      ... options
    });

    return new Resource(this.db, this.model, this.resOptions, {
      ... this.hooks,

      before: beforeHooks
    });
  }

  /**
   * Adds a on hook to a specific resource action milestone.
   * On hooks are used to override the actual functionality of the resource action request,
   * in other words can be used to change how the actual resource is handled rather
   * than adding before/after functionality (which simply adds additional behaviour).
   * The default functionality of the resource request handling has a priority of 0,
   * and user hooks have priority 1 (unless overriden using hook options). This means
   * that any on middleware hooks added using the default options will run before
   * the default resource request behaviour.
   *
   * This will return a new resource and can be used to chain middleware hooks.
   *
   * @param action The resource action.
   * @param milestone The resource milestone.
   * @param mw The resource middleware the hook will call.
   * @param options Any options to be used by the hook.
   * @return The new resource with the before hook added.
   */
  on(action: ResourceAction, milestone: ResourceMilestone,
     mw: ResourceMiddleware<T>, options?: ResourceHookOptions): Resource<T> {
     let onHooks = this.hook(this.hooks.on, action, milestone, mw, {
       ... defaultUserHookOptions,
       ... options
     });

     return new Resource(this.db, this.model, this.resOptions, {
       ... this.hooks,

       on: onHooks
     });
  }

  /**
   * Adds an after hook to a specific resource action milestone.
   * After hooks will be called after a certain resource action's milestone is triggered.
   * This will return a new resource and can be used to chain middleware hooks.
   *
   * @param action The resource action.
   * @param milestone The resource milestone.
   * @param mw The resource middleware the hook will call.
   * @param options Any options to be used by the hook.
   * @return The new resource with the before hook added.
   */
  after(action: ResourceAction, milestone: ResourceMilestone,
        mw: ResourceMiddleware<T>, options?: ResourceHookOptions): Resource<T> {
    let afterHooks = this.hook(this.hooks.after, action, milestone, mw, {
      ... defaultUserHookOptions,
      ... options
    });

    return new Resource(this.db, this.model, this.resOptions, {
      ... this.hooks,

      after: afterHooks
    });
  }

  /**
   * A helper function for processing a specific chain of resource hooks.
   *
   * @param ctx The resource context.
   * @param chain The chain of resource hooks to call.
   * @returns A promise that processes the chain of hooks.
   */
  protected async processSpecificHooks(ctx: ResourceContext<T>, chain: ResourceHook<T>[]) {
    return chain.reduce((promise, hook) => {
      return promise.then(status => {
        if (status === ResourceStatus.STOP) {
          return ResourceStatus.STOP;
        }

        if (status === ResourceStatus.SKIP) {
          return ResourceStatus.CONTINUE;
        }

        return hook.mw(ctx);
      });
    }, Promise.resolve(ResourceStatus.CONTINUE));
  }

  /**
   * A helper function for processing the before/on/after hooks for a specific resource action
   * and milestone.
   *
   * @param ctx The resource context.
   * @param action The resource action.
   * @param milestone The resource milestone.
   * @param base The base resource middleware that will be used as the default resource milestone functionality.
   * @returns A promise that processes the request.
   */
  protected async processHooks(ctx: ResourceContext<T>, action: ResourceAction, milestone: ResourceMilestone,
                               base: ResourceMiddleware<T>): Promise<ResourceStatus> {
    let self = this;
    let beforeHooks = this.hooks.before;
    let onHooks = this.hook(this.hooks.on, action, milestone, base, defaultHookOptions);
    let afterHooks = this.hooks.after;
    let chain = [
      beforeHooks[action] && beforeHooks[action][milestone] ? beforeHooks[action][milestone] : [],
      onHooks[action] && onHooks[action][milestone] ? onHooks[action][milestone] : [],
      afterHooks[action] && afterHooks[action][milestone] ? afterHooks[action][milestone] : []
    ];

    return chain.reduce((promise, hooks) => {
      return promise.then(status => {
        if (status === ResourceStatus.STOP) {
          return ResourceStatus.STOP;
        }

        // We ignore skips across before/on/after sets of hooks.
        return self.processSpecificHooks(ctx, hooks);
      });
    }, Promise.resolve(ResourceStatus.CONTINUE));
  }

  /**
   * A helper function for processing the chain of milestone definitions for an action.
   * This will process a chain of milestone definitions provided
   * and pass them off to the relevant sub-process functions.
   *
   * @param ctx The resource context.
   * @param chain The resource milestone definitions.
   * @returns A promise that processes the request.
   */
  protected async process(ctx: ResourceContext<T>, chain: ResourceMilestoneDefinition<T>[]): Promise<ResourceStatus> {
    let self = this;

    try {
      return await chain.reduce((promise, current) => {
        let { action, milestone, mw } = current;

        return promise.then(status => {
          if (status === ResourceStatus.STOP) {
            return ResourceStatus.STOP;
          }

          // We ignore skips across milestones.
          return self.processHooks(ctx, action, milestone, mw);
        });
      }, Promise.resolve(ResourceStatus.CONTINUE));
    } catch (err) {
      let stack = err.stack;

      if (err instanceof squell.ValidationError) {
        err = ResourceError.coerce(err);
        err.stack = stack;
      } else if (!(err instanceof ResourceError)) {
        err = new ResourceError(500, err.message);
        err.stack = stack;
      }

      return this.handleError(ctx, err);
    }
  }

  /**
   * Handle sending the response for when there's an error during the processing of a resource request.
   * This can be overridden by a child-class to change how the errors are formatted and sent.
   *
   * @param ctx The resource context.
   * @param err THe resource error raised during the request.
   * @returns A promise handling the request.
   */
  protected async handleError(ctx: ResourceContext<T>, err: ResourceError): Promise<ResourceStatus> {
    ctx.body = {
      message: err.message,
      errors: err.errors || []
    };

    return ResourceStatus.STOP;
  }

  /**
   * Handle starting a resource request.
   *
   * @param ctx The resource context.
   * @param singleQuery Whether this is a fetch on a single resource. The query will been
   *                    automatically setup if true.
   * @returns A promise handling the request.
   */
  protected async handleStart(ctx: ResourceContext<T>, singleQuery = false): Promise<ResourceStatus> {
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

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle sending a resource request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleSend(ctx: ResourceContext<T>, singleQuery = false): Promise<ResourceStatus> {
    if (!ctx.resource.data) {
      throw new ResourceError(404, 'Not Found');
    }

    if ((<Partial<T>[]> ctx.resource.data).length) {
      ctx.body = ctx.resource.data;
    } else {
      ctx.body = ctx.resource.data;
    }

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle finishing a resource request.
   *
   * @param ctx The resource context.
   * @returns A promsie handling the request.
   */
  protected async handleFinish(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle starting a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListStart(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleStart(ctx);
  }

  /**
   * Handle fetching a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListFetch(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    ctx.resource.data = await ctx.resource.query.find();

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle sending a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListSend(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleSend(ctx);
  }

  /**
   * Handle finishing a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleListFinish(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleFinish(ctx);
  }

  /**
   * Handle a resource list request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleList(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      { action: ResourceAction.LIST, milestone: ResourceMilestone.START, mw: this.handleListStart.bind(this) },
      { action: ResourceAction.LIST, milestone: ResourceMilestone.FETCH, mw: this.handleListFetch.bind(this) },
      { action: ResourceAction.LIST, milestone: ResourceMilestone.SEND, mw: this.handleListSend.bind(this) },
      { action: ResourceAction.LIST, milestone: ResourceMilestone.FINISH, mw: this.handleListFinish.bind(this) }
    ]);
  }

  /**
   * Handle starting a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadStart(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleStart(ctx, true);
  }

  /**
   * Handle fetching a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadFetch(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    ctx.resource.data = await ctx.resource.query.findOne();

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle sending a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadSend(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleSend(ctx);
  }

  /**
   * Handle finishing a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleReadFinish(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleFinish(ctx);
  }

  /**
   * Handle a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleRead(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      { action: ResourceAction.READ, milestone: ResourceMilestone.START, mw: this.handleReadStart.bind(this) },
      { action: ResourceAction.READ, milestone: ResourceMilestone.FETCH, mw: this.handleReadFetch.bind(this) },
      { action: ResourceAction.READ, milestone: ResourceMilestone.SEND, mw: this.handleReadSend.bind(this) },
      { action: ResourceAction.READ, milestone: ResourceMilestone.FINISH, mw: this.handleReadFinish.bind(this) }
    ]);
  }

  /**
   * Handle starting a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateStart(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleStart(ctx);
  }

  /**
   * Handle writing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateWrite(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    ctx.resource.data = await ctx.resource.query.create(ctx.request.body as T);

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle sending a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateSend(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleSend(ctx);
  }

  /**
   * Handle finishing a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreateFinish(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleFinish(ctx);
  }

  /**
   * Handle a resource create request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleCreate(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      { action: ResourceAction.CREATE, milestone: ResourceMilestone.START, mw: this.handleCreateStart.bind(this) },
      { action: ResourceAction.CREATE, milestone: ResourceMilestone.WRITE, mw: this.handleCreateWrite.bind(this) },
      { action: ResourceAction.CREATE, milestone: ResourceMilestone.SEND, mw: this.handleCreateSend.bind(this) },
      { action: ResourceAction.CREATE, milestone: ResourceMilestone.FINISH, mw: this.handleCreateFinish.bind(this) }
    ]);
  }

  /**
   * Handle starting a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateStart(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleStart(ctx, true);
  }

  /**
   * Handle fetching a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateFetch(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    ctx.resource.data = await ctx.resource.query.findOne();

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle writing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateWrite(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    await ctx.resource.query.update(ctx.request.body as Partial<T>);

    // We reload. Kind of suboptimal but our only solution right now.
    ctx.resource.data = await ctx.resource.query.findOne();

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle sending a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateSend(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleSend(ctx);
  }

  /**
   * Handle finishing a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdateFinish(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleFinish(ctx);
  }

  /**
   * Handle a resource update request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleUpdate(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      { action: ResourceAction.UPDATE, milestone: ResourceMilestone.START, mw: this.handleUpdateStart.bind(this) },
      { action: ResourceAction.UPDATE, milestone: ResourceMilestone.FETCH, mw: this.handleUpdateFetch.bind(this) },
      { action: ResourceAction.UPDATE, milestone: ResourceMilestone.WRITE, mw: this.handleUpdateWrite.bind(this) },
      { action: ResourceAction.UPDATE, milestone: ResourceMilestone.SEND, mw: this.handleUpdateSend.bind(this) },
      { action: ResourceAction.UPDATE, milestone: ResourceMilestone.FINISH, mw: this.handleUpdateFinish.bind(this) }
    ]);
  }

  /**
   * Handle starting a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteStart(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleStart(ctx, true);
  }

  /**
   * Handle fetching a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteFetch(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    ctx.resource.data = await ctx.resource.query.findOne();

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle writing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteWrite(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    // Throw a 404 if we haven't fetched anything.
    // We can't successfully delete without finding something first.
    if (!ctx.resource.data) {
      throw new ResourceError(404, 'Not Found');
    }

    await ctx.resource.query.destroy();

    // Get rid of the resource data to indicate it was destroyed.
    ctx.resource.data = null;

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle sending a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteSend(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    // Send an empty body to indicate a successful delete.
    ctx.body = {};

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle finishing a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDeleteFinish(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.handleFinish(ctx);
  }

  /**
   * Handle a resource delete request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async handleDelete(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      { action: ResourceAction.DELETE, milestone: ResourceMilestone.START, mw: this.handleDeleteStart.bind(this) },
      { action: ResourceAction.DELETE, milestone: ResourceMilestone.FETCH, mw: this.handleDeleteFetch.bind(this) },
      { action: ResourceAction.DELETE, milestone: ResourceMilestone.WRITE, mw: this.handleDeleteWrite.bind(this) },
      { action: ResourceAction.DELETE, milestone: ResourceMilestone.SEND, mw: this.handleDeleteSend.bind(this) },
      { action: ResourceAction.DELETE, milestone: ResourceMilestone.FINISH, mw: this.handleDeleteFinish.bind(this) }
    ]);
  }
}
