// Test callback nesting
function test() {
  db.run('INSERT...', function(err) {
    db.run('INSERT...', (insertErr) => {
      db.run('UPDATE...', (updateErr) => {
        db.get('SELECT...', (err, doc) => {
          console.log('done');
        });
      });
    });
  });
}
