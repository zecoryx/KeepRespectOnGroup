import { parentPort, workerData } from 'worker_threads';
import sharp from 'sharp';

/**
 * Image Processing Worker
 * Offloads CPU-intensive image resizing and conversion to a separate thread.
 */
async function processImage() {
    try {
        const { buffer, width, height, quality } = workerData;
        
        const processedBuffer = await sharp(buffer, { failOn: 'truncated', limitInputPixels: 268402689 })
            .resize({ width, height, fit: 'inside' })
            .toFormat('jpeg', { quality })
            .toBuffer();

        parentPort?.postMessage({ 
            success: true, 
            base64: processedBuffer.toString('base64') 
        });
    } catch (error: any) {
        parentPort?.postMessage({ 
            success: false, 
            error: error.message 
        });
    }
}

processImage();
