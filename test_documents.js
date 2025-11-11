const express = require('express');
const router = express.Router();

// Test the problematic callback structure
router.post('/', (req, res) => {
  // Simulate the db operations
  db.run('INSERT INTO documents...', function(err) {
    if (err) return res.status(500).json({ error: 'Failed' });

    db.run('INSERT INTO paragraphs...', (insertErr) => {
      if (insertErr) console.error('Insert error');

      db.run('UPDATE paragraphs...', (updateErr) => {
        if (updateErr) console.error('Update error');

        db.get('SELECT * FROM documents...', (err, document) => {
          if (err) return res.status(500).json({ error: 'Retrieve failed' });

          res.status(201).json({ document: { id: 'test' } });
        });
      });
    });
  });
});

module.exports = router;
