const Client = require('../models/Client');
const cache = require('../utils/cache');

/**
 * Resolves the host domain to find the corresponding client.
 * Supports:
 * - Subdomain routing (e.g. peshawar.localhost, peshawar.saasnews.com)
 * - Custom domain routing (e.g. whatsgoingonpeshawar.com)
 * - Returns null for root platform domains (localhost, saasnews.com)
 * 
 * @param {String} host - The raw Host header (e.g. 'peshawar.localhost:5000')
 * @returns {Promise<Client|null>} Resolved Client model document or null if platform root
 */
const resolveDomain = async (host) => {
  if (!host) return null;

  // 1. Remove port mapping if present (e.g. 'peshawar.localhost:5000' -> 'peshawar.localhost')
  const cleanHost = host.split(':')[0].toLowerCase().trim();

  // 2. Return null if it is the platform landing page / master host
  //    Also bypass Vercel deployment URLs (backend + frontend preview URLs)
  if (
    cleanHost === 'localhost' ||
    cleanHost === '127.0.0.1' ||
    cleanHost === 'saasnews.com' ||
    cleanHost.endsWith('.vercel.app')
  ) {
    return null;
  }

  // 3. Cache lookup
  const cacheKey = `domain:${cleanHost}`;
  const cachedClient = await cache.get(cacheKey);
  if (cachedClient !== null) {
    return cachedClient;
  }

  const parts = cleanHost.split('.');
  let client = null;

  // 4. Handle local subdomains (e.g. 'peshawar.localhost' or 'peshawar.127.0.0.1')
  if (cleanHost.endsWith('.localhost') || cleanHost.endsWith('.127.0.0.1')) {
    const subdomain = parts[0];
    client = await Client.findOne({ subdomain, isDeleted: false });
  }
  // 5. Handle production subdomains (e.g. 'peshawar.saasnews.com')
  else if (cleanHost.endsWith('.saasnews.com')) {
    const subdomain = parts[0];
    client = await Client.findOne({ subdomain, isDeleted: false });
  }
  // 6. Otherwise, treat cleanHost as a registered custom domain (e.g. 'whatsgoingonpeshawar.com')
  else {
    client = await Client.findOne({ customDomain: cleanHost, isDeleted: false });
  }

  // Save resolved client (or null) to cache for 5 minutes
  await cache.set(cacheKey, client, 300);

  return client;
};

module.exports = {
  resolveDomain
};
