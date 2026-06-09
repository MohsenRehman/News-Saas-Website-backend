const config = require('../config/config');
const UsageStats = require('../models/UsageStats');
const ActivityLog = require('../models/ActivityLog');
const AppError = require('../utils/appError');
const httpStatus = require('../constants/httpStatus');
const logger = require('../config/logger');

/**
 * Resilient activity logger
 */
const logActivityResilient = async (clientId, userId, action, module, ipAddress) => {
  try {
    await ActivityLog.create({
      clientId,
      userId,
      action,
      module,
      ipAddress,
      timestamp: new Date()
    });
  } catch (err) {
    logger.error(`[ActivityLog Error] AI log write failed: ${err.message}`, err);
  }
};

/**
 * Increment tenant AI request counts (Phase 27 analytics integration)
 */
const incrementAiUsage = async (clientId) => {
  if (!clientId) return;
  try {
    await UsageStats.updateOne(
      { clientId },
      { $inc: { aiRequests: 1 } },
      { upsert: true }
    );
  } catch (err) {
    logger.error(`[UsageStats Error] AI usage count failed: ${err.message}`, err);
  }
};

/**
 * Checks if the API keys are placeholders to activate developer Mock Mode
 */
const isMockMode = (provider) => {
  if (provider === 'openrouter') {
    return !config.ai.openrouterKey || config.ai.openrouterKey.startsWith('placeholder');
  }
  if (provider === 'gemini') {
    return !config.ai.geminiKey || config.ai.geminiKey.startsWith('placeholder');
  }
  if (provider === 'openai') {
    return !config.ai.openaiKey || config.ai.openaiKey.startsWith('placeholder');
  }
  return true;
};

/**
 * Call OpenRouter API for text completion
 */
