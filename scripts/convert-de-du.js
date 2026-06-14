/**
 * Converts formal German (Sie) strings to informal Du in de locale JSON files.
 * Run: node scripts/convert-de-du.js
 * Review git diff after running — not every replacement is perfect.
 */
const fs = require('fs');
const path = require('path');

const DE_DIR = path.join(__dirname, '..', 'client', 'public', 'locales', 'de');

const REPLACEMENTS = [
  [/Möchten Sie/g, 'Möchtest du'],
  [/Bitte geben Sie/g, 'Bitte gib'],
  [/Bitte wählen Sie/g, 'Bitte wähle'],
  [/Bitte versuchen Sie/g, 'Bitte versuche'],
  [/Bitte füllen Sie/g, 'Bitte fülle'],
  [/Bitte warten Sie/g, 'Bitte warte'],
  [/Bitte fordern Sie/g, 'Bitte fordere'],
  [/Bestätigen Sie/g, 'Bestätige'],
  [/Richten Sie/g, 'Richte'],
  [/Wechseln Sie/g, 'Wechsle'],
  [/Verfolgen Sie/g, 'Verfolge'],
  [/Öffnen Sie/g, 'Öffne'],
  [/Passen Sie an/g, 'Passe an'],
  [/Schreiben Sie/g, 'Schreib'],
  [/Verifizieren Sie/g, 'Verifiziere'],
  [/Geben Sie Ihr/g, 'Gib dein'],
  [/Geben Sie Ihre/g, 'Gib deine'],
  [/Geben Sie/g, 'Gib'],
  [/Wählen Sie/g, 'Wähle'],
  [/Schließen Sie/g, 'Schließe'],
  [/Erstellen Sie/g, 'Erstelle'],
  [/Fügen Sie/g, 'Füge'],
  [/Deaktivieren Sie/g, 'Deaktiviere'],
  [/Aktivieren Sie/g, 'Aktiviere'],
  [/Schalten Sie/g, 'Schalte'],
  [/Gehen Sie/g, 'Gehe'],
  [/Schlagen Sie/g, 'Schlage'],
  [/Klicken Sie/g, 'Klicke'],
  [/Kontaktieren Sie/g, 'Kontaktiere'],
  [/Melden Sie sich/g, 'Melde dich'],
  [/Sie können/g, 'Du kannst'],
  [/Sie sind bereits/g, 'Du bist bereits'],
  [/Sie wurden/g, 'Du wurdest'],
  [/Sie haben/g, 'Du hast'],
  [/Ihre Stimme/g, 'Deine Stimme'],
  [/Ihre E-Mail/g, 'Deine E-Mail'],
  [/Ihr Passwort/g, 'Dein Passwort'],
  [/Ihr erstes/g, 'Dein erstes'],
  [/Ihre /g, 'Deine '],
  [/Ihr /g, 'Dein '],
  [/Ihnen /g, 'dir '],
  [/Kommentieren und abstimmen Sie/g, 'Kommentiere und stimme ab'],
  [/Prüfen Sie/g, 'Prüfe'],
  [/Laden Sie/g, 'Lade'],
  [/Versuchen Sie/g, 'Versuche'],
  [/Stellen Sie/g, 'Stelle'],
  [/Beantragen Sie/g, 'Beantrage'],
  [/Wenden Sie sich/g, 'Wende dich'],
  [/Sie sind nicht/g, 'Du bist nicht'],
  [/Sie haben keinen/g, 'Du hast keinen'],
  [/Sie haben keine/g, 'Du hast keine'],
  [/für Sie /g, 'für dich '],
  [/an Sie /g, 'an dich '],
  [/ Dein /g, ' dein '],
  [/ Deine /g, ' deine '],
  [/ Deinen /g, ' deinen '],
  [/Semmelbrösel/g, 'Brotkrumen'],
  [/Nachbestellung zulassen/g, 'Neu anordnen erlauben'],
  [/sidebarTitle": "Unterlagen"/g, 'sidebarTitle": "Dokumente"'],
  [/Bitte laden Sie/g, 'Bitte lade'],
  [/Passen Sie/g, 'Passe'],
  [/Bewegen Sie/g, 'Bewege'],
  [/Bitte nehmen Sie/g, 'Bitte nimm'],
  [/Stimmen Sie/g, 'Stimme'],
  [/Tippen Sie/g, 'Tippe'],
  [/haben Sie erwartet/g, 'hast du erwartet'],
  [/Bitte bestätigen Sie/g, 'Bitte bestätige'],
  [/Starten Sie/g, 'Starte'],
  [/Schauen Sie/g, 'Schau'],
  [/nominieren Sie/g, 'nominiere'],
  [/Bitte beheben Sie/g, 'Bitte behebe'],
  [/Ihren Antrag/g, 'Deinen Antrag'],
  [/Enthalten Sie sich/g, 'Enthalt dich'],
  [/Genehmigen Sie/g, 'Genehmige'],
  [/Lehnen Sie ab/g, 'Lehne ab'],
  [/Nutzen Sie/g, 'Nutze'],
  [/Helfen Sie uns/g, 'Hilf uns'],
  [/Überprüfen Sie/g, 'Überprüfe'],
  [/teilen Sie/g, 'teile'],
  [/Verwalten Sie/g, 'Verwalte'],
  [/Lassen Sie/g, 'Lass'],
  [/erstellen Sie/g, 'erstelle'],
  [/Planen Sie/g, 'Plane'],
  [/Konzentrieren Sie/g, 'Konzentiere'],
  [/Notieren Sie/g, 'Notiere'],
  [/generieren Sie/g, 'generiere'],
  [/Speichern Sie/g, 'Speichere'],
  [/versuchen Sie es erneut/g, 'versuche es erneut'],
  [/ dass Sie /g, ' dass du '],
  [/governance": "Steuerung"/g, 'governance": "Mitbestimmung"'],
  [/finden Sie im/g, 'findest du im'],
  [/Ihrer Einladungs/g, 'deiner Einladungs'],
  [/fügen Sie/g, 'füge'],
  [/abschließen möchten/g, 'abschließen möchtest'],
  [/nominieren Sie sich/g, 'nominiere dich'],
];

function convertString(value) {
  if (typeof value !== 'string') return value;
  let result = value;
  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function walk(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      out[key] = convertString(val);
    } else if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = walk(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

const files = fs.readdirSync(DE_DIR).filter((f) => f.endsWith('.json'));
for (const file of files) {
  const filePath = path.join(DE_DIR, file);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const converted = walk(content);
  fs.writeFileSync(filePath, JSON.stringify(converted, null, 2) + '\n', 'utf8');
  console.log(`Converted ${file}`);
}

console.log('Done. Review diff for edge cases.');
