/**
 * Script para baixar o Everything CLI (es.exe) e Everything Portable automaticamente.
 * Executado via: npm run postinstall
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ES_VERSION = '1.1.0.27';
const EVERYTHING_VERSION = '1.4.1.1026';

const ES_URL = `https://www.voidtools.com/ES-${ES_VERSION}.x64.zip`;
const EVERYTHING_URL = `https://www.voidtools.com/Everything-${EVERYTHING_VERSION}.x64.zip`;

const BIN_DIR = path.join(__dirname, '..', 'bin');
const ES_PATH = path.join(BIN_DIR, 'es.exe');
const EVERYTHING_PATH = path.join(BIN_DIR, 'Everything.exe');
const ES_ZIP_PATH = path.join(BIN_DIR, 'es.zip');
const EVERYTHING_ZIP_PATH = path.join(BIN_DIR, 'everything.zip');

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Baixando ${url}...`);

    const file = fs.createWriteStream(dest);

    const request = (url) => {
      https.get(url, (response) => {
        // Seguir redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const total = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total) {
            const percent = ((downloaded / total) * 100).toFixed(1);
            process.stdout.write(`\rProgresso: ${percent}%`);
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log('\nDownload concluído!');
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };

    request(url);
  });
}

function extractZip(zipPath, destDir) {
  console.log('Extraindo es.exe...');

  // Usa PowerShell para extrair (disponível no Windows)
  try {
    execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
      stdio: 'inherit'
    });
    console.log('Extração concluída!');
    return true;
  } catch (error) {
    console.error('Erro ao extrair com PowerShell:', error.message);
    return false;
  }
}

async function downloadIfMissing(url, zipPath, exePath, name) {
  if (fs.existsSync(exePath)) {
    console.log(`${name} já existe em bin/. Pulando download.`);
    return true;
  }

  try {
    await download(url, zipPath);

    if (extractZip(zipPath, BIN_DIR)) {
      // Remove o zip após extrair
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }

      if (fs.existsSync(exePath)) {
        console.log(`${name} instalado com sucesso!`);
        return true;
      } else {
        console.error(`Erro: ${name} não encontrado após extração.`);
        return false;
      }
    }
  } catch (error) {
    console.error(`Erro ao instalar ${name}:`, error.message);
    return false;
  }

  return false;
}

async function main() {
  // Só executa no Windows
  if (process.platform !== 'win32') {
    console.log('Everything só está disponível para Windows. Pulando instalação.');
    return;
  }

  // Cria diretório bin se não existir
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  console.log('=== Instalando Everything (Portable) ===\n');

  // Baixa Everything Portable (necessário para indexação)
  const everythingOk = await downloadIfMissing(
    EVERYTHING_URL,
    EVERYTHING_ZIP_PATH,
    EVERYTHING_PATH,
    'Everything.exe'
  );

  console.log('');

  // Baixa Everything CLI (es.exe)
  const esOk = await downloadIfMissing(
    ES_URL,
    ES_ZIP_PATH,
    ES_PATH,
    'es.exe (Everything CLI)'
  );

  console.log('');

  if (everythingOk && esOk) {
    console.log('=== Instalação concluída! ===');
    console.log('Everything Portable e CLI estão prontos para uso.');
  } else {
    console.log('=== Instalação parcial ===');
    console.log('Alguns componentes não foram instalados.');
    console.log('Baixe manualmente em: https://www.voidtools.com/downloads/');
  }
}

main();
