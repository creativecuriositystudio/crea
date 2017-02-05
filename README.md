# Crea

# Introduction

Crea is a full-stack Node.js web framework written in [TypeScript](http://typescript.org/). It is specifically
designed for developing the backend REST APIs of web applications.

Rather than reinvent the wheel, Crea provides a solid foundation that simplifies and integrates existing libraries
commonly used in Node.js development. Crea integrates the [Koa](http://koajs.com/) web framework and
[Squell](https://github.com/creativecuriositystudio/squell), a type-safe wrapper for the [Sequelize](http://docs.sequelizejs.com/en/latest/)
SQL ORM, to provide a completely promise-driven API that supports the async/await paradigm.

Crea extends Koa 2.x with additional functionality, but Koa's core functionality remains the same.
This means you can use any official or third-party Koa middleware with Crea. By default, Crea applications
have the following Koa middleware enabled:

* [koa-bodyparser 3.x](https://github.com/koajs/bodyparser)
* [koa-router 7.x](https://github.com/koajs/bodyparser)

# Installation

```
npm install --save crea
```

# Documentation

To view Crea's documentation, clone this repository and run:

```
npm run docs
```

This will generate HTML documentation into `docs`.
