/**
 * Telegram MarkdownV2 formatting helpers for notification delivery (Agent 4).
 * @see https://core.telegram.org/bots/api#markdownv2-style
 */

const MARKDOWN_V2_ESCAPE_PATTERN = /([_*[\]()~`>#+\-=|{}.!\\])/g;

/**
 * Escape plain text for Telegram MarkdownV2 parse mode.
 * @param {unknown} text
 * @returns {string}
 */
function escapeMarkdownV2(text) {
  if (text == null) return '';
  return String(text).replace(MARKDOWN_V2_ESCAPE_PATTERN, '\\$1');
}

/**
 * Escape URL text inside MarkdownV2 link targets `(url)`.
 * @param {unknown} url
 * @returns {string}
 */
function escapeMarkdownV2Url(url) {
  if (url == null) return '';
  return String(url).replace(/[)\\]/g, '\\$&');
}

/**
 * Build a MarkdownV2 inline link `[label](url)`.
 * @param {unknown} label
 * @param {unknown} url
 * @returns {string}
 */
function markdownV2Link(label, url) {
  return `[${escapeMarkdownV2(label)}](${escapeMarkdownV2Url(url)})`;
}

module.exports = {
  escapeMarkdownV2,
  escapeMarkdownV2Url,
  markdownV2Link,
};
