import * as crea from '../../dist/index';

import Auth from './auth';
import db from './db';
import mocks from './mocks';
import userResource from './resources/user';

let port = process.env.PORT || 9000;
let app = new crea.Application();
let router = new crea.Router();
let auth = new Auth(db, 'some secret');

router.post('/login', auth.login());
router.post('/register', auth.register());

// We use the auth.init() middleware after /login and /register,
// otherwise these would be checked for a user login (even
// when the user is trying to login).
router.use(auth.init());
router.use('/users', userResource.routes());

app.use(router.routes());

// The database must be synced before we can use Squell.
db
  .sync({ force: true })
  .then(async (): Promise<void> => {
    await mocks(db);

    app.listen(port);
    console.log('Crea running on port: %d', port);
  });
