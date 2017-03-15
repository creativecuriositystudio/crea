import { Database } from 'squell';

import { President } from './models/president';

export const db = new Database('sqlite://root:root@localhost/crea_simple_example', {
  storage: 'test.db'
});

db.define(President);
