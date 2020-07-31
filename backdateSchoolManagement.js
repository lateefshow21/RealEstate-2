const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// === CONFIG (CHANGE ONLY THESE) ===
const USERNAME = 'abiodunkehinde';
const USEREMAIL = 'abiodunkehindeshow@gmail.com';
const REPO_NAME = 'SchoolManagement-CI';         // GitHub repo name
const PROJECT_NAME = 'SchoolManagement-CI';     // Local folder name
const START_DATE = '2022-09-01';                // Backdate from
const END_DATE = '2025-11-07';                  // Backdate to
const FILES_PER_COMMIT = 5;                     // 5 files per day

// === WINDOWS RESERVED NAMES (Git blocks these) ===
const RESERVED_WINDOWS_NAMES = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

function isReservedName(filename) {
    const name = filename.toUpperCase().split('.')[0];
    return RESERVED_WINDOWS_NAMES.has(name);
}

// === SYSTEM ===
const isWin = process.platform === 'win32';
const BASH_PATH = 'C:\\Program Files\\Git\\bin\\bash.exe';

// === TARGET PROJECT FOLDER ===
const targetDir = path.join(process.cwd(), PROJECT_NAME);
if (!fs.existsSync(targetDir)) {
    console.error(`Folder not found: ${targetDir}`);
    console.error(`Run from parent folder: node "${PROJECT_NAME}/backdateSchoolManagement.js"`);
    process.exit(1);
}
console.log(`Processing: ${targetDir}`);

// === 1. LIST ALL FILES (SKIP RESERVED & JUNK) ===
let allFiles = [];
function listFilesInDir(dir) {
    try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const fullPath = path.join(dir, item);
            const stats = fs.statSync(fullPath);
            if (stats.isFile()) {
                const filename = path.basename(fullPath);
                if (isReservedName(filename)) {
                    console.warn(`Skipping reserved name: ${filename}`);
                    return;
                }
                const relPath = path.relative(targetDir, fullPath).replace(/\\/g, '/');
                allFiles.push(relPath);
            } else if (stats.isDirectory()) {
                const base = path.basename(fullPath);
                if (!['node_modules', '.git', '.vscode', 'vendor', '.git.backup', 'cache', 'logs', 'temp'].includes(base)) {
                    listFilesInDir(fullPath);
                }
            }
        });
    } catch (err) {
        console.error(`Error reading ${dir}:`, err.message);
    }
}
listFilesInDir(targetDir);
console.log(`Found ${allFiles.length} valid files.`);

if (allFiles.length === 0) {
    console.log('No files to commit.');
    process.exit(1);
}

// === 2. SHUFFLE & GROUP ===
allFiles.sort(() => Math.random() - 0.5);
const groups = [];
for (let i = 0; i < allFiles.length; i += FILES_PER_COMMIT) {
    groups.push(allFiles.slice(i, i + FILES_PER_COMMIT));
}
console.log(`Created ${groups.length} commit groups (5 files/day).`);

// === 3. RANDOM UNIQUE DATES ===
const msPerDay = 86400000;
const daysInRange = Math.floor((new Date(END_DATE) - new Date(START_DATE)) / msPerDay) + 1;
const used = new Set();
const dates = [];
while (dates.length < groups.length) {
    const day = Math.floor(Math.random() * daysInRange);
    if (!used.has(day)) {
        used.add(day);
        const d = new Date(new Date(START_DATE).getTime() + day * msPerDay);
        dates.push(d.toISOString().split('T')[0]);
    }
}

// === 4. GIT SETUP & BACKDATED COMMITS ===
try {
    // KILL GIT PROCESSES
    if (isWin) {
        try { execSync('taskkill //F //IM git.exe //T >nul 2>&1', { stdio: 'ignore' }); } catch (e) {}
    }

    // REMOVE .git USING BASH (Git Bash compatible)
    const gitDir = path.join(targetDir, '.git');
    if (fs.existsSync(gitDir)) {
        console.log('Removing .git...');
        execSync(`"${BASH_PATH}" -c "rm -rf '${gitDir}'"`, { stdio: 'ignore' });
        console.log('.git removed.');
    }

    // CHANGE TO PROJECT DIR
    process.chdir(targetDir);
    console.log(`Working in: ${process.cwd()}`);

    // RUN GIT VIA BASH
    const runGit = (cmd, options = {}) => {
        const fullCmd = `"${BASH_PATH}" -c "${cmd.replace(/"/g, '\\"')}"`;
        execSync(fullCmd, { stdio: 'inherit', shell: undefined, ...options });
    };

    runGit('git init');
    runGit(`git config user.name "${USERNAME}"`);
    runGit(`git config user.email "${USEREMAIL}"`);
    runGit('git branch -M main');

    // PROCESS EACH GROUP
    groups.forEach((group, i) => {
        const dateStr = dates[i];
        const sample = group[0].split('/')[0] || 'root';
        const msg = `Update: Added ${group.length} files (${sample}) - School Management System (CodeIgniter)`;

        // USE ABSOLUTE PATH
        const listFile = path.join(targetDir, `.git-add-list-${i}.txt`);
        fs.writeFileSync(listFile, group.join('\n'), 'utf8');

        const safePath = `"${listFile.replace(/"/g, '\\"')}"`;
        runGit(`git add --pathspec-from-file=${safePath}`);

        // COMMIT
        const env = {
            ...process.env,
            GIT_AUTHOR_DATE: `${dateStr}T12:00:00`,
            GIT_COMMITTER_DATE: `${dateStr}T12:00:00`,
        };
        runGit(`git commit -m "${msg}"`, { env });

        console.log(`Committed ${i + 1}/${groups.length}: ${dateStr} (${group.length} files)`);

        // CLEAN UP AFTER DELAY (PREVENT RACE)
        setTimeout(() => {
            try { fs.unlinkSync(listFile); } catch (e) {}
        }, 1000);
    });

    // === 5. PUSH TO GITHUB ===
    const repoUrl = `https://github.com/${USERNAME}/${REPO_NAME}.git`;
    try {
        runGit(`gh repo create ${USERNAME}/${REPO_NAME} --public --source=. --push --remote=origin --confirm`);
        console.log('Pushed via GitHub CLI!');
    } catch (e) {
        console.log('GitHub CLI failed → HTTPS push...');
        runGit(`git remote add origin ${repoUrl} || git remote set-url origin ${repoUrl}`);
        runGit('git push -u origin main --force');  // FIXED: ' not `
        console.log('Force pushed! Use PAT if prompted.');
    }

    console.log(`\nSUCCESS!`);
    console.log(`Repo: https://github.com/${USERNAME}/${REPO_NAME}`);
    console.log(`Commits: ${groups.length} | Files: ${allFiles.length}`);
    console.log(`Backdated: ${START_DATE} → ${END_DATE}`);
    console.log(`Check GitHub in 5–10 mins for green squares!`);

} catch (err) {
    console.error('FAILED:', err.message);
    process.exit(1);
}