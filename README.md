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

## Usage

### Error Handling

By default Restla catches all error during requests, coerces them
into `ApplicationError`s if they're not already an application error
and then sends them to the client with a response similar to:

```json
{
  "message": "Some error message",
  "errors": []
}
```

Restla automatically coerces ModelSafe validation errors into a 400 response
and any authentication errors into 402 responses. Any other unknown errors
are then turned into 500 errors. The validation error response (400 bad request)
looks similar to the above but is populated with error messages for each field:

```json
{
  "message": "Validation failed",
  "errors": [{
    "path": "name",
    "message": "Is required"
  }]
}
```

If you hit any errors you should reject (or throw if you're using the async keyword) with an an `ApplicationError`
in your route or resource. It takes a status code and error message like so:

```typescript
throw new ApplicationError(404, 'Not Found');
```

Restla will automatically catch any rejected errors and send them using the `ApplicationContext`'s error method.
You can provide your own error response handling method by passing in a custom `ApplicationContext` when instantiating
a Restla application.

## Documentation

The API documentation generated using [TypeDoc](https://github.com/TypeStrong/typedoc)
is [available online](http://creativecuriosity.github.io/restla).

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
