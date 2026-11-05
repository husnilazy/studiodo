// One-time: lets browsers PUT files straight to the R2 bucket (presigned uploads) and read them back.
// Usage: npm run r2:cors   (reads R2_* from .env)
// Origins are "*" on purpose: the Electron app's origin is "null" and each tenant may use its own domain. A PUT still needs a
// presigned URL (short-lived, bound to one file type and size), so the bucket stays closed to anyone without one.
import "dotenv/config";
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) throw new Error("R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET belum diisi di .env");

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  forcePathStyle: true,
});

await client.send(new PutBucketCorsCommand({
  Bucket: R2_BUCKET,
  CORSConfiguration: {
    CORSRules: [{ AllowedOrigins: ["*"], AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }],
  },
}));
console.log("CORS terpasang:", JSON.stringify((await client.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }))).CORSRules));
