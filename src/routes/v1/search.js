const express = require('express');
const validate = require('../../middleware/validate');
const searchValidator = require('../../validators/search.validator');
const searchController = require('../../controllers/search.controller');

const router = express.Router();

// Search routes (resolved under tenant context, exempt from JWT auth gates)
router.get('/', validate(searchValidator.globalSearch), searchController.globalSearch);
router.get('/suggestions', validate(searchValidator.searchSuggestions), searchController.searchSuggestions);

module.exports = router;
