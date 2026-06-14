/**

 * Telegram Bot API webhook — handles /start link tokens and /stop.

 */



const express = require('express');
const rateLimit = require('express-rate-limit');

const config = require('../../config');

const { asyncHandler } = require('../../middleware/errorHandler');

const { logger } = require('../../middleware/logger');

const {

  isConfigured,

  sendTelegramMessage,

  linkTelegramFromToken,

  stopTelegramForChatId,

} = require('../../modules/notificationChannels/telegramChannel');



const router = express.Router();

const telegramWebhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.NODE_ENV === 'production' ? 300 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many Telegram webhook requests. Please try again later.',
  },
});

/**

 * @param {string|undefined} text

 * @returns {string|null}

 */

function parseLinkTokenFromStart(text) {

  if (!text || !text.startsWith('/start')) {

    return null;

  }

  const parts = text.trim().split(/\s+/);

  if (parts.length < 2) {

    return null;

  }

  const payload = parts[1];

  if (!payload.startsWith('link_')) {

    return null;

  }

  return payload;

}



/**

 * @param {string|undefined} text

 * @returns {boolean}

 */

function isStopCommand(text) {

  if (!text) {

    return false;

  }

  const command = text.trim().split(/\s+/)[0];

  return command === '/stop' || command.startsWith('/stop@');

}



function validateWebhookSecret(req) {

  const secret = req.get('X-Telegram-Bot-Api-Secret-Token');

  if (!config.TELEGRAM_WEBHOOK_SECRET || secret !== config.TELEGRAM_WEBHOOK_SECRET) {

    return false;

  }

  return true;

}



/**

 * POST /api/webhooks/telegram

 * Body: Telegram Bot API Update object

 */

router.post('/', telegramWebhookLimiter, asyncHandler(async (req, res) => {

  if (!isConfigured()) {

    return res.status(503).json({ error: 'Telegram notifications are not enabled' });

  }



  if (!validateWebhookSecret(req)) {

    logger.warn('Telegram webhook rejected: invalid secret token', {

      ip: req.ip,

    });

    return res.status(403).json({ error: 'Forbidden' });

  }



  const update = req.body;

  const message = update?.message;

  if (!message?.chat?.id || typeof message.text !== 'string') {

    return res.status(200).json({ ok: true });

  }



  const db = req.app.locals.db;

  const chatId = message.chat.id;

  const username = message.from?.username || null;

  const text = message.text;



  try {

    if (isStopCommand(text)) {

      const result = await stopTelegramForChatId(db, chatId);

      await sendTelegramMessage(chatId, result.message);

      return res.status(200).json({ ok: true });

    }



    const token = parseLinkTokenFromStart(text);

    if (token) {

      const result = await linkTelegramFromToken(db, token, chatId, username);

      await sendTelegramMessage(chatId, result.message);

      return res.status(200).json({ ok: true, linked: result.ok });

    }



    if (text.startsWith('/start')) {

      await sendTelegramMessage(

        chatId,

        'Welcome to Colabora. Open notification settings in Colabora and tap "Connect Telegram" to get a link code, then send /start with that code here.'

      );

    }

  } catch (error) {

    logger.error('Telegram webhook handler failed', {

      chatId,

      error: error.message,

    });

  }



  return res.status(200).json({ ok: true });

}));



module.exports = router;


