import * as crea from '../../dist/index';

import db from './db';
import mocks from './mocks';
import presidentResource from './resources/president';

let port = process.env.PORT || 9000;
let app = new crea.Application();
let router = new crea.Router();

router.use('/presidents', presidentResource.routes());
app.use(router.routes());

// The database has to be synced before we can use Squell.
db
  .sync({ force: true })
  .then(async (): Promise<void> => {
    await mocks(db);

    app.listen(port);
    console.log('Crea running on port: %d', port);
  });
