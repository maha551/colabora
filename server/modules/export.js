const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const { logger } = require('../middleware/logger');

/**
 * Export document to PDF
 * @param {Object} document - Document object with title, description, status, createdAt
 * @param {Array} paragraphs - Array of paragraph objects with text, headingLevel, order
 * @returns {Promise<Buffer>} PDF buffer
 */
async function exportToPDF(document, paragraphs) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Add title
      doc.fontSize(20)
        .font('Helvetica-Bold')
        .text(document.title || 'Untitled Document', { align: 'center' });
      doc.moveDown(1.5);

      // Add description if exists
      if (document.description) {
        doc.fontSize(12)
          .font('Helvetica')
          .text(document.description, { align: 'left' });
        doc.moveDown(1);
      }

      // Add metadata
      doc.fontSize(10)
        .fillColor('gray')
        .text(`Created: ${new Date(document.createdAt || document.created_at).toLocaleDateString()}`);
      if (document.status) {
        doc.text(`Status: ${document.status}`);
      }
      doc.moveDown(1.5);
      doc.fillColor('black');

      // Add separator line
      doc.moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke();
      doc.moveDown(1);

      // Sort paragraphs by order
      const sortedParagraphs = [...paragraphs].sort((a, b) => {
        const orderA = a.order !== undefined ? a.order : (a.order_index || 0);
        const orderB = b.order !== undefined ? b.order : (b.order_index || 0);
        return orderA - orderB;
      });

      // Add paragraphs
      sortedParagraphs.forEach(para => {
        const text = para.text || '';
        const headingLevel = para.headingLevel || para.heading_level;

        if (headingLevel) {
          // Heading
          const size = headingLevel === 'h1' ? 18 : headingLevel === 'h2' ? 16 : 14;
          doc.fontSize(size)
            .font('Helvetica-Bold')
            .text(text, { align: 'left' });
        } else {
          // Regular paragraph
          doc.fontSize(12)
            .font('Helvetica')
            .text(text, { align: 'left' });
        }
        doc.moveDown(0.8);
      });

      doc.end();
    } catch (error) {
      logger.error('PDF export error', { error: error.message, stack: error.stack });
      reject(error);
    }
  });
}

/**
 * Export document to Markdown
 * @param {Object} document - Document object
 * @param {Array} paragraphs - Array of paragraph objects
 * @returns {string} Markdown string
 */
function exportToMarkdown(document, paragraphs) {
  let md = `# ${document.title || 'Untitled Document'}\n\n`;

  if (document.description) {
    md += `${document.description}\n\n`;
  }

  md += `**Created:** ${new Date(document.createdAt || document.created_at).toLocaleDateString()}\n`;
  if (document.status) {
    md += `**Status:** ${document.status}\n`;
  }
  md += `\n---\n\n`;

  // Sort paragraphs by order
  const sortedParagraphs = [...paragraphs].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : (a.order_index || 0);
    const orderB = b.order !== undefined ? b.order : (b.order_index || 0);
    return orderA - orderB;
  });

  sortedParagraphs.forEach(para => {
    const text = para.text || '';
    const headingLevel = para.headingLevel || para.heading_level;

    if (headingLevel) {
      const level = headingLevel === 'h1' ? 1 : headingLevel === 'h2' ? 2 : 3;
      md += `${'#'.repeat(level)} ${text}\n\n`;
    } else {
      md += `${text}\n\n`;
    }
  });

  return md;
}

/**
 * Export document to Word (.docx)
 * @param {Object} document - Document object
 * @param {Array} paragraphs - Array of paragraph objects
 * @returns {Promise<Buffer>} DOCX buffer
 */
