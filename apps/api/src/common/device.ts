/** Descripción legible de un dispositivo a partir del User-Agent: «Chrome en Windows», «App en Android»… */
export function deviceLabel(userAgent: string | null | undefined, client?: string | null): string {
  const ua = userAgent ?? '';
  const os = /iPhone|iPad|iOS/i.test(ua)
    ? 'iOS'
    : /Android/i.test(ua)
      ? 'Android'
      : /Windows/i.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'sistema desconocido';
  if (client === 'mobile' || /Expo|okhttp|CFNetwork|Dalvik/i.test(ua)) return `App en ${os}`;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\/|CriOS/.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador';
  return `${browser} en ${os}`;
}
