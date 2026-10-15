import { Injectable } from '@nestjs/common';
import { KycRequirement, KycStatus, Prisma } from '@prisma/client';
import type { IdentitySummaryDto, KycProfileDto, KycRequirementDto, KycRequirementInput, KycSubmitInput } from '@valorize/shared';
import { KYC_STATUS_LABEL, WebhookEvent } from '@valorize/shared';
import { AuditService } from '../common/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { CryptoService } from '../common/crypto.service';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhooksService } from '../webhooks/webhooks.service';

const EDITABLE: KycStatus[] = ['NOT_STARTED', 'PENDING', 'REJECTED', 'EXPIRED'];

/** Claves de los requisitos de identidad que se usan en el mostrador y para la caducidad. */
const DOC = {
  legalName: 'full_legal_name',
  birthDate: 'birth_date',
  nationality: 'nationality',
  type: 'id_document_type',
  number: 'id_document_number',
  expiry: 'id_document_expiry',
  front: 'id_document_front',
  back: 'id_document_back',
} as const;

/**
 * Nivel que cubren los datos enviados:
 *  - nivel básico: todos sus campos obligatorios
 *  - niveles superiores (verificación ampliada): todos sus campos, además de los niveles anteriores
 */
export function levelReached(requirements: Pick<KycRequirement, 'id' | 'level' | 'required'>[], filled: Set<string>): number {
  const levels = [...new Set(requirements.map((r) => r.level))].sort((a, b) => a - b);
  let reached = 0;
  for (const [i, level] of levels.entries()) {
    const atLevel = requirements.filter((r) => r.level === level);
    const ok = i === 0 ? atLevel.filter((r) => r.required).every((r) => filled.has(r.id)) : atLevel.every((r) => filled.has(r.id));
    if (!ok) break;
    reached = level;
  }
  return reached;
}

/**
 * KYC genérico: los campos a recoger se definen en kyc_requirements desde el backoffice.
 * Los valores se cifran en BD; los documentos se guardan en S3 privado.
 * La decisión puede ser manual (backoffice) o venir de un proveedor externo (provider/providerRef).
 */
