const fs = require('fs');
const path = require('path');

function replaceBorders(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceBorders(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      // Replace exactly border-neutral-outline-variant not followed by /
      let newContent = content.replace(/(border-neutral-outline-variant)(?!\/)/g, "$1/15");
      if (content !== newContent) {
        fs.writeFileSync(fullPath, newContent);
        console.log(`Updated borders in ${fullPath}`);
      }
    }
  });
}

replaceBorders(path.join(__dirname, '..', 'app'));
replaceBorders(path.join(__dirname, '..', 'components'));
console.log('Border fix complete.');
