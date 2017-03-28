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
