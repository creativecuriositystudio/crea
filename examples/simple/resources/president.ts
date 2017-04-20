import { Resource } from '../../../dist/index';

import { President } from '../models/president';
import { db } from '../db';

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
export const presidentsResource = new Resource(db, President, { associations: true });
