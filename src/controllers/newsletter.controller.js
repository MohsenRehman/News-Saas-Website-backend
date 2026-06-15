const newsletterService = require('../services/newsletter.service');

/**
 * Public endpoint to subscribe to newsletter
 */
const subscribe = async (req, res, next) => {
  try {
    const subscriber = await newsletterService.subscribe(req.clientId, req.body);
    return res.success(subscriber, 'Successfully subscribed to the newsletter.', 201);
  } catch (err) {
    return next(err);
  }
};

/**
 * Public endpoint to unsubscribe via secure token (renders clean HTML confirmation card)
 */
const unsubscribe = async (req, res, next) => {
  try {
    const { token } = req.query;
    const subscriber = await newsletterService.unsubscribe(token);

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unsubscribed Successfully</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f4f6f9 0%, #e9ecef 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: #ffffff;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
            text-align: center;
            max-width: 420px;
            width: 90%;
            border-top: 5px solid #ef4444;
          }
          h1 {
            color: #1a1a2e;
            font-size: 24px;
            margin: 16px 0 12px;
            font-weight: 700;
          }
          p {
            color: #6c757d;
            font-size: 15px;
            line-height: 1.6;
            margin: 0 0 24px;
          }
          .badge {
            display: inline-block;
            background: #ffebeb;
            color: #ef4444;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .icon {
            font-size: 48px;
            margin-bottom: 8px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">🔕</div>
          <div class="badge">Unsubscribed</div>
          <h1>Unsubscribed</h1>
          <p>The email address <strong>${subscriber.email}</strong> has been successfully unsubscribed. You will no longer receive newsletter campaigns from our publication.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    return next(err);
  }
};

/**
 * Admin: Get subscribers list
 */
const getSubscribers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const { status } = req.query;

    const data = await newsletterService.getSubscribers(req.clientId, { status }, { page, limit });
    return res.success(data, 'Subscribers list retrieved.');
  } catch (err) {
    return next(err);
  }
};

/**
 * Admin: Unsubscribe/Delete subscriber record
 */
const removeSubscriber = async (req, res, next) => {
  try {
    const { subscriberId } = req.params;
    const operatorUserId = req.user.id || req.user._id;

    await newsletterService.removeSubscriber(req.clientId, subscriberId, operatorUserId);
    return res.success(null, 'Subscriber successfully removed.');
  } catch (err) {
    return next(err);
  }
};

/**
 * Admin: Create campaign draft
 */
const createCampaign = async (req, res, next) => {
  try {
    const operatorUserId = req.user.id || req.user._id;
    const campaign = await newsletterService.createCampaign(req.clientId, req.body, operatorUserId);
    return res.success(campaign, 'Campaign draft created successfully.', 201);
  } catch (err) {
    return next(err);
  }
};

/**
 * Admin: Get campaigns list
 */
const getCampaigns = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const data = await newsletterService.getCampaigns(req.clientId, { page, limit });
    return res.success(data, 'Campaigns list retrieved.');
  } catch (err) {
    return next(err);
  }
};

/**
 * Admin: Dispatch campaign (trigger bulk sending)
 */
const sendCampaign = async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const operatorUserId = req.user.id || req.user._id;

    const result = await newsletterService.sendCampaign(req.clientId, campaignId, operatorUserId);
    return res.success(result, 'Campaign sending initiated.');
  } catch (err) {
    return next(err);
  }
};

/**
 * Admin: Update campaign draft
 */
const updateCampaign = async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const operatorUserId = req.user.id || req.user._id;

    const campaign = await newsletterService.updateCampaign(req.clientId, campaignId, req.body, operatorUserId);
    return res.success(campaign, 'Campaign draft updated successfully.');
  } catch (err) {
    return next(err);
  }
};

/**
 * Admin: Delete campaign
 */
const deleteCampaign = async (req, res, next) => {
  try {
    const { campaignId } = req.params;

    const result = await newsletterService.deleteCampaign(req.clientId, campaignId);
    return res.success(result, 'Campaign deleted successfully.');
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  subscribe,
  unsubscribe,
  getSubscribers,
  removeSubscriber,
  createCampaign,
  getCampaigns,
  sendCampaign,
  updateCampaign,
  deleteCampaign
};
