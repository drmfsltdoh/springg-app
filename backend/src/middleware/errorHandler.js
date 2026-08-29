// Centralized error handling — every route can just `throw` or call
// next(err) and this formats a consistent response instead of leaking stack
// traces or crashing the process.
function errorHandler(err, req, res, next) {
  console.error(err);
  const statusCode = err.statusCode || 500;
  const body = { error: err.message || "Something went wrong" };
  if (err.code) body.code = err.code;
  res.status(statusCode).json(body);
}

// Wraps an async route handler so thrown errors/rejected promises reach
// errorHandler instead of crashing the process unhandled.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
