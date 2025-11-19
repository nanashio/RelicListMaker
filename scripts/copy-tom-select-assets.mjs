import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const vendorDir = path.join(projectRoot, 'templates', 'gallery', 'vendor', 'tom-select');
const nodeModulesDir = path.join(projectRoot, 'node_modules', 'tom-select', 'dist');

const assets = [
    {
        source: path.join(nodeModulesDir, 'js', 'tom-select.complete.js'),
        target: path.join(vendorDir, 'tom-select.complete.js')
    },
    {
        source: path.join(nodeModulesDir, 'css', 'tom-select.css'),
        target: path.join(vendorDir, 'tom-select.css')
    }
];

async function copyAsset({ source, target }) {
    try {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(source, target);
        console.log(`Copied ${source} -> ${target}`);
    } catch (error) {
        console.error(`Failed to copy ${source}: ${error.message}`);
        throw error;
    }
}

async function main() {
    try {
        await Promise.all(assets.map(copyAsset));
        console.log('Tom Select assets synchronized.');
    } catch (error) {
        console.error('Tom Select assets could not be synchronized.');
        process.exitCode = 1;
    }
}

await main();
