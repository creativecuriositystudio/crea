# 0.8.3

* Added authentication to resource auth handling

# 0.8.2

* Use Bluebird promise for Acl

# 0.8.1

* Fixed resource milestone bug

# 0.8.0

* Added ability to specify public actions in the resource options

# 0.7.5

* Provide better error tracing when coercing an error

# 0.7.4

* Give an error message when throwing an `AuthorisationError` so it's clear what is going on

# 0.7.3

* Something...

# 0.7.2

* Something...

# 0.7.1

* Bump to fix broken build (missing index type map)

# 0.7.0

* Integrate ACL into `Auth` to allow for authorisation of routes and resources
* Introduce new `auth` resource milestone where authorisation is performed

# 0.6.1

* Simplify association includes, and set 'associateOnly' so assocs' data isn't saved when the parent is updated
* Upgrade squell and modelsafe

# 0.6.0

* Upgrade to squell & modelsafe `1.0.0-alpha`

# 0.5.0

* Upgrade to Squell & ModelSafe `0.7.0`
* Improve error stack generated when coercing to `ApplicationError` to include the old stack

# 0.4.3

* Fix delete route so it actually works

# 0.4.2

* Fix association option not being considered on list actions

# 0.4.1

* Fix multipart incorrectly skipping multiparts

# 0.4.0

* Bump Squell and ModelSafe dependencies for bug fixes
* Add multipart parsing option (using formidable)
* Change responder class methods to have the router context as `this`

# 0.3.2

* Fix token production not awaiting
* Fix usage of moment.js import

# 0.3.1

* Fix responder export

# 0.3.0

* Remove application context, modifying REST responses is now done through the `Responder` class
* Manual application error coercing has been converted to a handle based system,
  allowing users of the library to register their own handlers for their own error types
  that coerce to an application error

# 0.2.2

* Bump Squell required to 0.5.2 for association saving fix

# 0.2.1

* Broke out error coercion into `ApplicationError.coerce`

# 0.2.0

* Correct error handling, and have all error types correctly support the instanceof operator
* Move to Squell & ModelSafe 0.5
* Add `associations` flag for including all associations in a resource body

# 0.1.0

* Initial release
