const searchService = require('../services/search.service');
const httpStatus = require('../constants/httpStatus');

/**
 * Handle global search request
 */
const globalSearch = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { q, page, limit, category, tag, startDate, endDate, sortBy } = req.query;

    const data = await searchService.searchArticles(
      clientId,
      { q, category, tag, startDate, endDate, sortBy },
      {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 10
      }
    );

    return res.success(data, 'Search results retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Handle typeahead autocomplete search suggestions request
 */
const searchSuggestions = async (req, res, next) => {
  try {
    const clientId = req.clientId;
    const { q } = req.query;

    const suggestions = await searchService.getSearchSuggestions(clientId, q);
    return res.success(suggestions, 'Search suggestions retrieved.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  globalSearch,
  searchSuggestions
};
