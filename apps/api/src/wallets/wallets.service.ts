import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChainNetwork, CryptoWallet, Prisma, WalletRiskStatus } from '@prisma/client';
import type { AdminWalletDetailDto, AdminWalletDto, ExchangeSettingsDto, ExchangeSettingsInput, WalletChallengeDto, WalletDto, WalletOwnershipInput } from '@valorize/shared';
import { randomBytes } from 'crypto';
import { AuditService } from '../common/audit.service';
import { ENV, Env } from '../config/env';
import { RequestMeta } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { parseAddress } from './address';
import { readManual } from '../bookings/rates.service';
import { WalletScreeningService } from './screening.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TOKENS } from './chains';
import { keccak256 } from './keccak';
import { OnchainService } from './onchain.service';
import { recoverSigner } from './signature';

/** Validez del mensaje de prueba de propiedad. */
const CHALLENGE_TTL_MS = 24 * 3600_000;

/** Listas OFAC de direcciones por activo, mantenidas a diario a partir del SDN oficial. */
const OFAC_SOURCES = ['ETH', 'TRX', 'USDT', 'USDC', 'BSC', 'ARB'].map(
  (a) => `https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_${a}.txt`,
);

const reviewerInclude = { reviewedBy: { select: { id: true, firstName: true, lastName: true } } } as const;

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly screening: WalletScreeningService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    private readonly notifications: NotificationsService,
    private readonly onchain: OnchainService,
  ) {}

  // ─────────── Cliente ───────────

  /** Para el cliente, "Bloqueada" se muestra como "Revisar": no se revela el motivo del bloqueo. */
  customerDto(w: CryptoWallet, cooldownUntil: Date | null = null): WalletDto {
    const status: WalletRiskStatus = w.riskStatus === 'BLOCKED' ? 'REVIEW' : w.riskStatus;
    return {
      ownershipVerifiedAt: w.ownershipVerifiedAt?.toISOString() ?? null,
      ownershipMethod: (w.ownershipMethod as WalletDto['ownershipMethod']) ?? null,
      cooldownUntil: cooldownUntil?.toISOString() ?? null,
      id: w.id,
      network: w.network,
      address: parseAddress(w.network, w.address).display,
      label: w.label,
      riskStatus: status,
      riskScore: null,
      lastScreenedAt: w.lastScreenedAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
    };
  }

  staffDto(w: CryptoWallet): WalletDto {
    return { ...this.customerDto(w), riskStatus: w.riskStatus, riskScore: w.riskScore };
  }

  async listMine(userId: string, network?: ChainNetwork) {
    const ws = await this.prisma.cryptoWallet.findMany({
      where: { userId, archivedAt: null, ...(network ? { network } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(ws.map(async (w) => this.customerDto(w, await this.cooldownUntil(w))));
  }

  /**
   * Periodo de seguridad de una wallet recién añadida: si la cuenta ya tenía operaciones u otras wallets,
   * no se envía cripto a una wallet nueva hasta pasadas N horas (si alguien roba la cuenta y cambia la wallet,
   * el cliente tiene tiempo de verlo: se le avisa por email). Devuelve hasta cuándo, o null si no aplica.
   */
  async cooldownUntil(w: Pick<CryptoWallet, 'id' | 'userId' | 'createdAt'>): Promise<Date | null> {
    const s = await this.prisma.exchangeSettings.findUnique({ where: { id: 1 } });
    const hours = s?.walletCooldownHours ?? 24;
    const end = new Date(w.createdAt.getTime() + hours * 3600_000);
    if (!hours || end <= new Date()) return null;
    return (await this.isEstablished(w.userId, w.createdAt, w.id)) ? end : null;
  }

  /** ¿La cuenta ya tenía actividad antes de esa fecha (operaciones completadas u otras wallets)? */
  private async isEstablished(userId: string, before: Date, exceptWalletId?: string) {
    const [ops, wallets] = await Promise.all([
      this.prisma.booking.count({ where: { userId, status: 'COMPLETED', exchange: { isNot: null }, completedAt: { lt: before } } }),
      this.prisma.cryptoWallet.count({ where: { userId, createdAt: { lt: before }, ...(exceptWalletId ? { id: { not: exceptWalletId } } : {}) } }),
    ]);
    return ops > 0 || wallets > 0;
  }

  // ─────────── Prueba de propiedad ───────────

  /** Mensaje a firmar (y, si hay dirección de Valorize en esa red, la microtransferencia alternativa). */
  async challenge(userId: string, walletId: string): Promise<WalletChallengeDto> {
    const w = await this.ownedOrThrow(userId, walletId);
    const fresh = w.ownershipChallenge && w.ownershipChallengeAt && Date.now() - w.ownershipChallengeAt.getTime() < CHALLENGE_TTL_MS / 2;
    let message = w.ownershipChallenge;
    let at = w.ownershipChallengeAt;
    if (!fresh || !message || !at) {
      at = new Date();
      const display = parseAddress(w.network, w.address).display;
      message = [
        'Valorize Finance - prueba de propiedad',
        `Wallet: ${display}`,
        `Red: ${w.network}`,
        `Codigo: ${randomBytes(6).toString('hex').toUpperCase()}`,
        `Fecha: ${at.toISOString()}`,
      ].join('\n');
      await this.prisma.cryptoWallet.update({ where: { id: w.id }, data: { ownershipChallenge: message, ownershipChallengeAt: at } });
    }
    return {
      walletId: w.id,
      network: w.network,
      address: parseAddress(w.network, w.address).display,
      message,
      signatureKind: w.network === 'TRON' ? 'tron' : 'evm',
      microtransfer: await this.microtransfer(w.network, message),
      expiresAt: new Date(at.getTime() + CHALLENGE_TTL_MS).toISOString(),
    };
  }

  /** Microtransferencia: importe único (0,010000–0,019999) derivado del mensaje, a la primera dirección de Valorize de la red. */
  private async microtransfer(network: ChainNetwork, message: string) {
    const to = (await this.receivingAddresses())[network]?.[0];
    const asset = TOKENS[network].USDT ? ('USDT' as const) : TOKENS[network].USDC ? ('USDC' as const) : null;
    if (!to || !asset) return null;
    const n = parseInt(keccak256(message).slice(0, 8), 16) % 10_000;
    return { asset, amount: (0.01 + n / 1_000_000).toFixed(6), toAddress: parseAddress(network, to).display };
  }

  async verifyOwnership(userId: string, walletId: string, input: WalletOwnershipInput, meta: RequestMeta): Promise<WalletDto> {
    const w = await this.ownedOrThrow(userId, walletId);
    if (w.ownershipVerifiedAt) return this.customerDto(w, await this.cooldownUntil(w));
    if (!w.ownershipChallenge || !w.ownershipChallengeAt || Date.now() - w.ownershipChallengeAt.getTime() > CHALLENGE_TTL_MS) {
      throw Errors.unprocessable('CHALLENGE_EXPIRED', 'El mensaje ha caducado. Vuelve a abrir la verificación para generar uno nuevo.');
    }
    const message = w.ownershipChallenge;
    let proof: Record<string, unknown>;

    if (input.method === 'SIGNATURE') {
      const signer = recoverSigner(w.network === 'TRON' ? 'tron' : 'evm', message, input.signature);
      const ok = !!signer && parseAddress(w.network, signer).canonical === w.address;
      if (!ok) {
        await this.audit.log({ actorId: userId, action: 'wallet.ownership_failed', entityType: 'wallet', entityId: w.id, metadata: { method: 'SIGNATURE' }, meta });
        throw Errors.unprocessable('SIGNATURE_INVALID', 'La firma no corresponde a esta wallet. Comprueba que firmas el mensaje exacto con la misma wallet.');
      }
      proof = { method: 'SIGNATURE', message, signature: input.signature };
    } else {
      const mt = await this.microtransfer(w.network, message);
      if (!mt) throw Errors.unprocessable('MICROTRANSFER_UNAVAILABLE', 'La verificación por transferencia no está disponible en esta red.');
      const token = TOKENS[w.network][mt.asset]!;
      const tx = await this.onchain.lookupTx(w.network, input.txHash).catch(() => null);
      if (!tx || tx.state !== 'success') {
        throw Errors.unprocessable('TX_NOT_CONFIRMED', 'Todavía no vemos la transferencia confirmada en la red. Espera un minuto y vuelve a intentarlo.');
      }
      const tokenAddr = parseAddress(w.network, token.address).canonical;
      const to = parseAddress(w.network, mt.toAddress).canonical;
      const expected = BigInt(Math.round(Number(mt.amount) * 10 ** token.decimals));
      const match = tx.transfers.find((t) => t.token === tokenAddr && t.from === w.address && t.to === to && t.raw === expected);
      if (!match) {
        await this.audit.log({ actorId: userId, action: 'wallet.ownership_failed', entityType: 'wallet', entityId: w.id, metadata: { method: 'MICROTRANSFER', txHash: input.txHash }, meta });
        throw Errors.unprocessable('TX_MISMATCH', `La transferencia no coincide: debe salir de esta wallet y enviar exactamente ${mt.amount} ${mt.asset} a ${mt.toAddress}.`);
      }
      proof = { method: 'MICROTRANSFER', message, txHash: input.txHash, amount: mt.amount, asset: mt.asset, to: mt.toAddress };
    }

    const updated = await this.prisma.cryptoWallet.update({
      where: { id: w.id },
      data: {
        ownershipVerifiedAt: new Date(),
        ownershipMethod: input.method,
        ownershipProof: proof as Prisma.InputJsonValue,
        ownershipChallenge: null,
        ownershipChallengeAt: null,
      },
    });
    await this.audit.log({ actorId: userId, action: 'wallet.ownership_verified', entityType: 'wallet', entityId: w.id, metadata: { method: input.method }, meta });
    return this.customerDto(updated, await this.cooldownUntil(updated));
  }

  /** Registra (o reutiliza) una wallet del cliente. Valida formato y checksum. */
  async upsertForUser(userId: string, input: { network: ChainNetwork; address: string; label?: string }, meta?: RequestMeta) {
    const parsed = parseAddress(input.network, input.address);
    if (!parsed.valid) throw Errors.unprocessable('INVALID_ADDRESS', parsed.error ?? 'Dirección no válida');
    const existing = await this.prisma.cryptoWallet.findUnique({
      where: { userId_network_address: { userId, network: input.network, address: parsed.canonical } },
    });
    if (existing) {
      if (existing.archivedAt || (input.label && input.label !== existing.label)) {
        return this.prisma.cryptoWallet.update({ where: { id: existing.id }, data: { archivedAt: null, label: input.label ?? existing.label } });
      }
      return existing;
    }
    const w = await this.prisma.cryptoWallet.create({
      data: { userId, network: input.network, address: parsed.canonical, label: input.label },
    });
    await this.audit.log({ actorId: userId, action: 'wallet.added', entityType: 'wallet', entityId: w.id, metadata: { network: w.network }, meta });
    // Aviso de seguridad si la cuenta ya tenía actividad: si no ha sido el cliente, lo verá a tiempo.
    if (await this.isEstablished(userId, w.createdAt, w.id)) {
      const s = await this.prisma.exchangeSettings.findUnique({ where: { id: 1 } });
      void this.notifications.notify({
        userId,
        type: 'SECURITY',
        title: 'Nueva wallet en tu cuenta',
        body: `Se ha añadido la wallet ${parsed.display} (${w.network}) a tu cuenta.${s?.walletCooldownHours ? ` Por seguridad, no te enviaremos cripto a ella hasta dentro de ${s.walletCooldownHours} horas.` : ''} Si no has sido tú, cambia tu contraseña y contacta con nosotros.`,
        email: { cta: { label: 'Revisar mi cuenta', url: `${this.env.APP_URL}/p2p/app/perfil` } },
      });
    }
    return w;
  }

  async ownedOrThrow(userId: string, walletId: string) {
    const w = await this.prisma.cryptoWallet.findFirst({ where: { id: walletId, userId, archivedAt: null } });
    if (!w) throw Errors.notFound('Wallet');
    return w;
  }

  async archive(userId: string, walletId: string) {
    await this.ownedOrThrow(userId, walletId);
    await this.prisma.cryptoWallet.update({ where: { id: walletId }, data: { archivedAt: new Date() } });
  }

  // ─────────── Backoffice ───────────

  async adminList(q: { page: number; pageSize: number; q?: string; riskStatus?: WalletRiskStatus; network?: ChainNetwork }) {
    const search = q.q?.trim();
    const where: Prisma.CryptoWalletWhereInput = {
      ...(q.riskStatus ? { riskStatus: q.riskStatus } : {}),
      ...(q.network ? { network: q.network } : {}),
      ...(search
        ? {
            OR: [
              { address: { contains: search.startsWith('0x') ? search.toLowerCase() : search } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
              { user: { lastName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.cryptoWallet.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } }, _count: { select: { exchanges: true } } },
        orderBy: [{ lastScreenedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.cryptoWallet.count({ where }),
    ]);
    const shared = await this.sharedCounts(items);
    return {
      items: items.map((w) => this.adminDto(w, shared.get(`${w.network}:${w.address}`) ?? 0)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  private async sharedCounts(ws: { network: ChainNetwork; address: string }[]) {
    const map = new Map<string, number>();
    if (!ws.length) return map;
    const rows = await this.prisma.cryptoWallet.groupBy({
      by: ['network', 'address'],
      where: { OR: ws.map((w) => ({ network: w.network, address: w.address })) },
      _count: { _all: true },
    });
    for (const r of rows) map.set(`${r.network}:${r.address}`, r._count._all - 1);
    return map;
  }

  private adminDto(
    w: CryptoWallet & { user: { id: string; firstName: string; lastName: string; email: string }; _count: { exchanges: number } },
    shared: number,
  ): AdminWalletDto {
    return {
      ...this.staffDto(w),
      owner: { id: w.user.id, name: `${w.user.firstName} ${w.user.lastName}`, email: w.user.email },
      sharedWithOtherCustomers: shared,
      exchangeCount: w._count.exchanges,
    };
  }

  async adminDetail(id: string, actorId: string, meta: RequestMeta): Promise<AdminWalletDetailDto> {
    const w = await this.prisma.cryptoWallet.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { exchanges: true } },
        screenings: { orderBy: { createdAt: 'desc' }, take: 20, include: reviewerInclude },
        exchanges: {
          include: { booking: { select: { id: true, reference: true, status: true, startsAt: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!w) throw Errors.notFound('Wallet');
    const shared = await this.sharedCounts([w]);
    await this.audit.log({ actorId, action: 'wallet.viewed', entityType: 'wallet', entityId: id, meta });
    return {
      wallet: this.adminDto(w, shared.get(`${w.network}:${w.address}`) ?? 0),
      screenings: w.screenings.map((s) => this.screening.toDto(s)),
      exchanges: w.exchanges.map((e) => ({
        bookingId: e.booking.id,
        reference: e.booking.reference,
        status: e.booking.status,
        direction: e.direction,
        asset: e.asset,
        amount: e.amount.toString(),
        startsAt: e.booking.startsAt.toISOString(),
        txHash: e.txHash,
        txCheckStatus: e.txCheckStatus,
      })),
    };
  }

  async latestScreening(walletId: string) {
    const s = await this.prisma.walletScreening.findFirst({ where: { walletId }, orderBy: { createdAt: 'desc' }, include: reviewerInclude });
    return s ? this.screening.toDto(s) : null;
  }

  // ─────────── Listas de bloqueo ───────────

  async blockedList(q: { page: number; pageSize: number; q?: string }) {
    const where: Prisma.BlockedAddressWhereInput = {
      source: 'internal',
      ...(q.q ? { address: { contains: q.q.startsWith('0x') ? q.q.toLowerCase() : q.q } } : {}),
    };
    const [items, total, ofac] = await this.prisma.$transaction([
      this.prisma.blockedAddress.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.blockedAddress.count({ where }),
      this.prisma.blockedAddress.count({ where: { source: 'ofac' } }),
    ]);
    const lastOfac = await this.prisma.blockedAddress.findFirst({ where: { source: 'ofac' }, orderBy: { createdAt: 'desc' } });
    return {
      items: items.map((b) => ({ id: b.id, address: b.address, reason: b.reason, createdAt: b.createdAt.toISOString() })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      ofac: { count: ofac, updatedAt: lastOfac?.createdAt.toISOString() ?? null },
    };
  }

  async addBlocked(address: string, reason: string | undefined, actorId: string, meta: RequestMeta) {
    const a = address.trim();
    const canonical = a.startsWith('0x') ? a.toLowerCase() : a;
    const b = await this.prisma.blockedAddress.upsert({
      where: { address_source: { address: canonical, source: 'internal' } },
      create: { address: canonical, source: 'internal', reason, createdById: actorId },
      update: { reason },
    });
    // Las wallets ya registradas con esa dirección pasan a bloqueadas.
    const affected = await this.prisma.cryptoWallet.updateMany({ where: { address: canonical }, data: { riskStatus: 'BLOCKED', riskScore: 100 } });
    await this.audit.log({ actorId, action: 'wallet.blocklist_added', entityType: 'blocked_address', entityId: b.id, metadata: { address: canonical, affected: affected.count }, meta });
    return { id: b.id, affectedWallets: affected.count };
  }

  async removeBlocked(id: string, actorId: string, meta: RequestMeta) {
    const b = await this.prisma.blockedAddress.findFirst({ where: { id, source: 'internal' } });
    if (!b) throw Errors.notFound('Entrada');
    await this.prisma.blockedAddress.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'wallet.blocklist_removed', entityType: 'blocked_address', entityId: id, metadata: { address: b.address }, meta });
  }

  /** Importa las listas OFAC. Sustituye el conjunto anterior solo si la descarga tiene contenido. */
  async syncOfac(): Promise<{ count: number; sources: number }> {
    const found = new Set<string>();
    let ok = 0;
    for (const url of OFAC_SOURCES) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) continue;
        ok++;
        for (const line of (await res.text()).split(/\r?\n/)) {
          const a = line.trim();
          if (!a || a.startsWith('#')) continue;
          found.add(a.startsWith('0x') ? a.toLowerCase() : a);
        }
      } catch (e) {
        this.logger.warn(`OFAC ${url}: ${(e as Error).message}`);
      }
    }
    if (!found.size) throw new Error('No se pudo descargar ninguna lista OFAC');
    const list = [...found];
    await this.prisma.$transaction([
      this.prisma.blockedAddress.deleteMany({ where: { source: 'ofac', address: { notIn: list } } }),
      this.prisma.blockedAddress.createMany({
        data: list.map((address) => ({ address, source: 'ofac', reason: 'OFAC SDN' })),
        skipDuplicates: true,
      }),
    ]);
    // Wallets ya registradas que aparecen ahora en la lista: bloqueadas de inmediato.
    await this.prisma.cryptoWallet.updateMany({ where: { address: { in: list } }, data: { riskStatus: 'BLOCKED', riskScore: 100 } });
    this.logger.log(`Lista OFAC actualizada: ${list.length} direcciones de ${ok} fuentes`);
    return { count: list.length, sources: ok };
  }

  // ─────────── Ajustes ───────────

  /** Direcciones propias de Valorize por red, en forma canónica (EVM en minúsculas). */
  async receivingAddresses(): Promise<Partial<Record<ChainNetwork, string[]>>> {
    const s = await this.prisma.exchangeSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    return normalizeReceiving(s.receivingAddresses);
  }

  async settings(admin = false): Promise<ExchangeSettingsDto> {
    const s = await this.prisma.exchangeSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    return {
      enabledAssets: s.enabledAssets,
      enabledNetworks: s.enabledNetworks,
      sellEnabled: s.sellEnabled,
      buyEnabled: s.buyEnabled,
      minAmount: s.minAmount.toString(),
      maxAmount: s.maxAmount.toString(),
      dailyLimitPerUser: s.dailyLimitPerUser.toString(),
      monthlyLimitPerUser: s.monthlyLimitPerUser.toString(),
      enhancedKycAbove: s.enhancedKycAbove.toString(),
      minWalletAgeDays: s.minWalletAgeDays,
      ownershipRequiredAbove: s.ownershipRequiredAbove.toString(),
      walletCooldownHours: s.walletCooldownHours,
      openscanUrl: this.env.OPENSCAN_URL,
      ...(admin
        ? {
            receivingAddresses: normalizeReceiving(s.receivingAddresses, true),
            autoApproveEnabled: s.autoApproveEnabled,
            autoApproveMaxAmount: s.autoApproveMaxAmount.toString(),
            autoApproveMinCompleted: s.autoApproveMinCompleted,
            rateSource: s.rateSource === 'MANUAL' ? ('MANUAL' as const) : ('AUTO' as const),
            manualRates: readManual(s.manualRates),
            sellSpreadPct: s.sellSpreadPct.toString(),
            buySpreadPct: s.buySpreadPct.toString(),
            fixedFeeEur: s.fixedFeeEur.toFixed(2),
          }
        : {}),
    };
  }

  async updateSettings(input: ExchangeSettingsInput, actorId: string, meta: RequestMeta) {
    if (Number(input.maxAmount) < Number(input.minAmount)) throw Errors.unprocessable('INVALID_LIMITS', 'El máximo no puede ser menor que el mínimo');
    if (Number(input.monthlyLimitPerUser) < Number(input.dailyLimitPerUser)) {
      throw Errors.unprocessable('INVALID_LIMITS', 'El límite mensual no puede ser menor que el diario');
    }
    const receiving: Partial<Record<ChainNetwork, string[]>> = {};
    for (const [n, list] of Object.entries(input.receivingAddresses ?? {}) as [ChainNetwork, string[] | undefined][]) {
      const parsed = (list ?? []).filter(Boolean).map((a) => parseAddress(n, a));
      const bad = parsed.find((p) => !p.valid);
      if (bad) throw Errors.unprocessable('INVALID_ADDRESS', `${bad.display}: ${bad.error}`);
      if (parsed.length) receiving[n] = [...new Set(parsed.map((p) => p.display))];
    }
    if (input.rateSource === 'MANUAL' && !Object.keys(input.manualRates ?? {}).length) {
      throw Errors.unprocessable('RATE_REQUIRED', 'Con la cotización manual tienes que indicar el tipo de USDT y USDC');
    }
    const data = {
      ...input,
      receivingAddresses: receiving as Prisma.InputJsonValue,
      manualRates: (input.manualRates ?? {}) as Prisma.InputJsonValue,
    };
    await this.prisma.exchangeSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await this.audit.log({ actorId, action: 'exchange.settings_updated', entityType: 'exchange_settings', entityId: '1', metadata: input, meta });
    return this.settings(true);
  }
}

/** Lee el JSON de direcciones propias. display=true devuelve el formato para mostrar (EIP-55). */
function normalizeReceiving(v: Prisma.JsonValue, display = false): Partial<Record<ChainNetwork, string[]>> {
  const out: Partial<Record<ChainNetwork, string[]>> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const n of Object.values(ChainNetwork)) {
    const list = (v as Record<string, unknown>)[n];
    if (!Array.isArray(list)) continue;
    const parsed = list.filter((a): a is string => typeof a === 'string').map((a) => parseAddress(n, a)).filter((p) => p.valid);
    if (parsed.length) out[n] = parsed.map((p) => (display ? p.display : p.canonical));
  }
  return out;
}
