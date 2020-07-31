const fs = require('fs');
const path = require('path');

// Get folder path from command line argument, or use current directory
const targetDir = process.argv[2] || '.';

let fileCount = 0;

function countFilesInDir(dir) {
    try {
        const items = fs.readdirSync(dir);

        items.forEach(item => {
            const fullPath = path.join(dir, item);
            const stats = fs.statSync(fullPath);

            if (stats.isFile()) {
                fileCount++;
            } else if (stats.isDirectory()) {
                countFilesInDir(fullPath); // Recurse into subdirectories
            }
        });
    } catch (err) {
        console.error(`Error reading directory ${dir}:`, err.message);
    }
}

// Start counting
countFilesInDir(path.resolve(targetDir));

console.log(`Total files: ${fileCount}`);