// Enumeraciones compartidas entre API, web y app.
// Deben mantenerse alineadas con los enums de prisma/schema.prisma.

export const Role = {
  CUSTOMER: 'CUSTOMER',
  EMPLOYEE: 'EMPLOYEE',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const STAFF_ROLES: Role[] = [Role.EMPLOYEE, Role.MANAGER, Role.ADMIN];
export const ADMIN_ROLES: Role[] = [Role.MANAGER, Role.ADMIN];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const BookingStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  IN_SERVICE: 'IN_SERVICE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
  REJECTED: 'REJECTED',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

/** Estados que ocupan capacidad en el booking engine. */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN,
  BookingStatus.IN_SERVICE,
];

/** Transiciones permitidas de estado de una cita. */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'REJECTED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_SERVICE', 'COMPLETED', 'CANCELLED'],
  IN_SERVICE: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  REJECTED: [],
};

export const KycStatus = {
  NOT_STARTED: 'NOT_STARTED',
  PENDING: 'PENDING',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const KycFieldType = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  DATE: 'DATE',
  SELECT: 'SELECT',
  COUNTRY: 'COUNTRY',
  DOCUMENT: 'DOCUMENT',
  BOOLEAN: 'BOOLEAN',
} as const;
export type KycFieldType = (typeof KycFieldType)[keyof typeof KycFieldType];

export const NotificationType = {
  BOOKING_REQUESTED: 'BOOKING_REQUESTED',
  BOOKING_REJECTED: 'BOOKING_REJECTED',
  BOOKING_CONFIRMED: 'BOOKING_CONFIRMED',
  BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_REMINDER: 'BOOKING_REMINDER',
  BOOKING_CHECKED_IN: 'BOOKING_CHECKED_IN',
  BOOKING_COMPLETED: 'BOOKING_COMPLETED',
  BOOKING_NO_SHOW: 'BOOKING_NO_SHOW',
  KYC_STATUS_CHANGED: 'KYC_STATUS_CHANGED',
  SECURITY: 'SECURITY',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const IncidentStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const IncidentType = {
  INVALID_QR: 'INVALID_QR',
  IDENTITY_MISMATCH: 'IDENTITY_MISMATCH',
  CUSTOMER_COMPLAINT: 'CUSTOMER_COMPLAINT',
  TECHNICAL: 'TECHNICAL',
  OTHER: 'OTHER',
} as const;
export type IncidentType = (typeof IncidentType)[keyof typeof IncidentType];

export const WebhookEvent = {
  USER_REGISTERED: 'user.registered',
  KYC_STATUS_CHANGED: 'kyc.status_changed',
  BOOKING_CREATED: 'booking.created',
  BOOKING_REJECTED: 'booking.rejected',
  WALLET_SCREENED: 'wallet.screened',
  EXCHANGE_TX_VERIFIED: 'exchange.tx_verified',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_RESCHEDULED: 'booking.rescheduled',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_CHECKED_IN: 'booking.checked_in',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_NO_SHOW: 'booking.no_show',
  INCIDENT_CREATED: 'incident.created',
} as const;
export type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent];
export const WEBHOOK_EVENTS = Object.values(WebhookEvent);

export const VerificationChannel = { EMAIL: 'EMAIL', PHONE: 'PHONE' } as const;
export type VerificationChannel = (typeof VerificationChannel)[keyof typeof VerificationChannel];

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Pendiente de aprobación',
  CONFIRMED: 'Confirmada',
  CHECKED_IN: 'Check-in hecho',
  IN_SERVICE: 'En atención',
  COMPLETED: 'Atendida',
  CANCELLED: 'Cancelada',
  NO_SHOW: 'No presentado',
  REJECTED: 'Rechazada',
};

export const KYC_STATUS_LABEL: Record<KycStatus, string> = {
  NOT_STARTED: 'Sin iniciar',
  PENDING: 'Pendiente de enviar',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Verificado',
  REJECTED: 'Rechazado',
  EXPIRED: 'Caducado',
};

export const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: 'Cliente',
  EMPLOYEE: 'Empleado',
  MANAGER: 'Responsable',
  ADMIN: 'Administrador',
};

// ───────── Cambio USDT / USDC ─────────

