import { Database } from 'squell';

import { President } from './models/president';

export function mockPresidents(db: Database) {
  let obama = new President();
  let trump = new President();

  trump.givenNames = 'Donald';
  trump.lastName = 'Trump';
  trump.electedAt = new Date('Tue Nov 08 2016 00:00:00');
  trump.inauguratedAt = new Date('Fri Jan 20 2017 09:00:00');
  trump.active = true;

  obama.givenNames = 'Barrack';
  obama.lastName = 'Obama';
  obama.electedAt = new Date('Tue Nov 04 2008 00:00:00');
  obama.inauguratedAt = new Date('Tue Jan 20 2009 00:00:00');
  obama.active = false;

  return db.query(President).bulkCreate([trump, obama]);
}
