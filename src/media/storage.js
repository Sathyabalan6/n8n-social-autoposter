/**
 * Cloud Storage & Presigned URL Bridge for Meta Media Ingestion
 * Supports Cloudflare R2 (zero egress fees), AWS S3, or any S3-compatible store (MinIO, Wasabi)
 * Lazy-loads @aws-sdk packages only when cloud storage is configured to keep boot time minimal.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let s3Sdk = null;

async function loadS3Sdk() {
  if (!s3Sdk) {
    const s3Module = await import('@aws-sdk/client-s3');
    const presignerModule = await import('@aws-sdk/s3-request-presigner');
    s3Sdk = {
      S3Client: s3Module.S3Client,
      PutObjectCommand: s3Module.PutObjectCommand,
      GetObjectCommand: s3Module.GetObjectCommand,
      getSignedUrl: presignerModule.getSignedUrl
    };
  }
  return s3Sdk;
}

function isCloudStorageConfigured() {
  const endpoint = process.env.R2_ENDPOINT || process.env.S3_ENDPOINT;
  const accessKey = process.env.R2_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || process.env.AWS_BUCKET_NAME;

  return Boolean(endpoint && accessKey && secretKey && bucket);
}

async function getS3Client() {
  if (!isCloudStorageConfigured()) {
    throw new Error('Cloud storage credentials missing. Please set R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, and R2_BUCKET_NAME in .env.');
  }

  const { S3Client } = await loadS3Sdk();
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
  const { PutObjectCommand, getSignedUrl } = await loadS3Sdk();
  const client = await getS3Client();
  const bucket = getBucketName();
  const sanitized = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectKey = `staging/${tenantId}/${Date.now()}-${sanitized}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mimetype
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });
  return { uploadUrl, objectKey };
}

/**
 * 2. Generates a 24-hour public GET URL for Meta Graph API ingestion crawler
 */
async function getPublicMediaUrl(objectKey, expiresIn = 86400) {
  const publicDomain = process.env.R2_PUBLIC_DOMAIN;
  if (publicDomain && publicDomain.trim()) {
    const base = publicDomain.trim().replace(/\/$/, '');
    return `${base}/${objectKey}`;
  }

  const { GetObjectCommand, getSignedUrl } = await loadS3Sdk();
  const client = await getS3Client();
  const bucket = getBucketName();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey
  });

  return await getSignedUrl(client, command, { expiresIn });
}

/**
 * 3. Bridges a local file on server disk directly into R2/S3
 */
async function uploadLocalFileToCloud(localFilePath, objectKey = null, contentType = null) {
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Local file not found: ${localFilePath}`);
  }

  const { PutObjectCommand } = await loadS3Sdk();
  const client = await getS3Client();
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

/**
 * 4. Generates a signed, short-lived HMAC URL for local disk uploads
 */
function generateSignedLocalMediaUrl(filename, expiresInSec = 900) {
  const secret = process.env.ENCRYPTION_SECRET || 'socialpulse-local-media-signing-secret';
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSec;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${filename}:${expiresAt}`)
    .digest('hex')
    .slice(0, 32);

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  return `${baseUrl.replace(/\/$/, '')}/uploads/${encodeURIComponent(filename)}?sig=${signature}&exp=${expiresAt}`;
}

/**
 * Validates signed local media URL HMAC signature and TTL
 */
function verifySignedLocalMediaUrl(filename, signature, expTimestamp) {
  if (!filename || !signature || !expTimestamp) return false;
  const nowSec = Math.floor(Date.now() / 1000);
  if (parseInt(expTimestamp, 10) < nowSec) return false;

  const secret = process.env.ENCRYPTION_SECRET || 'socialpulse-local-media-signing-secret';
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${filename}:${expTimestamp}`)
    .digest('hex')
    .slice(0, 32);

  try {
    const bufSig = Buffer.from(signature);
    const bufExp = Buffer.from(expected);
    if (bufSig.length !== bufExp.length) return false;
    return crypto.timingSafeEqual(bufSig, bufExp);
  } catch {
    return false;
  }
}

module.exports = {
  isCloudStorageConfigured,
  generatePresignedUploadUrl,
  getPublicMediaUrl,
  uploadLocalFileToCloud,
  generateSignedLocalMediaUrl,
  verifySignedLocalMediaUrl
};
