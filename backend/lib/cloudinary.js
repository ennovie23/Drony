import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const isCloudinaryConfigured = () =>
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

/**
 * Uploads an image (file path or base64 data URI) to Cloudinary.
 * @param {string} fileSource - Local path or 'data:image/jpeg;base64,...' string
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
export async function uploadToCloudinary(fileSource, options = {}) {
  try {
    const result = await cloudinary.uploader.upload(fileSource, {
      folder: 'drony_snapshots',
      ...options,
    });
    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}

/**
 * Deletes an image from Cloudinary by its public_id.
 * @param {string} publicId - The Cloudinary public_id (e.g. 'drony_snapshots/SNAP-...')
 */
export async function deleteFromCloudinary(publicId) {
  if (!publicId) return;
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    // Don't throw so cleanup doesn't crash the server if already removed
  }
}

export default cloudinary;
