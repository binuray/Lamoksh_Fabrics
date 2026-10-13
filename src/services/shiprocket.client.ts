import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error.middleware';

export interface ShiprocketOrderItem {
  name: string;
  sku: string;
  units: number;
  selling_price: number;
  discount?: number;
  tax?: number;
  hsn?: string;
}

export interface ShiprocketAdhocOrderPayload {
  order_id: string;
  order_date: string;
  pickup_location: string;
  channel_id?: string | number;
  comment?: string;
  billing_customer_name: string;
  billing_last_name?: string;
  billing_address: string;
  billing_address_2?: string;
  billing_city: string;
  billing_pincode: string | number;
  billing_state: string;
  billing_country: string;
  billing_email?: string;
  billing_phone: string | number;
  shipping_is_billing: boolean;
  shipping_customer_name?: string;
  shipping_last_name?: string;
  shipping_address?: string;
  shipping_address_2?: string;
  shipping_city?: string;
  shipping_pincode?: string | number;
  shipping_country?: string;
  shipping_state?: string;
  shipping_email?: string;
  shipping_phone?: string | number;
  order_items: ShiprocketOrderItem[];
  payment_method: 'Prepaid' | 'COD';
  shipping_charges?: number;
  giftwrap_charges?: number;
  transaction_charges?: number;
  total_discount?: number;
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

export interface ShiprocketServiceabilityQuery {
  pickup_postcode?: string;
  delivery_postcode: string;
  weight?: number;
  cod?: 0 | 1;
  order_id?: string | number;
}

export class ShiprocketClient {
  private baseUrl: string;
  private email?: string;
  private password?: string;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private loginPromise: Promise<string> | null = null;

