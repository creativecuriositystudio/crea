import { Database } from 'squell';
import User from './models/user';

let db = new Database('sqlite://root:root@localhost/crea_auth_example', {
  storage: 'test.db'
});

db.define(User);

export default db;
