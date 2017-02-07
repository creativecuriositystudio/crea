import * as _ from 'lodash';
import { Resource } from '../../../dist/index';

import User from '../models/user';
import db from '../db';

/**
 * The REST resource router for the user model.
 * This will automatically generate:
 *
 * * POST /users
 * * PUT /users/:id
 * * GET /users
 * * GET /users/:id
 * * DELETE /users/:id
 */
export default new Resource(db, User);
