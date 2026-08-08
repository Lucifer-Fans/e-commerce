const { param, query } = require('express-validator');

const objectId = (name, location = param) =>
  location(name).isMongoId().withMessage(`${name} must be a valid id`);

const pagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be 1 or greater').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100').toInt(),
];

module.exports = { objectId, pagination };