export const ServiceKind = { GENERAL: 'GENERAL', CRYPTO_EXCHANGE: 'CRYPTO_EXCHANGE' } as const;
export type ServiceKind = (typeof ServiceKind)[keyof typeof ServiceKind];

export const ExchangeDirection = { SELL_CRYPTO: 'SELL_CRYPTO', BUY_CRYPTO: 'BUY_CRYPTO' } as const;
export type ExchangeDirection = (typeof ExchangeDirection)[keyof typeof ExchangeDirection];

export const CryptoAsset = { USDT: 'USDT', USDC: 'USDC' } as const;
export type CryptoAsset = (typeof CryptoAsset)[keyof typeof CryptoAsset];

export const ChainNetwork = { TRON: 'TRON', ETHEREUM: 'ETHEREUM', POLYGON: 'POLYGON', BSC: 'BSC' } as const;
export type ChainNetwork = (typeof ChainNetwork)[keyof typeof ChainNetwork];

export const WalletRiskStatus = { PENDING: 'PENDING', CLEAR: 'CLEAR', REVIEW: 'REVIEW', BLOCKED: 'BLOCKED' } as const;
export type WalletRiskStatus = (typeof WalletRiskStatus)[keyof typeof WalletRiskStatus];

export const DIRECTION_LABEL: Record<ExchangeDirection, string> = {
  SELL_CRYPTO: 'Vender cripto (recibo euros)',
  BUY_CRYPTO: 'Comprar cripto (pago en euros)',
};
export const DIRECTION_SHORT: Record<ExchangeDirection, string> = { SELL_CRYPTO: 'Venta', BUY_CRYPTO: 'Compra' };

export const NETWORK_LABEL: Record<ChainNetwork, string> = {
  TRON: 'TRON (TRC-20)',
  ETHEREUM: 'Ethereum (ERC-20)',
  POLYGON: 'Polygon',
  BSC: 'BNB Chain (BEP-20)',
};

export const WALLET_RISK_LABEL: Record<WalletRiskStatus, string> = {
  PENDING: 'Sin auditar',
  CLEAR: 'Sin riesgos',
  REVIEW: 'Revisar',
  BLOCKED: 'Bloqueada',
};

/** Exploradores de bloques para enlazar direcciones desde el backoffice. */
export const EXPLORER_ADDRESS_URL: Record<ChainNetwork, string> = {
  TRON: 'https://tronscan.org/#/address/',
  ETHEREUM: 'https://etherscan.io/address/',
  POLYGON: 'https://polygonscan.com/address/',
  BSC: 'https://bscscan.com/address/',
};
export const EXPLORER_TX_URL: Record<ChainNetwork, string> = {
  TRON: 'https://tronscan.org/#/transaction/',
  ETHEREUM: 'https://etherscan.io/tx/',
  POLYGON: 'https://polygonscan.com/tx/',
  BSC: 'https://bscscan.com/tx/',
};

// ───────── OpenScan (explorador abierto) ─────────

/** Instancia pública oficial de OpenScan. Se puede sustituir por una propia (OPENSCAN_URL en la API). */
export const DEFAULT_OPENSCAN_URL = 'https://openscan.eth.link/';

/** Redes que OpenScan soporta, con su chain ID. TRON no está soportado. */
export const OPENSCAN_CHAIN_ID: Partial<Record<ChainNetwork, number>> = { ETHEREUM: 1, POLYGON: 137, BSC: 56 };

export interface ExplorerLinks {
  /** Enlace a OpenScan, o null si la red no está soportada. */
  openscan: string | null;
  /** Explorador nativo de la red (Tronscan, Etherscan…). */
  native: string;
  nativeName: string;
}

const NATIVE_EXPLORER_NAME: Record<ChainNetwork, string> = { TRON: 'Tronscan', ETHEREUM: 'Etherscan', POLYGON: 'Polygonscan', BSC: 'BscScan' };

