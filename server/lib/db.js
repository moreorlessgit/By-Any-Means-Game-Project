// Prisma client singleton — one connection pool shared across all route handlers.
// Importing from this file anywhere in the server always returns the same instance.

const { PrismaClient } = require('@prisma/client');

const db = new PrismaClient();

module.exports = db;