async function exportToWord(document, paragraphs) {
  try {
    const docParagraphs = [];

    // Title
    docParagraphs.push(
      new Paragraph({
        text: document.title || 'Untitled Document',
        heading: HeadingLevel.HEADING_1
      })
    );

    // Description
    if (document.description) {
      docParagraphs.push(new Paragraph(document.description));
    }

    // Metadata
    const metadataText = [
      new TextRun({ text: 'Created: ', bold: true }),
      new TextRun(new Date(document.createdAt || document.created_at).toLocaleDateString())
    ];
    if (document.status) {
      metadataText.push(
        new TextRun({ text: '\nStatus: ', bold: true }),
        new TextRun(document.status)
      );
    }
    docParagraphs.push(new Paragraph({ children: metadataText }));

    // Separator
    docParagraphs.push(new Paragraph({ text: '---' }));

    // Sort paragraphs by order
    const sortedParagraphs = [...paragraphs].sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : (a.order_index || 0);
      const orderB = b.order !== undefined ? b.order : (b.order_index || 0);
      return orderA - orderB;
    });

    // Paragraphs
    sortedParagraphs.forEach(para => {
      const text = para.text || '';
      const headingLevel = para.headingLevel || para.heading_level;

      if (headingLevel) {
        const level = headingLevel === 'h1' 
          ? HeadingLevel.HEADING_1 
          : headingLevel === 'h2' 
          ? HeadingLevel.HEADING_2 
          : HeadingLevel.HEADING_3;
        docParagraphs.push(
          new Paragraph({
            text: text,
            heading: level
          })
        );
      } else {
        docParagraphs.push(new Paragraph(text));
      }
    });

    const doc = new Document({
      sections: [{
        children: docParagraphs
      }]
    });

    return await Packer.toBuffer(doc);
  } catch (error) {
    logger.error('Word export error', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Sort blocks by orderIndex for minutes export.
 */
function sortMinutesBlocks(blocks) {
  return [...blocks].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

/**
 * Export meeting minutes to PDF from block list (paragraph, vote, brainstorm, topic_heading, event).
 * Paragraph: title as heading (if present), text as body. Vote: heading + option lines with counts. Brainstorm: heading + option list. Topic: heading. Event: one line.
 */
async function exportMinutesToPDF(document, blocks) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).font('Helvetica-Bold').text(document.title || 'Meeting minutes', { align: 'center' });
      doc.moveDown(1.5);
      if (document.description) {
        doc.fontSize(12).font('Helvetica').text(document.description, { align: 'left' });
        doc.moveDown(1);
      }
      doc.fontSize(10).fillColor('gray');
      doc.text(`Created: ${new Date(document.createdAt || document.created_at).toLocaleDateString()}`);
      doc.moveDown(1);
      doc.fillColor('black');
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(1);

      const sorted = sortMinutesBlocks(blocks);
      for (const block of sorted) {
        if (block.type === 'todos_summary') {
          doc.fontSize(16).font('Helvetica-Bold').text('To-dos', { align: 'left' });
          doc.moveDown(0.5);
          const todoList = block.todos || [];
          if (todoList.length === 0) {
            doc.fontSize(11).font('Helvetica').text('None', { align: 'left' });
          } else {
            todoList.forEach(t => {
              const owner = t.responsibleUserName || '—';
              const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—';
              doc.fontSize(11).font('Helvetica').text(`• ${t.title || ''} — ${owner} — ${due} — ${t.status || 'pending'}`, { align: 'left' });
            });
          }
          doc.moveDown(0.8);
        } else if (block.type === 'todo') {
          const owner = block.responsibleUserName || '—';
          const due = block.dueDate ? new Date(block.dueDate).toLocaleDateString() : '—';
          doc.fontSize(11).font('Helvetica').text(`• ${block.title || ''} — ${owner} — ${due} — ${block.status || 'pending'}`, { align: 'left' });
          doc.moveDown(0.5);
        } else if (block.type === 'paragraph') {
          const title = block.title || '';
          const text = block.text || '';
          const headingLevel = block.headingLevel || block.heading_level;
          if (title) {
            const size = headingLevel === 'h1' ? 18 : headingLevel === 'h2' ? 16 : 14;
            doc.fontSize(size).font('Helvetica-Bold').text(title, { align: 'left' });
            doc.moveDown(0.5);
          }
          if (text) {
            doc.fontSize(12).font('Helvetica').text(text, { align: 'left' });
            doc.moveDown(0.8);
          }
          if (!title && !text) doc.moveDown(0.5);
        } else if (block.type === 'vote') {
          const statusLabel = block.status === 'closed' ? ' (Closed)' : ' (Open)';
          doc.fontSize(14).font('Helvetica-Bold').text((block.title ? `Vote: ${block.title}` : 'Vote') + statusLabel, { align: 'left' });
          doc.moveDown(0.4);
          const total = block.totalVotes || 0;
          const options = block.options || [];
          const countsByOption = new Map((block.responseCounts || []).map(c => [c.optionId, c.count]));
          if (options.length === 0) {
            doc.fontSize(11).font('Helvetica').text('No options', { align: 'left' });
          } else {
            options.forEach(opt => {
              const count = countsByOption.get(opt.id) || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              doc.fontSize(11).font('Helvetica').text(`• ${opt.label || ''}: ${count} (${pct}%)`, { align: 'left' });
            });
          }
          doc.fontSize(10).fillColor('gray').text(`Total votes: ${total}`);
          doc.fillColor('black');
          doc.moveDown(0.8);
        } else if (block.type === 'brainstorm') {
          doc.fontSize(14).font('Helvetica-Bold').text('Brainstorm', { align: 'left' });
          doc.moveDown(0.4);
          const opts = block.options || [];
          if (opts.length === 0) {
            doc.fontSize(11).font('Helvetica').text('No options yet', { align: 'left' });
          } else {
            opts.forEach(opt => {
              doc.fontSize(11).font('Helvetica').text(`• ${opt.label || ''}`, { align: 'left' });
            });
          }
          doc.moveDown(0.8);
        } else if (block.type === 'topic_heading') {
          const title = block.title || '[Topic]';
          doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'left' });
          doc.moveDown(0.8);
        } else if (block.type === 'event') {
          doc.fontSize(11).font('Helvetica').text(block.eventLine || block.eventType || 'Event', { align: 'left' });
          doc.moveDown(0.5);
        }
      }
      doc.end();
    } catch (error) {
      logger.error('Minutes PDF export error', { error: error.message, stack: error.stack });
      reject(error);
    }
  });
}