const callOpenRouter = async (prompt) => {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.ai.openrouterKey}`,
      'HTTP-Referer': 'http://localhost:5000',
      'X-Title': 'News CMS SaaS'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error status [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  if (data.choices && data.choices[0] && data.choices[0].message) {
    return data.choices[0].message.content.trim();
  }
  throw new Error('Invalid OpenRouter API completion response payload');
};

/**
 * Call OpenAI API for text completion
 */
const callOpenAI = async (prompt) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.ai.openaiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error status [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  if (data.choices && data.choices[0] && data.choices[0].message) {
    return data.choices[0].message.content.trim();
  }
  throw new Error('Invalid OpenAI API completion response payload');
};

/**
 * Call Gemini API for text completion
 */
const callGemini = async (prompt) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${config.ai.geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error status [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
    return data.candidates[0].content.parts[0].text.trim();
  }
  throw new Error('Invalid Gemini API content response payload');
};

/**
 * 1. Generate full article text from a title
 */
const generateArticleText = async (clientId, title, provider = 'openrouter', instructions = '') => {
  // Usage stats increment is handled by checkPlanLimit middleware at route layer

  if (isMockMode(provider)) {
    logger.info(`[AI Mock Mode] Generating article mock for: "${title}" (Provider: ${provider})`);
    return `<h2>${title}</h2>\n<p><strong>Peshawar Daily News:</strong> In a major development today, our local sources report significant movements regarding "<em>${title}</em>". Stakeholders and administrative boards met earlier this morning to review policies.</p>\n<p>Further developments are anticipated in the coming hours as official statements are released to the public. Local authorities have advised citizens to follow official updates.</p>`;
  }

  let prompt = `Write a comprehensive, professional news article with HTML paragraph tags based on this headline: "${title}". Make it detailed and structured.`;
  if (instructions) {
    prompt += ` Additional instructions and style guidelines to follow: "${instructions}".`;
  }
  if (provider === 'openrouter') return callOpenRouter(prompt);
  if (provider === 'openai') return callOpenAI(prompt);
  if (provider === 'gemini') return callGemini(prompt);

  throw new AppError(httpStatus.BAD_REQUEST, `Unsupported AI provider: ${provider}`);
};

/**
 * 2. Generate summary paragraph from article content
 */
const generateSummaryText = async (clientId, content, provider = 'openrouter') => {
  // Usage stats increment is handled by checkPlanLimit middleware at route layer

  if (isMockMode(provider)) {
    logger.info(`[AI Mock Mode] Generating summary mock (Provider: ${provider})`);
    return 'Summary of developments: Stakeholders met to address updates and coordinate statements.';
  }

  const prompt = `Provide a single-paragraph summary of the following news article:\n\n${content}`;
  if (provider === 'openrouter') return callOpenRouter(prompt);
  if (provider === 'openai') return callOpenAI(prompt);
  if (provider === 'gemini') return callGemini(prompt);

  throw new AppError(httpStatus.BAD_REQUEST, `Unsupported AI provider: ${provider}`);
};

/**
 * 3. Generate headlines list from article content
 */
const generateHeadlinesList = async (clientId, content, provider = 'openrouter') => {
  // Usage stats increment is handled by checkPlanLimit middleware at route layer

  if (isMockMode(provider)) {
    logger.info(`[AI Mock Mode] Generating headlines mock (Provider: ${provider})`);
    return [
      'Breaking: Peshawar Policy Developments',
      'Administrative Meeting Updates Stun Citizens',
      'New Regulatory Reforms Announced'
    ];
  }

  const prompt = `Based on the following article content, generate 3 click-worthy, alternative newspaper headlines. Output them as a raw comma-separated list or numbered list: \n\n${content}`;
  let text = '';
  if (provider === 'openrouter') text = await callOpenRouter(prompt);
  else if (provider === 'openai') text = await callOpenAI(prompt);
  else if (provider === 'gemini') text = await callGemini(prompt);
  else throw new AppError(httpStatus.BAD_REQUEST, `Unsupported AI provider: ${provider}`);

  // Split lines and clean
  return text
    .split('\n')
    .map(line => line.replace(/^\d+\.\s*/, '').trim())
    .filter(line => line.length > 0)
    .slice(0, 3);
};

/**
 * 4. Generate image URL based on a prompt
 */
const generateImageArt = async (clientId, prompt) => {
  // Usage stats increment is handled by checkPlanLimit middleware at route layer

  const openaiMock = !config.ai.openaiKey || config.ai.openaiKey.startsWith('placeholder');
  if (openaiMock) {
    logger.info(`[AI Mock Mode] Generating image mock for: "${prompt}"`);
    // Return high-quality unsplash news placeholder image
    return 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=600&auto=format&fit=crop';
  }

  // Live DALL-E 2/3 Image generation call
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.ai.openaiKey}`
    },
    body: JSON.stringify({
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url'
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DALL-E Image API error [${response.status}]: ${errText}`);
  }

  const data = await response.json();
  if (data.data && data.data[0] && data.data[0].url) {
    return data.data[0].url;
  }
  throw new Error('Invalid DALL-E API response payload');
};

/**
 * 5. Coordinated workflow pipeline with atomic try/catch fallbacks
 */
const runAiWorkflow = async (clientId, title, provider = 'openrouter', ipAddress, operatorId, instructions = '') => {
  const warnings = [];

  // A. Generate Article (Core step: fails entire request if this fails)
  let article = '';
  try {
    article = await generateArticleText(clientId, title, provider, instructions);
  } catch (err) {
    throw new AppError(httpStatus.BAD_REQUEST, `AI Article Generation failed: ${err.message}`);
  }

  // B. Generate Summary (Resilient: records warning on failure)
  let summary = '';
  try {
    summary = await generateSummaryText(clientId, article, provider);
  } catch (err) {
    summary = '';
    warnings.push(`summary_generation_failed: ${err.message}`);
  }

  // C. Generate Headlines (Resilient)
  let headlines = [];
  try {
    headlines = await generateHeadlinesList(clientId, article, provider);
  } catch (err) {
    headlines = [];
    warnings.push(`headlines_generation_failed: ${err.message}`);
  }

  // D. Generate Image (Resilient)
  let imageUrl = null;
  try {
    // Force fail flag for verification plan
    if (title.toLowerCase() === 'fail_image') {
      throw new Error('Forced image generation failure flag detected.');
    }
    imageUrl = await generateImageArt(clientId, `Editorial photo about: ${title}, high-quality news style`);
  } catch (err) {
    imageUrl = null;
    warnings.push(`image_generation_failed: ${err.message}`);
  }

  // Audit activity logs trigger
  logActivityResilient(clientId, operatorId, 'ai_generation', 'ai', ipAddress);

  return {
    article,
    summary,
    headlines,
    imageUrl,
    warnings
  };
};

module.exports = {
  generateArticleText,
  generateSummaryText,
  generateHeadlinesList,
  generateImageArt,
  runAiWorkflow
};
