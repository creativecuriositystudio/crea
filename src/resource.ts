/**
 * Provides the REST resource-specific routing functionality of a Crea application.
 */

import * as squell from 'squell';
import * as _ from 'lodash';

import { Router, RouterContext, Middleware } from './router';

export interface ResourceFieldError {
  field: string;
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
 * A REST resource-specific implementation of Crea's router context.
 * This will be given to any middleware for a resource.
 */
export interface ResourceContext<T extends squell.Model> extends RouterContext {
  query: squell.Query<T>;
  data?: Partial<T> | Partial<T>[];
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
  priority: number;
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

let defaultBaseHookOptions: ResourceHookOptions = {
  priority: 0
};

let defaultUserHookOptions: ResourceHookOptions = {
  ... defaultBaseHookOptions,
  priority: 1
};

/**
 * A definition of a resource action's milestones,
 * with a default middleware for handling the action.
 */
export interface ResourceMilestoneDefinition<T extends squell.Model> {
  action: ResourceAction;
  milestone: ResourceMilestone;
  mw: ResourceMiddleware<T>;
}

/*
 * A REST resource implementation of a router.
 * This has a default implementation for a Squell model
 * and can be indirectly customised using options or
 * middleware hooks. These hooks can be run with a defined priority
 * to support overriding default functionality.
 *
 * This can be instantiated and its routes middleware used on the
 * relevant path for the resource.
 */
export class Resource<T extends squell.Model> extends Router {
  /**
   * All of the before hooks added to the resource.
   *
   * Note that these hooks have already been pre-sorted by priority
   * to minimise sorting functions done (i.e. they're only sorted
   * when added instead of every time routes is called).
   */
  protected beforeHooks: ResourceActionMilestones<T> = {};

  /**
   * All of the on hooks added to the resource.
   */
  protected onHooks: ResourceActionMilestones<T> = {};

  /**
   * All of the after hooks added to the resource.
   */
  protected afterHooks: ResourceActionMilestones<T> = {};

  protected db: squell.Database;

  protected model: typeof squell.Model & { new(): T };

  constructor(db: squell.Database, model: typeof squell.Model & { new(): T },
              beforeHooks?: ResourceActionMilestones<T>, onHooks?: ResourceActionMilestones<T>,
              afterHooks?: ResourceActionMilestones<T>) {
    super();

    this.db = db;
    this.model = model;
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
  private withUserHook(hooks: ResourceActionMilestones<T>,
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
    let beforeHooks = this.withUserHook(this.beforeHooks, action, milestone, mw, {
        ... defaultUserHookOptions,
        ... options
    });

    return new Resource(this.db, this.model, beforeHooks, this.onHooks, this.afterHooks);
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
     let onHooks = this.withUserHook(this.onHooks, action, milestone, mw, {
         ... defaultUserHookOptions,
         ... options
     });

     return new Resource(this.db, this.model, this.beforeHooks, onHooks, this.afterHooks);
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
    let afterHooks = this.withUserHook(this.afterHooks, action, milestone, mw, {
        ... defaultUserHookOptions,
        ... options
    });

    return new Resource(this.db, this.model, this.beforeHooks, this.onHooks, afterHooks);
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
    let beforeHooks = this.beforeHooks;
    let onHooks = this.withUserHook(this.onHooks, action, milestone, base, defaultBaseHookOptions);
    let afterHooks = this.afterHooks;
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
    let handler = chain.reduce((promise, current) => {
      let { action, milestone, mw } = current;

      return promise.then(status => {
        if (status === ResourceStatus.STOP) {
          return ResourceStatus.STOP;
        }

        // We ignore skips across milestones.
        return self.processHooks(ctx, action, milestone, mw);
      });
    }, Promise.resolve(ResourceStatus.CONTINUE));

    return handler
      .catch(err => {
        let finalErr = err;

        if (!(err instanceof ResourceError)) {
          finalErr = new ResourceError(500, err.message);
          finalErr.stack = err.stack;
        }

        return self.error(ctx, finalErr);
      });
  }

  /**
   * Handle sending the response for when there's an error during the processing of a resource request.
   * This can be overridden by a child-class to change how the errors are formatted and sent.
   *
   * @param ctx The resource context.
   * @param err THe resource error raised during the request.
   * @returns A promise handling the request.
   */
  protected async error(ctx: ResourceContext<T>, err: ResourceError): Promise<ResourceStatus> {
    return ResourceStatus.STOP;
  }

  /**
   * Handle starting a resource request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async start(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    ctx.query = this.db.query(this.model);

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle sending a resource request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async send(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    if (!ctx.data) {
      throw new ResourceError(404, 'Not Found');
    }

    if ((<Partial<T>[]>ctx.data).length) {
      ctx.body = [];
    } else {
      ctx.body = {};
    }

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle finishing a resource request.
   *
   * @param ctx The resource context.
   * @returns A promsie handling the request.
   */
  protected async finish(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle starting a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async readStart(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    let db = this.db;

    await this.start(ctx);

    // Kinda hacky, but we have to do this to make sure
    // we're fetching by whatever primary key they've defined.
    ctx.query = ctx.query.where(_ => db.getModelPrimary(this.model).eq(ctx.params.id));

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle fetching a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async readFetch(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    ctx.data = await ctx.query.findOne();

    return ResourceStatus.CONTINUE;
  }

  /**
   * Handle sending a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async readSend(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.send(ctx);
  }

  /**
   * Handle finishing a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async readFinish(ctx: ResourceContext<T>): Promise<ResourceStatus> {
    return this.finish(ctx);
  }

  /**
   * Handle a resource read request.
   *
   * @param ctx The resource context.
   * @returns A promise handling the request.
   */
  protected async read(ctx: ResourceContext<T>): Promise<any> {
    return this.process(ctx, [
      { action: ResourceAction.READ, milestone: ResourceMilestone.START, mw: this.readStart },
      { action: ResourceAction.READ, milestone: ResourceMilestone.FETCH, mw: this.readFetch },
      { action: ResourceAction.READ, milestone: ResourceMilestone.SEND, mw: this.readSend },
      { action: ResourceAction.READ, milestone: ResourceMilestone.FINISH, mw: this.readFinish }
    ]);
  }

  /**
   * Get the resource middleware. This can be used on a router
   * at a specific path to mount the resource, e.g.:
   *
   * ```
   * let resource = new Resource(db, User);
   *
   * router.use('/users', resource.routes());
   * ```
   *
   * By default the resource's routes are not scoped to a specific child route,
   * to enable the user of the resource to decide where to mount the resource routes.
   * This means if you do not add the routes by the use statement, the routes will incorrectly
   * come under the root path rather than a child path like `/users`.
   */
  routes(): Middleware {
    let router = new Router();

    router.get('/:id', this.read);

    // Use any routes that have been defined on the resource (which is also a router).
    router.use(this.routes());

    return router.routes();
  }
}