/**
 * Export meeting minutes to Markdown from block list.
 */
function exportMinutesToMarkdown(document, blocks) {
  let md = `# ${document.title || 'Meeting minutes'}\n\n`;
  if (document.description) md += `${document.description}\n\n`;
  md += `**Created:** ${new Date(document.createdAt || document.created_at).toLocaleDateString()}\n\n---\n\n`;

  const sorted = sortMinutesBlocks(blocks);
  for (const block of sorted) {
    if (block.type === 'todos_summary') {
      md += `## To-dos\n\n`;
      const todoList = block.todos || [];
      if (todoList.length === 0) {
        md += `*None*\n\n`;
      } else {
        todoList.forEach(t => {
          const owner = t.responsibleUserName || '—';
          const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—';
          md += `- **${t.title || ''}** — ${owner} — ${due} — ${t.status || 'pending'}\n`;
        });
        md += '\n';
      }
    } else if (block.type === 'todo') {
      const owner = block.responsibleUserName || '—';
      const due = block.dueDate ? new Date(block.dueDate).toLocaleDateString() : '—';
      md += `- **${block.title || ''}** — ${owner} — ${due} — ${block.status || 'pending'}\n\n`;
    } else if (block.type === 'paragraph') {
      const title = block.title || '';
      const text = block.text || '';
      const headingLevel = block.headingLevel || block.heading_level;
      if (title) {
        const level = headingLevel === 'h1' ? 1 : headingLevel === 'h2' ? 2 : 3;
        md += `${'#'.repeat(level)} ${title}\n\n`;
      }
      if (text) md += `${text}\n\n`;
    } else if (block.type === 'vote') {
      const statusLabel = block.status === 'closed' ? ' (Closed)' : ' (Open)';
      md += `## ${block.title ? `Vote: ${block.title}` : 'Vote'}${statusLabel}\n\n`;
      const total = block.totalVotes || 0;
      const opts = block.options || [];
      if (opts.length === 0) {
        md += `*No options*\n\n`;
      } else {
        opts.forEach(opt => {
          const count = (block.responseCounts || []).find(c => c.optionId === opt.id)?.count || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          md += `- **${opt.label || ''}**: ${count} (${pct}%)\n`;
        });
      }
      md += `\n*Total votes: ${total}*\n\n`;
    } else if (block.type === 'brainstorm') {
      md += `## Brainstorm\n\n`;
      const opts = block.options || [];
      if (opts.length === 0) {
        md += `*No options yet*\n\n`;
      } else {
        opts.forEach(opt => { md += `- ${opt.label || ''}\n`; });
        md += '\n';
      }
    } else if (block.type === 'topic_heading') {
      md += `## ${block.title || '[Topic]'}\n\n`;
    } else if (block.type === 'event') {
      md += `${block.eventLine || block.eventType || 'Event'}\n\n`;
    }
  }
  return md;
}

