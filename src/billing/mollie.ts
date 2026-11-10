/** Narrow, injectable adapter for Mollie's v2 API; no keys ever reach the browser. */
export interface MolliePayment {
  id: string;
  status: string;
  mode: "test" | "live";
  profileId: string;
  customerId?: string;
  subscriptionId?: string;
  amount: { currency: string; value: string };
  metadata?: Record<string, unknown> | null;
  paidAt?: string;
  _links?: { checkout?: { href: string } };
}

export interface MollieSubscription {
  id: string;
  status: string;
  mode: "test" | "live";
  customerId: string;
  amount: { currency: string; value: string };
  startDate?: string;
  nextPaymentDate?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface MollieCustomer { id: string }
export interface MollieMandate { id: string; status: string }

export interface MollieGateway {
  createCustomer(body: { name: string; email: string }, key: string): Promise<MollieCustomer>;
  createPayment(body: Record<string, unknown>, key: string): Promise<MolliePayment>;
  getPayment(id: string): Promise<MolliePayment>;
  listMandates(customerId: string): Promise<MollieMandate[]>;
  createSubscription(customerId: string, body: Record<string, unknown>, key: string): Promise<MollieSubscription>;
  listSubscriptions(customerId: string): Promise<MollieSubscription[]>;
  getSubscription(customerId: string, id: string): Promise<MollieSubscription>;
  updateSubscription(customerId: string, id: string, body: Record<string, unknown>, key: string): Promise<MollieSubscription>;
  cancelSubscription(customerId: string, id: string): Promise<MollieSubscription>;
  listSubscriptionPayments(customerId: string, id: string): Promise<MolliePayment[]>;
}

export class MollieApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export class MollieHttpGateway implements MollieGateway {
  constructor(private apiKey: string, private fetcher: typeof fetch = fetch) {}

  private async request<T>(method: string, path: string, data?: unknown, key?: string): Promise<T> {
    const url = `https://api.mollie.com/v2${path}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" };
    if (data !== undefined) headers["Content-Type"] = "application/json";
    if (key) headers["Idempotency-Key"] = key;
    const res = await this.fetcher(url, {
      method, headers, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      // Avoid returning Mollie error bodies: they can contain request/customer metadata.
      throw new MollieApiError(res.status, `Mollie ${method} ${path.split("/").filter(Boolean).slice(0, 2).join("/")} failed (${res.status})`);
    }
    return res.json() as Promise<T>;
  }
  private customerPath(customerId: string): string { return `/customers/${encodeURIComponent(customerId)}`; }
  /** Follow the provider's own pages, but never send credentials to a redirected host/path. */
  private async listAll<T>(path: string, collection: string): Promise<T[]> {
    const basePath = path.split("?")[0];
    let next: string | null = path;
    const items: T[] = [];
    let pages = 0;
    while (next) {
      if (++pages > 1000) throw new MollieApiError(502, "Mollie pagination exceeded safety limit");
      const response: { _embedded?: Record<string, T[]>; _links?: { next?: { href: string } } } = await this.request("GET", next);
      items.push(...(response._embedded?.[collection] ?? []));
      const href: string | undefined = response._links?.next?.href;
      if (!href) break;
      const url = new URL(href);
      if (url.origin !== "https://api.mollie.com" || url.pathname !== `/v2${basePath}` ||
          url.username || url.password) throw new MollieApiError(502, "Unsafe Mollie pagination URL");
      next = `${basePath}${url.search}`;
    }
    return items;
  }
  createCustomer(body: { name: string; email: string }, key: string) { return this.request<MollieCustomer>("POST", "/customers", body, key); }
  createPayment(body: Record<string, unknown>, key: string) { return this.request<MolliePayment>("POST", "/payments", body, key); }
  getPayment(id: string) { return this.request<MolliePayment>("GET", `/payments/${encodeURIComponent(id)}`); }
  listMandates(customerId: string) { return this.listAll<MollieMandate>(`${this.customerPath(customerId)}/mandates?limit=250`, "mandates"); }
  createSubscription(customerId: string, body: Record<string, unknown>, key: string) {
    return this.request<MollieSubscription>("POST", `${this.customerPath(customerId)}/subscriptions`, body, key);
  }
  listSubscriptions(customerId: string) { return this.listAll<MollieSubscription>(`${this.customerPath(customerId)}/subscriptions?limit=250`, "subscriptions"); }
  getSubscription(customerId: string, id: string) {
    return this.request<MollieSubscription>("GET", `${this.customerPath(customerId)}/subscriptions/${encodeURIComponent(id)}`);
  }
  updateSubscription(customerId: string, id: string, body: Record<string, unknown>, key: string) {
    return this.request<MollieSubscription>("PATCH", `${this.customerPath(customerId)}/subscriptions/${encodeURIComponent(id)}`, body, key);
  }
  cancelSubscription(customerId: string, id: string) {
    return this.request<MollieSubscription>("DELETE", `${this.customerPath(customerId)}/subscriptions/${encodeURIComponent(id)}`);
  }
  listSubscriptionPayments(customerId: string, id: string) {
    return this.listAll<MolliePayment>(`${this.customerPath(customerId)}/subscriptions/${encodeURIComponent(id)}/payments?limit=250`, "payments");
  }
}
