const platformService = require('../services/platform.service');
const clientRepository = require('../repositories/client.repository');
const httpStatus = require('../constants/httpStatus');
const AppError = require('../utils/appError');

/**
 * Provision a new client website, subscription, and super admin
 */
const createWebsite = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const platformOwnerId = req.user.id;

    const client = await platformService.createWebsite(req.body, ipAddress, platformOwnerId);
    return res.success(client, 'Website and super admin successfully provisioned.', httpStatus.CREATED);
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve a paginated list of clients
 */
const getClients = async (req, res, next) => {
  try {
    const { page, limit, name, subdomain } = req.query;
    const filters = {};

    if (name) filters.name = { $regex: name, $options: 'i' };
    if (subdomain) filters.subdomain = subdomain;

    const data = await platformService.getClients(filters, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10
    });

    return res.success(data, 'Clients list retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve client details by ID
 */
const getClientById = async (req, res, next) => {
  try {
    const client = await clientRepository.findById(req.params.id);
    if (!client || client.isDeleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Client not found.');
    }
    return res.success(client, 'Client details retrieved successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Update Client details (names / custom domains)
 */
const updateClient = async (req, res, next) => {
  try {
    const client = await platformService.updateClient(req.params.id, req.body);
    return res.success(client, 'Client details updated successfully.');
  } catch (error) {
    next(error);
  }
};

/**
 * Update client active status (activate, deactivate, suspend)
 */
const updateClientStatus = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const platformOwnerId = req.user.id;
    const { status } = req.body;

    const client = await platformService.updateClientStatus(req.params.id, status, ipAddress, platformOwnerId);
    return res.success(client, `Client status updated to: ${status}`);
  } catch (error) {
    next(error);
  }
};

/**
 * Soft delete a client and cascade deletions
 */
const deleteClient = async (req, res, next) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const platformOwnerId = req.user.id;

    await platformService.deleteClient(req.params.id, ipAddress, platformOwnerId);
    return res.success(null, 'Client website and associated data successfully soft-deleted.');
  } catch (error) {
    next(error);
  }
};

/**
 * Fetch platform owner statistics dashboard
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const stats = await platformService.getDashboardStats();
    return res.success(stats, 'Platform dashboard statistics retrieved.');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createWebsite,
  getClients,
  getClientById,
  updateClient,
  updateClientStatus,
  deleteClient,
  getDashboardStats
};