/**
 * Export meeting minutes to Word from block list.
 */
async function exportMinutesToWord(document, blocks) {
  const docParagraphs = [];
  docParagraphs.push(new Paragraph({
    text: document.title || 'Meeting minutes',
    heading: HeadingLevel.HEADING_1
  }));
  if (document.description) docParagraphs.push(new Paragraph(document.description));
  docParagraphs.push(new Paragraph({
    children: [
      new TextRun({ text: 'Created: ', bold: true }),
      new TextRun(new Date(document.createdAt || document.created_at).toLocaleDateString())
    ]
  }));
  docParagraphs.push(new Paragraph({ text: '---' }));

  const sorted = sortMinutesBlocks(blocks);
  for (const block of sorted) {
    if (block.type === 'todos_summary') {
      docParagraphs.push(new Paragraph({ text: 'To-dos', heading: HeadingLevel.HEADING_2 }));
      const todoList = block.todos || [];
      if (todoList.length === 0) {
        docParagraphs.push(new Paragraph('None'));
      } else {
        todoList.forEach(t => {
          const owner = t.responsibleUserName || '—';
          const due = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—';
          docParagraphs.push(new Paragraph(`• ${t.title || ''} — ${owner} — ${due} — ${t.status || 'pending'}`));
        });
      }
    } else if (block.type === 'todo') {
      const owner = block.responsibleUserName || '—';
      const due = block.dueDate ? new Date(block.dueDate).toLocaleDateString() : '—';
      docParagraphs.push(new Paragraph(`• ${block.title || ''} — ${owner} — ${due} — ${block.status || 'pending'}`));
    } else if (block.type === 'paragraph') {
      const title = block.title || '';
      const text = block.text || '';
      const headingLevel = block.headingLevel || block.heading_level;
      if (title) {
        const level = headingLevel === 'h1' ? HeadingLevel.HEADING_1 : headingLevel === 'h2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
        docParagraphs.push(new Paragraph({ text: title, heading: level }));
      }
      if (text) docParagraphs.push(new Paragraph(text));
    } else if (block.type === 'vote') {
      const statusLabel = block.status === 'closed' ? ' (Closed)' : ' (Open)';
      docParagraphs.push(new Paragraph({
        text: (block.title ? `Vote: ${block.title}` : 'Vote') + statusLabel,
        heading: HeadingLevel.HEADING_2
      }));
      const total = block.totalVotes || 0;
      const opts = block.options || [];
      if (opts.length === 0) {
        docParagraphs.push(new Paragraph('No options'));
      } else {
        const countsByOption = new Map((block.responseCounts || []).map(c => [c.optionId, c.count]));
        opts.forEach(opt => {
          const count = countsByOption.get(opt.id) || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          docParagraphs.push(new Paragraph(`• ${opt.label || ''}: ${count} (${pct}%)`));
        });
      }
      docParagraphs.push(new Paragraph({ text: `Total votes: ${total}`, italics: true }));
    } else if (block.type === 'brainstorm') {
      docParagraphs.push(new Paragraph({ text: 'Brainstorm', heading: HeadingLevel.HEADING_2 }));
      const opts = block.options || [];
      if (opts.length === 0) {
        docParagraphs.push(new Paragraph('No options yet'));
      } else {
        opts.forEach(opt => docParagraphs.push(new Paragraph(`• ${opt.label || ''}`)));
      }
    } else if (block.type === 'topic_heading') {
      docParagraphs.push(new Paragraph({
        text: block.title || '[Topic]',
        heading: HeadingLevel.HEADING_2
      }));
    } else if (block.type === 'event') {
      docParagraphs.push(new Paragraph(block.eventLine || block.eventType || 'Event'));
    }
  }

  const doc = new Document({
    sections: [{ children: docParagraphs }]
  });
  return await Packer.toBuffer(doc);
}

module.exports = {
  exportToPDF,
  exportToMarkdown,
  exportToWord,
  exportMinutesToPDF,
  exportMinutesToMarkdown,
  exportMinutesToWord
};
