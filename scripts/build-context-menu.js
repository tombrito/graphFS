/**
 * Build script for context-menu.exe
 *
 * Downloads a portable MinGW compiler if needed and compiles the context menu utility.
 * Run with: node scripts/build-context-menu.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawn } = require('child_process');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const CPP_FILE = path.join(BIN_DIR, 'context-menu.cpp');
const EXE_FILE = path.join(BIN_DIR, 'context-menu.exe');
const MINGW_DIR = path.join(BIN_DIR, 'mingw64');
const GPP_EXE = path.join(MINGW_DIR, 'bin', 'g++.exe');

// w64devkit - portable MinGW for Windows (MIT license)
// https://github.com/skeeto/w64devkit
const W64DEVKIT_URL = 'https://github.com/skeeto/w64devkit/releases/download/v2.0.0/w64devkit-x64-2.0.0.exe';
const W64DEVKIT_FILE = path.join(BIN_DIR, 'w64devkit.exe');

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);

    const file = fs.createWriteStream(destPath);
    let redirectCount = 0;

    function download(downloadUrl) {
      https.get(downloadUrl, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          redirectCount++;
          if (redirectCount > 5) {
            reject(new Error('Too many redirects'));
            return;
          }
          download(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize) {
            const percent = Math.round((downloadedSize / totalSize) * 100);
            process.stdout.write(`\rDownloading... ${percent}%`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log('\nDownload complete!');
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }

    download(url);
  });
}

async function extractW64devkit() {
  console.log('Extracting w64devkit (self-extracting archive)...');

  // w64devkit is a self-extracting 7z archive
  // Run it with -o to specify output directory
  try {
    execSync(`"${W64DEVKIT_FILE}" -o"${BIN_DIR}" -y`, {
      stdio: 'inherit',
      windowsHide: true
    });

    // w64devkit extracts to a folder called "w64devkit", rename to mingw64
    const extractedDir = path.join(BIN_DIR, 'w64devkit');
    if (fs.existsSync(extractedDir)) {
      fs.renameSync(extractedDir, MINGW_DIR);
    }

    // Clean up the archive
    fs.unlinkSync(W64DEVKIT_FILE);

    console.log('Extraction complete!');
  } catch (error) {
    throw new Error(`Failed to extract: ${error.message}`);
  }
}

async function ensureCompiler() {
  // Check if g++ already exists
  if (fs.existsSync(GPP_EXE)) {
    console.log('MinGW compiler found.');
    return true;
  }

  // Check if system has g++ in PATH
  try {
    execSync('where g++', { stdio: 'ignore' });
    console.log('System g++ found in PATH.');
    return true;
  } catch {
    // Not in PATH
  }

  console.log('No C++ compiler found. Downloading portable MinGW...');

  // Download w64devkit
  if (!fs.existsSync(W64DEVKIT_FILE)) {
    await downloadFile(W64DEVKIT_URL, W64DEVKIT_FILE);
  }

  // Extract
  await extractW64devkit();

  return fs.existsSync(GPP_EXE);
}

function compile() {
  console.log('Compiling context-menu.cpp...');

  // Determine which g++ to use and setup environment
  let gppPath = 'g++';
  let env = { ...process.env };

  if (fs.existsSync(GPP_EXE)) {
    gppPath = GPP_EXE;
    // Add MinGW bin directory to PATH so it can find 'as', 'ld', etc.
    const mingwBin = path.dirname(GPP_EXE);
    env.PATH = mingwBin + ';' + (env.PATH || '');
  }

  const args = [
    '-O2',
    '-DUNICODE',
    '-D_UNICODE',
    '-static',  // Static linking for portability
    CPP_FILE,
    '-lshell32',
    '-lshlwapi',
    '-lole32',
    '-lcomctl32',
    '-luuid',
    '-o', EXE_FILE
  ];

  try {
    execSync(`"${gppPath}" ${args.join(' ')}`, {
      stdio: 'inherit',
      cwd: BIN_DIR,
      env: env
    });

    // Check if exe was created
    if (fs.existsSync(EXE_FILE)) {
      const stats = fs.statSync(EXE_FILE);
      const sizeKB = Math.round(stats.size / 1024);
      console.log(`\nSuccess! Created context-menu.exe (${sizeKB} KB)`);
      return true;
    }
  } catch (error) {
    console.error('Compilation failed:', error.message);
    return false;
  }

  return false;
}

async function main() {
  console.log('=== Building context-menu.exe ===\n');

  // Check if cpp file exists
  if (!fs.existsSync(CPP_FILE)) {
    console.error(`Error: ${CPP_FILE} not found!`);
    process.exit(1);
  }

  // Check if exe already exists
  if (fs.existsSync(EXE_FILE)) {
    const cppStat = fs.statSync(CPP_FILE);
    const exeStat = fs.statSync(EXE_FILE);

    if (exeStat.mtime > cppStat.mtime) {
      console.log('context-menu.exe is up to date.');
      return;
    }
  }

  try {
    // Ensure we have a compiler
    const hasCompiler = await ensureCompiler();
    if (!hasCompiler) {
      console.error('Failed to setup compiler.');
      process.exit(1);
    }

    // Compile
    const success = compile();
    if (!success) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
