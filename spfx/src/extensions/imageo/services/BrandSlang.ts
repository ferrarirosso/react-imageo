/**
 * Persist the publisher's "brand slang" in localStorage, keyed per tenant + user.
 * Kept small (2 KB cap).
 */

const MAX_LEN = 2000;

function storageKey(tenantHost: string, userLogin: string): string {
  const safeUser = (userLogin || 'anon').toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
  return `imageo.brandSlang.v1.${tenantHost.toLowerCase()}.${safeUser}`;
}

export class BrandSlang {
  private readonly key: string;

  public constructor(tenantHost: string, userLogin: string) {
    this.key = storageKey(tenantHost, userLogin);
  }

  public get(): string {
    try {
      return window.localStorage.getItem(this.key) || '';
    } catch {
      return '';
    }
  }

  public set(value: string): void {
    try {
      const trimmed = (value || '').slice(0, MAX_LEN);
      if (trimmed) {
        window.localStorage.setItem(this.key, trimmed);
      } else {
        window.localStorage.removeItem(this.key);
      }
    } catch {
      /* noop */
    }
  }
}
