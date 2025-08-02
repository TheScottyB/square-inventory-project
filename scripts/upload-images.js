#!/usr/bin/env node

import { SquareCatalogAgent } from '../src/agents/SquareCatalogAgent.js';
import fs from 'fs-extra';
import path from 'path';

// Initialize the agent
const agent = new SquareCatalogAgent();

// Validate image size
async function validateImageSize(imagePath) {
  const stats = await fs.stat(imagePath);
  // Resize if image is larger than 5MB (5120KB)
  if (stats.size > 5120 * 1024) {
    console.warn(`Image ${imagePath} is larger than 5MB and may need resizing.`);
  }
}

// Upload a single image
async function uploadImage(imagePath) {
  try {
    if (!(await fs.pathExists(imagePath))) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    await validateImageSize(imagePath);
    const imageBuffer = await fs.readFile(imagePath);
    const imageName = path.basename(imagePath);

    const uploadedImage = await agent.uploadImage(imageBuffer, imageName);
    console.log(`✅ Image uploaded: ${uploadedImage.id} (${uploadedImage.imageData.name})`);
    return uploadedImage;

  } catch (error) {
    console.error(`❌ Failed to upload image ${imagePath}: ${error.message}`);
    throw error;
  }
}

// Upload all images from a directory
async function uploadImagesFromDirectory(directoryPath) {
  try {
    const files = await fs.readdir(directoryPath);
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));

    for (const imageFile of imageFiles) {
      const imagePath = path.join(directoryPath, imageFile);
      await uploadImage(imagePath);
    }
  } catch (error) {
    console.error(`❌ Error processing directory ${directoryPath}: ${error.message}`);
    throw error;
  }
}

// Usage
(async () => {
  try {
    const directories = [
      './jewelry',
      './candles-holders',
      './first-aid-kits',
      './shoes-sneakers',
      './pet-products'
    ];

    for (const dir of directories) {
      console.log(`📁 Processing directory: ${dir}`);
      await uploadImagesFromDirectory(dir);
    }

    console.log('🎉 All images uploaded successfully!');

  } catch (error) {
    console.error('❌ Image upload workflow failed:', error.message);
  }
})();

