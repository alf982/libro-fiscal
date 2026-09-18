/**
 * Crea un archivo .ico básico a partir de un PNG existente.
 * El formato ICO embebe el PNG directamente (compatible con Windows Vista+).
 */
const fs = require('fs');
const path = require('path');

const pngPath = path.join(__dirname, 'libro', 'assets', 'icon.png');
const icoPath = path.join(__dirname, 'libro', 'assets', 'icon.ico');

const pngData = fs.readFileSync(pngPath);

// Leer dimensiones del PNG desde el header IHDR
// PNG header: 8 bytes sig + 4 bytes length + 4 bytes "IHDR" + 4 bytes width + 4 bytes height
const width = pngData.readUInt32BE(16);
const height = pngData.readUInt32BE(20);

console.log(`PNG dimensions: ${width}x${height}, size: ${pngData.length} bytes`);

// Formato ICO:
// ICONDIR: 6 bytes
//   reserved (2 bytes) = 0
//   type (2 bytes) = 1 (ICO)
//   count (2 bytes) = 1 (una imagen)
// ICONDIRENTRY: 16 bytes
//   width (1 byte) - 0 significa 256
//   height (1 byte) - 0 significa 256
//   colorCount (1 byte) = 0
//   reserved (1 byte) = 0
//   planes (2 bytes) = 1
//   bitCount (2 bytes) = 32
//   bytesInRes (4 bytes) = tamaño del PNG
//   imageOffset (4 bytes) = 6 + 16 = 22
// Luego los datos PNG

const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);   // reserved
icoHeader.writeUInt16LE(1, 2);   // type: ICO
icoHeader.writeUInt16LE(1, 4);   // count: 1 imagen

const dirEntry = Buffer.alloc(16);
// width/height: 0 = 256px (o el valor real si es menor)
dirEntry.writeUInt8(width >= 256 ? 0 : width, 0);
dirEntry.writeUInt8(height >= 256 ? 0 : height, 1);
dirEntry.writeUInt8(0, 2);        // colorCount
dirEntry.writeUInt8(0, 3);        // reserved
dirEntry.writeUInt16LE(1, 4);     // planes
dirEntry.writeUInt16LE(32, 6);    // bitCount (32bpp)
dirEntry.writeUInt32LE(pngData.length, 8);  // bytesInRes
dirEntry.writeUInt32LE(22, 12);   // imageOffset (6 + 16)

const icoBuffer = Buffer.concat([icoHeader, dirEntry, pngData]);
fs.writeFileSync(icoPath, icoBuffer);

console.log(`ICO creado correctamente: ${icoPath}`);
console.log(`Tamaño del ICO: ${icoBuffer.length} bytes`);