/** Enlaces a OpenScan y al explorador nativo para una dirección o una transacción. */
export function explorerLinks(network: ChainNetwork, kind: 'address' | 'tx', value: string, openscanBase?: string | null): ExplorerLinks {
  const chain = OPENSCAN_CHAIN_ID[network];
  const base = (openscanBase || DEFAULT_OPENSCAN_URL).replace(/\/+$/, '').replace(/\/#$/, '');
  return {
    openscan: chain ? `${base}/#/${chain}/${kind}/${value}` : null,
    native: `${kind === 'tx' ? EXPLORER_TX_URL[network] : EXPLORER_ADDRESS_URL[network]}${value}`,
    nativeName: NATIVE_EXPLORER_NAME[network],
  };
}

// ───────── Canal y verificación de transacciones ─────────

export const BookingChannel = { WEB: 'WEB', APP: 'APP', BACKOFFICE: 'BACKOFFICE' } as const;
export type BookingChannel = (typeof BookingChannel)[keyof typeof BookingChannel];
export const CHANNEL_LABEL: Record<BookingChannel, string> = { WEB: 'Web', APP: 'App', BACKOFFICE: 'Backoffice' };

export const TxCheckStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  WARNING: 'WARNING',
  MISMATCH: 'MISMATCH',
  NOT_FOUND: 'NOT_FOUND',
  FAILED: 'FAILED',
  ERROR: 'ERROR',
} as const;
export type TxCheckStatus = (typeof TxCheckStatus)[keyof typeof TxCheckStatus];
export const TX_CHECK_LABEL: Record<TxCheckStatus, string> = {
  PENDING: 'Pendiente de confirmaciones',
  VERIFIED: 'Verificada',
  WARNING: 'Verificada con avisos',
  MISMATCH: 'No coincide',
  NOT_FOUND: 'No encontrada',
  FAILED: 'Fallida en la red',
  ERROR: 'No se pudo comprobar',
};

// ───────── Guía de red (evitar envíos por la red equivocada) ─────────

export interface NetworkGuide {
  /** Nombre del estándar del token en esa red. */
  standard: string;
  /** Cómo aparece normalmente en wallets y exchanges. */
  pickInWallet: string;
  /** Moneda con la que se paga la comisión de red. */
  feeCoin: string;
  addressStartsWith: 'T' | '0x';
}

export const NETWORK_GUIDE: Record<ChainNetwork, NetworkGuide> = {
  TRON: { standard: 'TRC-20', pickInWallet: '«TRON (TRC20)»', feeCoin: 'TRX', addressStartsWith: 'T' },
  ETHEREUM: { standard: 'ERC-20', pickInWallet: '«Ethereum (ERC20)»', feeCoin: 'ETH', addressStartsWith: '0x' },
  POLYGON: { standard: 'Polygon PoS', pickInWallet: '«Polygon» o «Polygon PoS»', feeCoin: 'POL (antes MATIC)', addressStartsWith: '0x' },
  BSC: { standard: 'BEP-20', pickInWallet: '«BNB Smart Chain (BEP20)»', feeCoin: 'BNB', addressStartsWith: '0x' },
};

/** Nombre de la red con su estándar, sin repetirlo: «TRON (TRC-20)», «Polygon (Polygon PoS)». */
export function networkFullName(network: ChainNetwork): string {
  const label = NETWORK_LABEL[network];
  const std = NETWORK_GUIDE[network].standard;
  return label.includes(std) ? label : `${label} (${std})`;
}

/** Consejos para no perder fondos al enviar o recibir por una red concreta. */
export function networkTips(network: ChainNetwork, asset: CryptoAsset, direction: ExchangeDirection): string[] {
  const g = NETWORK_GUIDE[network];
  const tips = [
    `En tu wallet o exchange elige la red ${g.pickInWallet}: ${asset} en ${networkFullName(network)}.`,
    direction === 'SELL_CRYPTO'
      ? `Para enviar necesitarás un poco de ${g.feeCoin} en la wallet para pagar la comisión de red.`
      : `Comprueba que tu wallet muestra ${asset} en ${NETWORK_LABEL[network]}; si no aparece, añade el token antes de la cita.`,
  ];
  if (g.addressStartsWith === '0x') {
    tips.push('Las direcciones 0x… son iguales en Ethereum, Polygon y BNB Chain: el formato no te avisará si te equivocas de red.');
  }
  if (network === 'TRON' && asset === 'USDC') {
    tips.push('Circle ha retirado el soporte de USDC en TRON y muchas wallets ya no lo admiten. Si puedes, elige otra red.');
  }
  tips.push('Si envías por otra red, los fondos se pueden perder y no podremos recuperarlos.');
  return tips;
}
