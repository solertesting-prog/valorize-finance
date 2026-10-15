import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, Env } from '../config/env';

/**
 * Almacenamiento privado en S3 (o compatible: MinIO, R2, Scaleway…).
 * El bucket NO es público: todo acceso se hace con URLs firmadas de corta duración.
 * Cifrado en reposo SSE-S3 (AES256) en cada objeto.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  /** Cliente con el endpoint público, para firmar URLs que abrirá el navegador o la app. */
  private readonly publicClient: S3Client;
  readonly bucket: string;

  constructor(@Inject(ENV) env: Env) {
    const base = {
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
    };
    this.client = new S3Client({ ...base, endpoint: env.S3_ENDPOINT || undefined });
    this.publicClient = new S3Client({ ...base, endpoint: env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT || undefined });
    this.bucket = env.S3_BUCKET;
  }

  presignPut(key: string, contentType: string, size: number, expiresIn = 300) {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: size,
        ServerSideEncryption: 'AES256',
      }),
      { expiresIn },
    );
  }

  presignGet(key: string, fileName: string, expiresIn = 120) {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `inline; filename="${fileName.replace(/[^\w.\- ]/g, '_')}"`,
      }),
      { expiresIn },
    );
  }

  async head(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: r.ContentLength ?? 0, contentType: r.ContentType };
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
