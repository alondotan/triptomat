#!/usr/bin/env node
/**
 * Upload country resource JSON files from public/data/countries_resources/ to S3.
 *
 * Usage:
 *   node scripts/upload-resources.mjs                  # upload all
 *   node scripts/upload-resources.mjs Philippines       # upload one country
 */
import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';

const DATA_DIR = join(import.meta.dirname, '..', 'public', 'data', 'countries_resources');
const S3_BUCKET = 'triptomat-media';
const S3_PREFIX = 'resources';
const AWS_PROFILE = 'triptomat';
const AWS_REGION = 'eu-central-1';

const targetCountry = process.argv[2];

const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

if (files.length === 0) {
  console.log('No JSON files found in', DATA_DIR);
  process.exit(0);
}

let uploaded = 0;
for (const file of files) {
  const country = basename(file, '.json');
  if (targetCountry && country !== targetCountry) continue;

  const localPath = join(DATA_DIR, file);
  const s3Key = `${S3_PREFIX}/${file}`;

  console.log(`Uploading ${country} -> s3://${S3_BUCKET}/${s3Key}`);

  try {
    execSync(
      `aws s3 cp "${localPath}" "s3://${S3_BUCKET}/${s3Key}" --content-type application/json --cache-control "public, max-age=86400" --profile ${AWS_PROFILE} --region ${AWS_REGION}`,
      { stdio: 'inherit' }
    );
    uploaded++;
  } catch (err) {
    console.error(`Failed to upload ${country}:`, err.message);
  }
}

console.log(`\nDone: ${uploaded} file(s) uploaded.`);