  constructor() {
    this.baseUrl = (env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1/external').replace(/\/+$/, '');
    this.email = env.SHIPROCKET_EMAIL || process.env.SHIPROCKET_EMAIL;
    this.password = env.SHIPROCKET_PASSWORD || process.env.SHIPROCKET_PASSWORD;
  }

  public setCredentials(email: string, password: string): void {
    this.email = email;
    this.password = password;
  }

  public isConfigured(): boolean {
    return Boolean(this.email && this.password);
  }

  public clearTokenCache(): void {
    this.token = null;
    this.tokenExpiresAt = 0;
    this.loginPromise = null;
  }

  public setToken(token: string, expiresInMs = 9 * 24 * 60 * 60 * 1000): void {
    this.token = token;
    this.tokenExpiresAt = Date.now() + expiresInMs;
  }

  public async login(): Promise<string> {
    if (!this.email || !this.password) {
      throw new AppError('Shiprocket credentials are not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.', 503);
    }

    if (this.loginPromise) {
      return this.loginPromise;
    }

    this.loginPromise = (async () => {
      try {
        const url = `${this.baseUrl}/auth/login`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            email: this.email,
            password: this.password,
          }),
          signal: AbortSignal.timeout(10000),
        });

        const data: any = await res.json().catch(() => ({}));

        if (!res.ok || !data.token) {
          const errMsg = data.message || 'Shiprocket authentication failed';
          logger.error({ status: res.status }, 'Shiprocket login failed');
          throw new AppError(`Shiprocket authentication error: ${errMsg}`, res.status >= 500 ? 502 : 401);
        }

        this.token = data.token;
        // Default expiry 9 days (Shiprocket tokens typically last 10 days)
        this.tokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000;
        logger.info('Shiprocket authentication successful. Token cached.');
        return data.token;
      } finally {
        this.loginPromise = null;
      }
    })();

    return this.loginPromise;
  }

  public async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }
    return this.login();
  }

  public async request<T = any>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: any;
      query?: Record<string, any>;
      retryOnUnauthorized?: boolean;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, query, retryOnUnauthorized = true } = options;

    const token = await this.getToken();

    let fullUrl = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    if (query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') {
          q.append(k, String(v));
        }
      }
      const qs = q.toString();
      if (qs) {
        fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(fullUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });

      // Handle token expiration / 401 Unauthorized
      if (res.status === 401 && retryOnUnauthorized) {
        logger.warn('Shiprocket 401 Unauthorized received. Invalidating cached token and retrying...');
        this.clearTokenCache();
        return this.request<T>(endpoint, { ...options, retryOnUnauthorized: false });
      }

      const responseData: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMsg =
          responseData.message ||
          (responseData.errors ? Object.values(responseData.errors).flat().join(', ') : 'Shiprocket request failed');
        logger.error({ status: res.status, endpoint }, 'Shiprocket API returned error');
        throw new AppError(
          `Shiprocket API Error: ${errorMsg}`,
          res.status >= 500 ? 502 : res.status,
          responseData.errors ? [responseData.errors] : []
        );
      }

      return responseData as T;
    } catch (err: any) {
      if (err instanceof AppError) {
        throw err;
      }

      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        logger.error({ endpoint }, 'Shiprocket request timed out');
        throw new AppError('Shiprocket API connection timed out. Please try again later.', 504);
      }

      logger.error({ err: err.message, endpoint }, 'Shiprocket network/connection failure');
      throw new AppError(`Shiprocket service unavailable: ${err.message || 'Connection failure'}`, 502);
    }
  }

  // 1. Create Adhoc Order
  public async createAdhocOrder(payload: ShiprocketAdhocOrderPayload): Promise<any> {
    return this.request<any>('/orders/create/adhoc', {
      method: 'POST',
      body: payload,
    });
  }

  // 2. Check Courier Serviceability
  public async checkServiceability(params: ShiprocketServiceabilityQuery): Promise<any> {
    return this.request<any>('/courier/serviceability/', {
      method: 'GET',
      query: params,
    });
  }

  // 3. Assign Courier and Generate AWB
  public async assignAwb(payload: { shipment_id: number | string; courier_id?: number | string }): Promise<any> {
    return this.request<any>('/courier/assign/awb', {
      method: 'POST',
      body: {
        shipment_id: Number(payload.shipment_id),
        courier_id: payload.courier_id ? Number(payload.courier_id) : undefined,
      },
    });
  }

  // 4. Request Pickup
  public async generatePickup(payload: { shipment_id: (number | string)[] }): Promise<any> {
    return this.request<any>('/courier/generate/pickup', {
      method: 'POST',
      body: {
        shipment_id: payload.shipment_id.map((id) => Number(id)),
      },
    });
  }

  // 5. Generate Shipping Label
  public async generateLabel(payload: { shipment_id: (number | string)[] }): Promise<any> {
    return this.request<any>('/courier/generate/label', {
      method: 'POST',
      body: {
        shipment_id: payload.shipment_id.map((id) => Number(id)),
      },
    });
  }

  // 6. Generate Manifest
  public async generateManifest(payload: { shipment_id: (number | string)[] }): Promise<any> {
    return this.request<any>('/manifests/generate', {
      method: 'POST',
      body: {
        shipment_id: payload.shipment_id.map((id) => Number(id)),
      },
    });
  }

  // 7. Track by AWB
  public async trackByAwb(awbCode: string): Promise<any> {
    return this.request<any>(`/courier/track/awb/${encodeURIComponent(awbCode)}`, {
      method: 'GET',
    });
  }

  // 8. Cancel Shipment by AWBs
  public async cancelShipmentByAwbs(awbs: string[]): Promise<any> {
    return this.request<any>('/orders/cancel/shipment/awbs', {
      method: 'POST',
      body: { awbs },
    });
  }

  // 9. Cancel Order by Order IDs
  public async cancelOrders(ids: (number | string)[]): Promise<any> {
    return this.request<any>('/orders/cancel', {
      method: 'POST',
      body: {
        ids: ids.map((id) => (typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id)),
      },
    });
  }
}

export const shiprocketClient = new ShiprocketClient();
