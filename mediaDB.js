const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const media_dir = './media';
const DB_FILE = 'media.db';
const db = new sqlite3.Database(DB_FILE);

// Setup schema
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,             -- 'movie' or 'tv'
    title TEXT,            -- Movie name or episode filename
    show TEXT,             -- null for movies
    season INTEGER,        -- null for movies
    episode TEXT,          -- null for movies
    filepath TEXT UNIQUE,
    subtitles TEXT
  )`);
});

function parseSeason(folderName) {
  const match = folderName.match(/s(?:eason)?\s*0*(\d+)/i);
  if (match) {
    console.log(`parseSeason matched season ${match[1]} in folder name "${folderName}"`);
    return parseInt(match[1], 10);
  }
  console.log(`parseSeason found no match in folder name "${folderName}"`);
  return null;
}

function scanDir(dirPath, parentInfo = {}) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const newParentInfo = { ...parentInfo };

    if (entry.isDirectory()) {
      if (!parentInfo.type) {
        // At root level
        if (entry.name.toLowerCase() === 'movies') {
          newParentInfo.type = 'movie';
        } else if (entry.name.toLowerCase() === 'tv') {
          newParentInfo.type = 'tv';
        }
        scanDir(fullPath, newParentInfo);
      }
      else if (parentInfo.type === 'tv') {
        if (!parentInfo.show) {
          newParentInfo.show = entry.name;
          console.log(`Detected show: ${newParentInfo.show}`);
          scanDir(fullPath, newParentInfo);
        }
        else {
          // For all deeper folders inside a show, check if season folder:
          const seasonNum = parseSeason(entry.name);
          if (seasonNum !== null) {
            newParentInfo.season = seasonNum;
            console.log(`Detected season ${seasonNum} for show ${parentInfo.show}`);
          } else {
            // keep previous season if any
            if (parentInfo.season) newParentInfo.season = parentInfo.season;
          }
          scanDir(fullPath, newParentInfo);
        }
      }
      else if (parentInfo.type === 'movie') {
        // Just scan deeper for movies, no show/season
        scanDir(fullPath, newParentInfo);
      }
    }
    else if (entry.isFile() && entry.name.endsWith('.mp4')) {
      const baseName = path.parse(entry.name).name;
      const vttPath = path.join(dirPath, `${baseName}.vtt`);
      const hasVtt = fs.existsSync(vttPath) ? `${baseName}.vtt` : null;

      const type = parentInfo.type || 'movie';
      const title = baseName;
      const show = type === 'tv' ? parentInfo.show : null;
      const season = type === 'tv' ? parentInfo.season : null;
      const episode = type === 'tv' ? entry.name : null;

      console.log(`[${type.toUpperCase()}] ${title} ${show ? `| Show: ${show}` : ''}${season ? ` | Season: ${season}` : ''}`);

      db.run(`INSERT OR IGNORE INTO media (type, title, show, season, episode, filepath, subtitles)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [type, title, show, season, episode, fullPath, hasVtt]);
    }
  }
}

scanDir(media_dir);

db.close(() => {
  console.log('✅ Scan complete. Database connection closed.');
});
