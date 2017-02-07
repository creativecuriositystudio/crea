import { Database } from 'squell';

import User from './models/user';

export default function(db: Database) {
  let user = new User();

  user.username = 'admin';
  user.password = 'abc123';

  return db.query(User)
    .create(user);
}
