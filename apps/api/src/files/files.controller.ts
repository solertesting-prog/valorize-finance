import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { STAFF_ROLES, uploadRequestSchema, UploadRequestInput, UploadTicketDto } from '@valorize/shared';
import { randomUUID } from 'crypto';
import { AuditService } from '../common/audit.service';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { ZodPipe } from '../common/zod-validation.pipe';
import { StorageService } from './storage.service';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Subida directa del cliente a S3:
 *  1. POST /files/upload-url → URL firmada PUT (5 min)
 *  2. El cliente sube el fichero directamente a S3
 *  3. POST /files/:id/complete → la API comprueba tamaño y tipo en S3 y lo marca como subido
 */
@ApiTags('ficheros')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Post('upload-url')
  async uploadUrl(@CurrentUser() u: AuthUser, @Body(new ZodPipe(uploadRequestSchema)) b: UploadRequestInput): Promise<UploadTicketDto> {
    const pending = await this.prisma.file.count({
      where: { ownerId: u.id, status: 'PENDING_UPLOAD', createdAt: { gt: new Date(Date.now() - 3600_000) } },
    });
    if (pending > 30) throw Errors.tooMany('Demasiadas subidas pendientes');

    const id = randomUUID();
    const key = `${b.purpose.toLowerCase()}/${u.id}/${id}.${EXT[b.contentType]}`;
    await this.prisma.file.create({
      data: {
        id,
        ownerId: u.id,
        purpose: b.purpose,
        bucket: this.storage.bucket,
        key,
        fileName: b.fileName,
        contentType: b.contentType,
        size: b.size,
      },
    });
    const uploadUrl = await this.storage.presignPut(key, b.contentType, b.size);
    return {
      fileId: id,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': b.contentType, 'x-amz-server-side-encryption': 'AES256' },
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  }

  @Post(':id/complete')
  @HttpCode(200)
  async complete(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const file = await this.prisma.file.findFirst({ where: { id, ownerId: u.id } });
    if (!file) throw Errors.notFound('Fichero');
    if (file.status === 'UPLOADED') return { id, status: file.status };
    const head = await this.storage.head(file.key);
    if (!head) throw Errors.unprocessable('UPLOAD_MISSING', 'El fichero no se ha subido todavía');
    if (head.size !== file.size || (head.contentType && head.contentType !== file.contentType)) {
      await this.storage.remove(file.key);
      await this.prisma.file.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } });
      throw Errors.unprocessable('UPLOAD_MISMATCH', 'El fichero subido no coincide con el declarado');
    }
    await this.prisma.file.update({ where: { id }, data: { status: 'UPLOADED', uploadedAt: new Date() } });
    return { id, status: 'UPLOADED' };
  }

  /** URL de lectura temporal. El acceso del personal a documentos de clientes queda auditado. */
  @Get(':id/url')
  async url(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ReqMeta() meta: RequestMeta) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.status !== 'UPLOADED') throw Errors.notFound('Fichero');
    const isOwner = file.ownerId === u.id;
    const isStaff = STAFF_ROLES.includes(u.role);
    if (!isOwner && !isStaff) throw Errors.forbidden();
    if (!isOwner) {
      await this.audit.log({
        actorId: u.id,
        action: 'file.accessed_by_staff',
        entityType: 'file',
        entityId: id,
        metadata: { ownerId: file.ownerId, purpose: file.purpose },
        meta,
      });
    }
    return { url: await this.storage.presignGet(file.key, file.fileName), expiresInSec: 120 };
  }
}