@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly webhooks: WebhooksService,
  ) {}

  async getProfile(userId: string): Promise<KycProfileDto> {
    const [profile, requirements] = await Promise.all([
      this.ensureProfile(userId),
      this.prisma.kycRequirement.findMany({ where: { active: true }, orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }] }),
    ]);
    const values = await this.prisma.kycFieldValue.findMany({
      where: { profileId: profile.id },
      include: { requirement: { select: { key: true } }, file: { select: { fileName: true } } },
    });
    const filled = new Set(values.filter((v) => v.valueEnc || v.fileId).map((v) => v.requirementId));
    return {
      status: profile.status,
      level: profile.level,
      levelReached: levelReached(requirements, filled),
      maxLevel: Math.max(1, ...requirements.map((r) => r.level)),
      upgradeRequestedAt: profile.upgradeRequestedAt?.toISOString() ?? null,
      submittedAt: profile.submittedAt?.toISOString() ?? null,
      reviewedAt: profile.reviewedAt?.toISOString() ?? null,
      expiresAt: profile.expiresAt?.toISOString() ?? null,
      rejectionReason: profile.rejectionReason,
      requirements: requirements.map(reqDto),
      fields: values.map((v) => ({
        key: v.requirement.key,
        value: v.valueEnc ? this.crypto.decrypt(v.valueEnc) : null,
        fileId: v.fileId,
        fileName: v.file?.fileName ?? null,
      })),
    };
  }

  async save(userId: string, input: KycSubmitInput, meta: RequestMeta): Promise<KycProfileDto> {
    const profile = await this.ensureProfile(userId);
    // Un cliente ya verificado solo puede añadir los datos de niveles superiores (verificación ampliada).
    const upgrading = profile.status === 'APPROVED';
    if (!EDITABLE.includes(profile.status) && !upgrading) {
      throw Errors.conflict('KYC_LOCKED', 'Tu verificación está en revisión');
    }
    if (upgrading && profile.upgradeRequestedAt) {
      throw Errors.conflict('KYC_LOCKED', 'Tu verificación ampliada está en revisión');
    }

    const requirements = await this.prisma.kycRequirement.findMany({ where: { active: true } });
    const byKey = new Map<string, KycRequirement>(requirements.map((r: KycRequirement) => [r.key, r]));
    if (upgrading) {
      const locked = input.fields.find((f) => (byKey.get(f.key)?.level ?? 0) <= profile.level);
      if (locked) {
        throw Errors.conflict('KYC_LOCKED', 'Tu identidad ya está verificada: solo puedes añadir los datos de la verificación ampliada');
      }
    }

    // Validar cada campo recibido contra su definición.
    const errors: { path: string; message: string }[] = [];
    for (const f of input.fields) {
      const r = byKey.get(f.key);
      if (!r) {
        errors.push({ path: f.key, message: 'Campo desconocido' });
        continue;
      }
      const msg = await this.validateField(userId, r, f.value ?? null, f.fileId ?? null);
      if (msg) errors.push({ path: f.key, message: msg });
    }
    if (errors.length) throw Errors.unprocessable('KYC_INVALID', errors[0].message, errors);

    await this.prisma.$transaction(async (tx) => {
      for (const f of input.fields) {
        const r = byKey.get(f.key)!;
        const data = {
          valueEnc: f.value ? this.crypto.encrypt(f.value) : null,
          fileId: r.type === 'DOCUMENT' ? (f.fileId ?? null) : null,
        };
        await tx.kycFieldValue.upsert({
          where: { profileId_requirementId: { profileId: profile.id, requirementId: r.id } },
          create: { profileId: profile.id, requirementId: r.id, ...data },
          update: data,
        });
      }

      if (input.submit && upgrading) {
        const stored = await tx.kycFieldValue.findMany({ where: { profileId: profile.id } });
        const filled = new Set(stored.filter((v) => v.valueEnc || v.fileId).map((v) => v.requirementId));
        if (levelReached(requirements, filled) <= profile.level) {
          const missing = requirements.filter((r) => r.level === profile.level + 1 && !filled.has(r.id));
          throw Errors.unprocessable(
            'KYC_INCOMPLETE',
            `Para la verificación ampliada faltan: ${missing.map((m) => m.label).join(', ')}`,
            missing.map((m) => ({ path: m.key, message: 'Necesario para la verificación ampliada' })),
          );
        }
        await tx.kycProfile.update({ where: { id: profile.id }, data: { upgradeRequestedAt: new Date(), rejectionReason: null } });
      } else if (input.submit) {
        const stored = await tx.kycFieldValue.findMany({ where: { profileId: profile.id } });
        const filled = new Set(stored.filter((v) => v.valueEnc || v.fileId).map((v) => v.requirementId));
        // Para enviar basta con el nivel básico; los niveles superiores se completan cuando se necesiten.
        const baseLevel = Math.min(...requirements.map((r) => r.level));
        const missing = requirements.filter((r) => r.required && r.level <= baseLevel && !filled.has(r.id));
        if (missing.length) {
          throw Errors.unprocessable(
            'KYC_INCOMPLETE',
            `Faltan campos obligatorios: ${missing.map((m) => m.label).join(', ')}`,
            missing.map((m) => ({ path: m.key, message: 'Obligatorio' })),
          );
        }
        await tx.kycProfile.update({
          where: { id: profile.id },
          data: { status: 'IN_REVIEW', submittedAt: new Date(), rejectionReason: null },
        });
      } else if (profile.status === 'NOT_STARTED') {
        await tx.kycProfile.update({ where: { id: profile.id }, data: { status: 'PENDING' } });
      }
    });

    await this.audit.log({
      actorId: userId,
      action: input.submit ? (upgrading ? 'kyc.upgrade_submitted' : 'kyc.submitted') : 'kyc.draft_saved',
      entityType: 'kyc_profile',
      entityId: profile.id,
      metadata: { fields: input.fields.map((f) => f.key) },
      meta,
    });
    if (input.submit && !upgrading) {
      void this.webhooks.emit(WebhookEvent.KYC_STATUS_CHANGED, { userId, status: 'IN_REVIEW' });
    }
    return this.getProfile(userId);
  }

  private async validateField(userId: string, r: KycRequirement, value: string | null, fileId: string | null) {
    if (r.type === 'DOCUMENT') {
      if (!fileId) return r.required ? `${r.label}: sube el documento` : null;
      const file = await this.prisma.file.findFirst({
        where: { id: fileId, ownerId: userId, purpose: 'KYC_DOCUMENT', status: 'UPLOADED' },
      });
      return file ? null : `${r.label}: documento no válido`;
    }
    if (value === null || value === '') return null; // la obligatoriedad se comprueba al enviar
    switch (r.type) {
      case 'NUMBER':
        return Number.isFinite(Number(value)) ? null : `${r.label}: debe ser un número`;
      case 'DATE':
        return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? null : `${r.label}: fecha no válida`;
      case 'BOOLEAN':
        return value === 'true' || value === 'false' ? null : `${r.label}: valor no válido`;
      case 'SELECT':
        return r.options.includes(value) ? null : `${r.label}: opción no válida`;
      case 'COUNTRY':
        return /^[A-Z]{2}$/.test(value) ? null : `${r.label}: código de país ISO de 2 letras`;
      default:
        return value.length <= 2000 ? null : `${r.label}: demasiado largo`;
    }
  }

  private async ensureProfile(userId: string) {
    return this.prisma.kycProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  // ─────────── Backoffice ───────────

  async reviewQueue(status: KycStatus | undefined, page: number, pageSize: number) {
    // "Pendientes" incluye las solicitudes de verificación ampliada de clientes ya verificados.
    const where: Prisma.KycProfileWhereInput =
      !status || status === 'IN_REVIEW' ? { OR: [{ status: 'IN_REVIEW' }, { upgradeRequestedAt: { not: null } }] } : { status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.kycProfile.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.kycProfile.count({ where }),
    ]);
    return {
      items: items.map((p) => ({
        userId: p.userId,
        name: `${p.user.firstName} ${p.user.lastName}`,
        email: p.user.email,
        status: p.status,
        level: p.level,
        upgrade: !!p.upgradeRequestedAt,
        submittedAt: (p.upgradeRequestedAt ?? p.submittedAt)?.toISOString() ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Detalle con datos descifrados — acceso auditado. */
  async adminDetail(actorId: string, userId: string, meta: RequestMeta) {
    const profile = await this.getProfile(userId);
    await this.audit.log({ actorId, action: 'kyc.viewed', entityType: 'user', entityId: userId, meta });
    return profile;
  }

  async review(
    actorId: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
    opts: { reason?: string; level?: number; expiresAt?: string },
    meta: RequestMeta,
  ) {
    const profile = await this.prisma.kycProfile.findUnique({ where: { userId }, include: { values: { include: { requirement: true } } } });
    if (!profile) throw Errors.notFound('Perfil KYC');
    const upgrade = profile.status === 'APPROVED' && !!profile.upgradeRequestedAt;
    if (profile.status !== 'IN_REVIEW' && !upgrade) throw Errors.conflict('KYC_NOT_IN_REVIEW', 'Este perfil no está pendiente de revisión');
    if (decision === 'REJECTED' && !opts.reason) throw Errors.unprocessable('REASON_REQUIRED', 'Indica el motivo del rechazo');

    const requirements = await this.prisma.kycRequirement.findMany({ where: { active: true } });
    const filled = new Set(profile.values.filter((v) => v.valueEnc || v.fileId).map((v) => v.requirementId));
    const reached = levelReached(requirements, filled);
    const read = (key: string) => {
      const v = profile.values.find((x) => x.requirement.key === key)?.valueEnc;
      return v ? this.crypto.decrypt(v) : null;
    };

    let level = profile.level;
    let expiresAt: Date | null = profile.expiresAt;
    if (decision === 'APPROVED') {
      if (reached < 1) throw Errors.unprocessable('KYC_INCOMPLETE', 'Faltan datos obligatorios para verificar la identidad');
      // Se aprueba como máximo el nivel que cubren los datos enviados.
      level = Math.min(opts.level ?? reached, reached);
      if (upgrade && level <= profile.level) {
        throw Errors.unprocessable('KYC_INCOMPLETE', 'Los datos enviados no completan la verificación ampliada');
      }
      // La verificación caduca con el documento, salvo que se indique otra fecha.
      const docExpiry = read(DOC.expiry);
      const docEnd = docExpiry && /^\d{4}-\d{2}-\d{2}$/.test(docExpiry) ? new Date(`${docExpiry}T23:59:59Z`) : null;
      if (docEnd && docEnd < new Date()) {
        throw Errors.unprocessable('DOCUMENT_EXPIRED', `El documento del cliente caducó el ${(docExpiry ?? '').split('-').reverse().join('/')}. Recházala y pide uno en vigor.`);
      }
      expiresAt = opts.expiresAt ? new Date(opts.expiresAt) : (docEnd ?? (upgrade ? profile.expiresAt : null));
    }

    await this.prisma.kycProfile.update({
      where: { userId },
      data: upgrade
        ? {
            level,
            upgradeRequestedAt: null,
            rejectionReason: decision === 'REJECTED' ? opts.reason : null,
            ...(decision === 'APPROVED' ? { reviewedAt: new Date(), reviewedById: actorId, expiresAt } : {}),
          }
        : {
            status: decision,
            level: decision === 'APPROVED' ? level : profile.level,
            reviewedAt: new Date(),
            reviewedById: actorId,
            rejectionReason: decision === 'REJECTED' ? opts.reason : null,
            expiresAt: decision === 'APPROVED' ? expiresAt : null,
          },
    });
    await this.audit.log({
      actorId,
      action: upgrade ? `kyc.upgrade_${decision.toLowerCase()}` : `kyc.${decision.toLowerCase()}`,
      entityType: 'user',
      entityId: userId,
      metadata: { reason: opts.reason, level, expiresAt: expiresAt?.toISOString() ?? null },
      meta,
    });
    if (upgrade) {
      await this.notifications.notify({
        userId,
        type: 'KYC_STATUS_CHANGED',
        title: decision === 'APPROVED' ? 'Verificación ampliada aprobada' : 'Verificación ampliada no aprobada',
        body:
          decision === 'APPROVED'
            ? 'Ya puedes solicitar operaciones de importe alto.'
            : `No hemos podido aprobar la verificación ampliada. Motivo: ${opts.reason}. Tu verificación básica sigue activa.`,
        data: { status: 'APPROVED', level: String(level) },
        email: {},
      });
    } else {
      await this.notifyStatus(userId, decision, opts.reason);
    }
  }

  /**
   * Datos de identidad para cotejar en el mostrador al leer el QR.
   * Número de documento enmascarado; el acceso queda registrado.
   */
  async identitySummary(userId: string, actorId: string, meta: RequestMeta): Promise<IdentitySummaryDto | null> {
    const profile = await this.prisma.kycProfile.findUnique({ where: { userId }, include: { values: { include: { requirement: true } } } });
    if (!profile) return null;
    const get = (key: string) => profile.values.find((v) => v.requirement.key === key);
    const read = (key: string) => {
      const v = get(key)?.valueEnc;
      try {
        return v ? this.crypto.decrypt(v) : null;
      } catch {
        return null;
      }
    };
    const number = read(DOC.number);
    const expiry = read(DOC.expiry);
    await this.audit.log({ actorId, action: 'kyc.identity_checked', entityType: 'user', entityId: userId, meta });
    return {
      kycStatus: profile.status,
      kycLevel: profile.level,
      kycExpiresAt: profile.expiresAt?.toISOString() ?? null,
      legalName: read(DOC.legalName),
      birthDate: read(DOC.birthDate),
      nationality: read(DOC.nationality),
      documentType: read(DOC.type),
      documentNumberMasked: number ? `•••• ${number.replace(/\s/g, '').slice(-4)}` : null,
      documentExpiry: expiry,
      documentExpired: !!expiry && new Date(`${expiry}T23:59:59Z`) < new Date(),
      documentFrontFileId: get(DOC.front)?.fileId ?? null,
      documentBackFileId: get(DOC.back)?.fileId ?? null,
    };
  }

  async notifyStatus(userId: string, status: KycStatus, reason?: string | null) {
    void this.webhooks.emit(WebhookEvent.KYC_STATUS_CHANGED, { userId, status });
    await this.notifications.notify({
      userId,
      type: 'KYC_STATUS_CHANGED',
      title: `Verificación de identidad: ${KYC_STATUS_LABEL[status]}`,
      body:
        status === 'APPROVED'
          ? 'Tu identidad ha sido verificada. Ya puedes reservar todos los servicios.'
          : status === 'REJECTED'
            ? `No hemos podido verificar tu identidad. Motivo: ${reason ?? 'revisa los datos'}. Puedes corregirlos y volver a enviarlos.`
            : 'Tu verificación ha caducado. Actualiza tus datos para seguir reservando servicios que la requieren.',
      data: { status },
      email: {},
    });
  }

  // Requisitos configurables
  async listRequirements(includeInactive: boolean): Promise<KycRequirementDto[]> {
    const rs = await this.prisma.kycRequirement.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
    });
    return rs.map(reqDto);
  }

  async createRequirement(input: KycRequirementInput) {
    return reqDto(await this.prisma.kycRequirement.create({ data: input }));
  }

  async updateRequirement(id: string, input: Partial<KycRequirementInput>) {
    // La clave no se puede cambiar: los valores ya almacenados dependen de ella.
    const { key: _ignored, ...rest } = input;
    return reqDto(await this.prisma.kycRequirement.update({ where: { id }, data: rest }));
  }

  async deleteRequirement(id: string) {
    const used = await this.prisma.kycFieldValue.count({ where: { requirementId: id } });
    if (used) {
      // Con datos: se desactiva en lugar de borrar.
      await this.prisma.kycRequirement.update({ where: { id }, data: { active: false } });
      return { deactivated: true };
    }
    await this.prisma.kycRequirement.delete({ where: { id } });
    return { deleted: true };
  }
}

function reqDto(r: KycRequirement): KycRequirementDto {
  return {
    id: r.id,
    key: r.key,
    label: r.label,
    helpText: r.helpText,
    type: r.type,
    required: r.required,
    options: r.options,
    sortOrder: r.sortOrder,
    active: r.active,
    level: r.level,
  };
}
