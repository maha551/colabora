const { exportToPDF, exportToMarkdown, exportToWord } = require('../../server/modules/export');

describe('Export Module Tests', () => {
  const mockDocument = {
    id: 'test-doc',
    title: 'Test Document',
    description: 'Test description'
  };

  const mockParagraphs = [
    {
      id: 'para1',
      text: 'First paragraph',
      order_index: 1,
      heading_level: null
    },
    {
      id: 'para2',
      text: 'Second paragraph',
      order_index: 2,
      heading_level: 'h2'
    }
  ];

  test('should export to markdown', () => {
    expect(typeof exportToMarkdown).toBe('function');

    const markdown = exportToMarkdown(mockDocument, mockParagraphs);
    expect(typeof markdown).toBe('string');
    expect(markdown).toContain('Test Document');
    expect(markdown).toContain('First paragraph');
  });

  test('should export to PDF', async () => {
    expect(typeof exportToPDF).toBe('function');

    const pdfBuffer = await exportToPDF(mockDocument, mockParagraphs);
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });

  test('should export to Word', async () => {
    expect(typeof exportToWord).toBe('function');

    const wordBuffer = await exportToWord(mockDocument, mockParagraphs);
    expect(Buffer.isBuffer(wordBuffer)).toBe(true);
    expect(wordBuffer.length).toBeGreaterThan(0);
  });

  test('should handle empty paragraphs', async () => {
    const markdown = exportToMarkdown(mockDocument, []);
    expect(typeof markdown).toBe('string');
    expect(markdown).toContain('Test Document');
  });
});

