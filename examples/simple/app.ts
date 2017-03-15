import * as crea from '../../dist/index';

import { db } from './db';
import { mockPresidents }from './mocks';
import { presidentsResource } from './resources/president';

let port = process.env.PORT || 9000;
let app = new crea.Application();
let router = new crea.Router();

router.use('/presidents', presidentsResource.routes());
app.use(router.routes());

// The database has to be synced before we can use Squell.
db
  .sync({ force: true })
  .then(async (): Promise<void> => {
    await mockPresidents(db);

    app.listen(port);
    console.log('Crea running on port: %d', port);
  });
