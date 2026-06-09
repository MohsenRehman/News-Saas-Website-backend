const News = require('../models/News');
const Category = require('../models/Category');
const Media = require('../models/Media');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const config = require('../config/config');
const logger = require('../config/logger');

/**
 * Helper to generate mock text highlights for native search fallbacks.
 * Extracts a substring around the matching query term and wraps it in <mark> tags.
 */
const generateNativeHighlight = (text, query) => {
  if (!text || !query) return '';
  
  const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  
  if (index === -1) {
    // Return standard snippet from start if query match is not found directly
    return text.length > 150 ? text.substring(0, 150) + '...' : text;
  }

  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + query.length + 60);
  let snippet = text.substring(start, end);
  
  snippet = snippet.replace(regex, '<mark>$1</mark>');
  
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  
  return snippet;
};

/**
 * Format Atlas search highlighting array to a flat object string format.
 */
const formatAtlasHighlights = (atlasHighlights) => {
  const formatted = { title: '', content: '' };
  if (!atlasHighlights) return formatted;

  for (const h of atlasHighlights) {
    const pathName = h.path;
    if (pathName !== 'title' && pathName !== 'content') continue;

    let textStr = '';
    for (const part of h.texts) {
      if (part.type === 'hit') {
        textStr += `<mark>${part.value}</mark>`;
      } else {
        textStr += part.value;
      }
    }
    formatted[pathName] = textStr;
  }
  return formatted;
};

/**
 * Perform a global search on published articles for a tenant client
 */
const searchArticles = async (clientId, filters = {}, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  // 1. Core query filters (enforce status: 'published' in all searches)
  const queryFilters = {
    clientId,
    status: 'published',
    publishDate: { $lte: new Date() },
    isDeleted: { $ne: true }
  };

  // Safe date range merging to prevent future publication leak
  if (filters.startDate) {
    queryFilters.publishDate.$gte = new Date(filters.startDate);
  }

  if (filters.endDate) {
    const endThreshold = new Date(filters.endDate);
    queryFilters.publishDate.$lte = endThreshold > new Date() ? new Date() : endThreshold;
  }

  // Category slug filter
  if (filters.category) {
    const cat = await Category.findOne({ clientId, slug: filters.category, isDeleted: { $ne: true } });
    if (!cat) {
      return { results: [], total: 0, page, limit };
    }
    queryFilters.category = cat._id;
  }

  // Tag filter
  if (filters.tag) {
    queryFilters.tags = filters.tag;
  }

  // 2. Atlas Search implementation (runs if search provider is set to atlas and search term exists)
  if (config.searchProvider === 'atlas' && filters.q) {
    try {
      // Build search configuration pipeline
      const searchStage = {
        $search: {
          index: process.env.ATLAS_SEARCH_INDEX || 'default', // Expected Atlas Search index name
          compound: {
            should: [
              {
                text: {
                  query: filters.q,
                  path: 'title',
                  fuzzy: { maxEdits: 1, prefixLength: 0 },
                  score: { boost: { value: 5 } }
                }
              },
              {
                text: {
                  query: filters.q,
                  path: 'tags',
                  fuzzy: { maxEdits: 1, prefixLength: 0 },
                  score: { boost: { value: 2 } }
                }
              },
              {
                text: {
                  query: filters.q,
                  path: 'content',
                  fuzzy: { maxEdits: 1, prefixLength: 0 },
                  score: { boost: { value: 1 } }
                }
              }
            ],
            filter: [
              {
                equals: {
                  path: 'clientId',
                  value: clientId
                }
              },
              {
                equals: {
                  path: 'status',
                  value: 'published'
                }
              }
            ]
          },
          highlight: {
            path: ['title', 'content']
          }
        }
      };

      const aggregatePipeline = [
        searchStage,
        // Match additional metadata (categories, soft deletes, dates)
        { $match: { isDeleted: { $ne: true }, publishDate: queryFilters.publishDate } }
      ];

      // If category filter is applied
      if (queryFilters.category) {
        aggregatePipeline.push({ $match: { category: queryFilters.category } });
      }

      // If tag filter is applied
      if (queryFilters.tags) {
        aggregatePipeline.push({ $match: { tags: queryFilters.tags } });
      }

      // Add scores project
      aggregatePipeline.push({
        $project: {
          title: 1,
          slug: 1,
          shortDescription: 1,
          content: 1,
          category: 1,
          author: 1,
          featuredImage: 1,
          tags: 1,
          publishDate: 1,
          status: 1,
          isDeleted: 1,
          score: { $meta: 'searchScore' },
          highlights: { $meta: 'searchHighlights' }
        }
      });

      // Calculate total count (requires a separate count or aggregate facet)
      // For performance on large databases, we can use facet pagination
      aggregatePipeline.push({
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [
            { $skip: skip },
            { $limit: limit }
          ]
        }
      });

      const [aggregateResult] = await News.aggregate(aggregatePipeline).exec();
      const total = aggregateResult?.metadata?.[0]?.total || 0;
      const rawResults = aggregateResult?.data || [];

      // Populate categories, authors and featured images manually on aggregate array
      const results = await News.populate(rawResults, [
        { path: 'category', select: 'name slug' },
        { path: 'author', select: 'name email' },
        { path: 'featuredImage', select: 'url' }
      ]);

      const formattedResults = results.map(r => {
        const flatHighlights = formatAtlasHighlights(r.highlights);
        return {
          ...r,
          score: r.score,
          highlights: flatHighlights
        };
      });

      return { results: formattedResults, total, page, limit };
    } catch (err) {
      logger.warn(`[SearchService] Atlas search stage failed or index is missing: ${err.message}. Falling back to native DB text search.`);
      // Let it fall through to native text index search
    }
  }

  // 3. Native search implementation (Compound index search + regex highlight stub)
  if (filters.q) {
    // Use compound text index query matching clientId + q
    queryFilters.$text = { $search: filters.q };
  }

  const total = await News.countDocuments(queryFilters);
  let dbQuery = News.find(queryFilters);

  if (filters.q) {
    // Project and sort by relevance text score
    dbQuery = dbQuery
      .select({ score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } });
  } else {
    // Default: sort by newest publication date
    dbQuery = dbQuery.sort({ publishDate: -1, createdAt: -1 });
  }

  const rawResults = await dbQuery
    .populate('category', 'name slug')
    .populate('author', 'name email')
    .populate('featuredImage', 'url')
    .skip(skip)
    .limit(limit)
    .exec();

  const formattedResults = rawResults.map(r => {
    const rObj = r.toObject();
    let highlights = { title: '', content: '' };
    
    if (filters.q) {
      highlights = {
        title: generateNativeHighlight(rObj.title, filters.q),
        content: generateNativeHighlight(rObj.content, filters.q)
      };
    }
    
    return {
      ...rObj,
      score: filters.q ? (rObj.score || 1) : null,
      highlights
    };
  });

  return { results: formattedResults, total, page, limit };
};

/**
 * Retrieve autocomplete typeahead search suggestions
 */
const getSearchSuggestions = async (clientId, query) => {
  if (!query) return [];

  // Enforce status: 'published' in suggestions search as well
  const queryFilters = {
    clientId,
    status: 'published',
    publishDate: { $lte: new Date() },
    isDeleted: { $ne: true },
    title: { $regex: query, $options: 'i' }
  };

  // Restrict fields and return top 5 items only
  return News.find(queryFilters)
    .select('title slug')
    .limit(5)
    .exec();
};

module.exports = {
  searchArticles,
  getSearchSuggestions
};
