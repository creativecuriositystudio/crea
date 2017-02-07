import * as _ from 'lodash';
import { Resource, ResourceContext, ResourceStatus,
         ResourceAction, ResourceMilestone } from '../../../dist/index';

import President from '../models/president';
import db from '../db';

/**
 * The REST resource router for the president model.
 * This will automatically generate:
 *
 * * POST /presidents
 * * PUT /presidents/:id
 * * GET /presidents
 * * GET /presidents/:id
 * * DELETE /presidents/:id
 */
export default new Resource(db, President)
  .before(ResourceAction.LIST, ResourceMilestone.FETCH, async (ctx: ResourceContext<President>): Promise<ResourceStatus> => {
    // This middleware will hook and change how we send the list of presidents back.
    // We only return active presidents only if ?active= is set.
    if (ctx.query.active) {
      ctx.resource.query = ctx.resource.query.where(m => m.active.eq(true));
    }

    return ResourceStatus.CONTINUE;
  });
