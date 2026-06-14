const { COLORS, TYPOGRAPHY, LAYOUT } = require('./tokens');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function headerColorForVariant(variant, branding) {
  if (variant === 'deadline') return COLORS.deadline;
  if (variant === 'voting') return COLORS.voting;
  if (variant === 'danger') return COLORS.danger;
  return branding?.primaryColor || COLORS.primary;
}

/**
 * Bulletproof button (table-based for Outlook).
 */
function bulletproofButton({ href, label, color }) {
  const bg = color || COLORS.primary;
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 24px auto;">
      <tr>
        <td style="border-radius: ${LAYOUT.buttonRadius}px; background: ${bg};">
          <a href="${escapeHtml(href)}" target="_blank"
             style="display: inline-block; min-height: ${LAYOUT.buttonMinHeight}px; line-height: ${LAYOUT.buttonMinHeight}px; padding: 0 28px; font-family: ${TYPOGRAPHY.fontFamily}; font-size: ${TYPOGRAPHY.bodySize}; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: ${LAYOUT.buttonRadius}px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

function callout({ variant, html }) {
  const styles = {
    deadline: { bg: COLORS.deadlineBg, border: COLORS.deadline, text: COLORS.deadlineText },
    voting: { bg: COLORS.votingBg, border: COLORS.voting, text: COLORS.votingText },
    danger: { bg: COLORS.dangerBg, border: COLORS.danger, text: COLORS.dangerText },
    info: { bg: '#e0e7ff', border: COLORS.primary, text: '#4338ca' },
    warning: { bg: COLORS.deadlineBg, border: COLORS.deadline, text: COLORS.deadlineText },
  };
  const s = styles[variant] || styles.info;
  return `
    <div style="background: ${s.bg}; border-left: 4px solid ${s.border}; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; font-size: ${TYPOGRAPHY.smallSize}; color: ${s.text}; font-family: ${TYPOGRAPHY.fontFamily};">
        ${html}
      </p>
    </div>`;
}

function digestItem({ title, meta, link, linkLabel, linkColor }) {
  const color = linkColor || COLORS.link;
  return `
    <div style="background: #f5f5f5; padding: 12px; margin: 8px 0; border-radius: 4px;">
      <p style="margin: 0; font-weight: 600; font-family: ${TYPOGRAPHY.fontFamily};">
        <a href="${escapeHtml(link)}" style="color: ${COLORS.text}; text-decoration: none;">${escapeHtml(title)}</a>
      </p>
      ${meta ? `<p style="margin: 5px 0 0 0; font-size: ${TYPOGRAPHY.smallSize}; color: ${COLORS.textMuted}; font-family: ${TYPOGRAPHY.fontFamily};">${meta}</p>` : ''}
      ${link && linkLabel ? `<p style="margin: 8px 0 0 0; font-family: ${TYPOGRAPHY.fontFamily};"><a href="${escapeHtml(link)}" style="color: ${color}; font-weight: 600;">${escapeHtml(linkLabel)}</a></p>` : ''}
    </div>`;
}

function digestSection({ title, count, itemsHtml, overflowHtml }) {
  if (!itemsHtml) return '';
  return `
    <div style="margin: 20px 0;">
      <h2 style="color: ${COLORS.link}; font-size: ${TYPOGRAPHY.sectionHeadingSize}; margin-bottom: 10px; font-family: ${TYPOGRAPHY.fontFamily};">${escapeHtml(title)} (${count})</h2>
      ${itemsHtml}
      ${overflowHtml || ''}
    </div>`;
}

module.exports = {
  escapeHtml,
  headerColorForVariant,
  bulletproofButton,
  callout,
  digestItem,
  digestSection,
};
