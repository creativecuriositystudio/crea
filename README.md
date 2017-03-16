# Restla

## Introduction

Restla is a full-stack Node.js web framework written in [TypeScript](http://typescript.org/). It is specifically
designed for developing the backend REST APIs of web applications.

Rather than reinvent the wheel, Restla provides a solid foundation that simplifies and integrates existing libraries
commonly used in Node.js development. Restla integrates the [Koa](http://koajs.com/) web framework and
[Squell](https://github.com/creativecuriositystudio/squell), a type-safe wrapper for the [Sequelize](http://docs.sequelizejs.com/en/latest/)
SQL ORM, to provide a completely promise-driven API that supports the async/await paradigm.

Restla extends Koa 2.x with additional functionality, but Koa's core functionality remains the same.
This means you can use any official or third-party Koa middleware with Restla. By default, Restla applications
have the following Koa middleware enabled:

* [koa-bodyparser 3.x](https://github.com/koajs/bodyparser)
* [koa-router 7.x](https://github.com/koajs/bodyparser)

## Features

* All Koa middleware works out of the box with Restla applications.
* `Resource`, a router that can generate generic REST resource routes from a Squell model.
  The default functionality can easily be change by extending the `Resource` class.
* `Auth`, an authentication helper that is backend agnostic (i.e. you could authenticate
  with a third-party authentication.

## Installation

```
npm install --save restla
```

## Documentation

The API documentation generated using [TypeDoc](https://github.com/TypeStrong/typedoc)
is [available online](http://creativecuriosity.github.io/crea).

To generate API documentation from the code into the `docs` directory, run:

```sh
npm run docs
```

## Testing

First install the library dependencies and the SQLite3 library:

```
npm install
npm install sqlite3
```

To execute the test suite using SQLite as the backend, run:

```
npm run test
```
