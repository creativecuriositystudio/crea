import * as crea from '../../dist/index';

let app = new crea.Application();
let router = new crea.Router();

app.use(router.routes());
app.listen(9000);
