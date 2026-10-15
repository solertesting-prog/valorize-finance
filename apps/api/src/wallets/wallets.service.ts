import { Injectable, Logger } from '@nestjs/common';
import { ChainNetwork, CryptoWallet, Prisma, WalletRiskStatus } from '@prisma/client';
import type { AdminWalletDetailDto, AdminWalletDto, ExchangeSettingsDto, ExchangeSettingsInput, WalletDto } from '@valorize/shared';
import { AuditService } from '../common/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { parseAddress } from './address';
import { WalletScreeningService } from './screening.service';

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
  ) {}

  // ─────────── Cliente ───────────

  /** Para el cliente, "Bloqueada" se muestra como "Revisar": no se revela el motivo del bloqueo. */
  customerDto(w: CryptoWallet): WalletDto {
    const status: WalletRiskStatus = w.riskStatus === 'BLOCKED' ? 'REVIEW' : w.riskStatus;
    return {
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
    return ws.map((w) => this.customerDto(w));
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

  async settings(): Promise<ExchangeSettingsDto> {
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
    };
  }

  async updateSettings(input: ExchangeSettingsInput, actorId: string, meta: RequestMeta) {
    if (Number(input.maxAmount) < Number(input.minAmount)) throw Errors.unprocessable('INVALID_LIMITS', 'El máximo no puede ser menor que el mínimo');
    if (Number(input.monthlyLimitPerUser) < Number(input.dailyLimitPerUser)) {
      throw Errors.unprocessable('INVALID_LIMITS', 'El límite mensual no puede ser menor que el diario');
    }
    await this.prisma.exchangeSettings.upsert({ where: { id: 1 }, create: { id: 1, ...input }, update: input });
    await this.audit.log({ actorId, action: 'exchange.settings_updated', entityType: 'exchange_settings', entityId: '1', metadata: input, meta });
    return this.settings();
  }
}
