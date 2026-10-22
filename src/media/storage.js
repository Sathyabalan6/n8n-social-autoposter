/**
 * Cloud Storage & Presigned URL Bridge for Meta Media Ingestion
 * Supports Cloudflare R2 (zero egress fees), AWS S3, or any S3-compatible store (MinIO, Wasabi)
 */

const fs = require('node:fs');
const path = require('node:path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function isCloudStorageConfigured() {
  const endpoint = process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
  const accessKey = process.env.R2_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME;

  return Boolean(endpoint && accessKey && secretKey && bucket);
}

function getS3Client() {
  if (!isCloudStorageConfigured()) {
    throw new Error('Cloud storage credentials missing. Please set R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, and R2_BUCKET_NAME in .env.');
  }

  const endpoint = process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

function getBucketName() {
  return process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME;
}

/**
 * 1. Generates a presigned PUT URL for direct browser uploads (expires in 15 minutes)
 */
async function generatePresignedUploadUrl(filename, mimetype = 'video/mp4', tenantId = 'default') {
  const client = getS3Client();
  const bucket = getBucketName();
  const sanitized = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectKey = `staging/${tenantId}/${Date.now()}-${sanitized}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mimetype
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 }); // 15 mins
  return { uploadUrl, objectKey };
}

/**
 * 2. Generates a 24-hour public GET URL for Meta Graph API ingestion crawler
 */
async function getPublicMediaUrl(objectKey, expiresIn = 86400) {
  // If custom public domain is configured (e.g. https://pub-xxx.r2.dev or https://media.brand.com)
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  if (publicDomain && publicDomain.trim()) {
    const base = publicDomain.trim().replace(/\/$/, '');
    return `${base}/${objectKey}`;
  }

  const client = getS3Client();
  const bucket = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey
  });

  // Default: 24-hour signed GET URL matching Meta container 24h expiration
  return await getSignedUrl(client, command, { expiresIn });
}

/**
 * 3. Bridges a local file on server disk (e.g. from /uploads) directly into R2/S3
 * Returns the 24-hour public ingestion URL for Meta
 */
async function uploadLocalFileToCloud(localFilePath, objectKey = null, contentType = null) {
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Local file not found: ${localFilePath}`);
  }

  const client = getS3Client();
  const bucket = getBucketName();
  const filename = path.basename(localFilePath);
  const targetKey = objectKey || `ingestion/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const ext = path.extname(filename).toLowerCase();
  let mime = contentType;
  if (!mime) {
    if (['.jpg', '.jpeg'].includes(ext)) mime = 'image/jpeg';
    else if (ext === '.png') mime = 'image/png';
    else if (ext === '.webp') mime = 'image/webp';
    else if (['.mp4', '.mov', '.m4v'].includes(ext)) mime = 'video/mp4';
    else mime = 'application/octet-stream';
  }

  const fileBytes = fs.readFileSync(localFilePath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: targetKey,
    Body: fileBytes,
    ContentType: mime
  });

  await client.send(command);
  const publicUrl = await getPublicMediaUrl(targetKey, 86400);

  return {
    success: true,
    objectKey: targetKey,
    publicUrl
  };
}

module.exports = {
  isCloudStorageConfigured,
  generatePresignedUploadUrl,
  getPublicMediaUrl,
  uploadLocalFileToCloud
};
