import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async sendPasswordResetOtp(phone: string, code: string, locale?: string): Promise<void> {
    const url = process.env.BEFIANA_SMS_API_URL?.trim() || process.env.SMS_API_URL?.trim();
    if (!url) {
      throw new ServiceUnavailableException('Le fournisseur SMS n’est pas configuré.');
    }

    const messageLocale = locale?.toLowerCase() === 'fr' ? 'fr' : locale?.toLowerCase() === 'mg' ? 'mg' : 'en';
    const messages: Record<string, string> = {
      fr: `Votre code de vérification est ${code}. Il expire dans 10 minutes.`,
      mg: `Ny kaodin'ny fanamarinana anao dia ${code}. Mifarana ao anatin'ny 10 minitra.`,
      en: `Your verification code is ${code}. It expires in 10 minutes.`,
    };

    const message = process.env.SMS_MESSAGE_TEMPLATE
      ? process.env.SMS_MESSAGE_TEMPLATE.replaceAll('{{code}}', code)
      : messages[messageLocale];
    const normalizedPhone = this.normalizePhone(phone);
    const body = { to: normalizedPhone, text: message };
    const idempotencyKey = `password-reset-${createHash('sha256')
      .update(`${normalizedPhone}:${message}:password-reset`)
      .digest('hex')}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    };
    const customHeaders = process.env.SMS_API_HEADERS?.trim();
    if (customHeaders) {
      Object.assign(headers, JSON.parse(customHeaders));
    }

    const apiKey = process.env.BEFIANA_SMS_API_KEY?.trim() || process.env.SMS_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('La clé d’envoi SMS BEFIANA n’est pas configurée.');
    }
    headers.Authorization = `Bearer ${apiKey}`;

    try {
      const response = await fetch(url, {
        method: process.env.SMS_API_METHOD?.trim() || 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        const providerError = this.parseProviderError(responseBody);
        this.logger.error(
          `BEFIANA rejected SMS send (${response.status}${providerError ? `, ${providerError}` : ''})`,
        );
        if (response.status === 401) {
          throw new ServiceUnavailableException('La clé API d’envoi BEFIANA est invalide ou inactive.');
        }
        if (response.status === 403) {
          throw new ServiceUnavailableException('La clé BEFIANA n’a pas la permission sms.send ou SMS n’est pas activé.');
        }
        throw new ServiceUnavailableException('Le service d’envoi du code est momentanément inaccessible.');
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error('SMS provider request failed', error instanceof Error ? error.stack : String(error));
      throw new ServiceUnavailableException('Le service d’envoi du code est momentanément inaccessible.');
    }
  }

  async getDeliveryStatus(messageId: string): Promise<unknown> {
    const apiKey = process.env.BEFIANA_DELIVERY_READ_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('La clé de consultation SMS BEFIANA n’est pas configurée.');
    }

    const baseUrl = process.env.BEFIANA_SMS_API_URL?.trim() || 'https://api.befiana.cloud/api/sms/v2/messages/';
    const response = await fetch(new URL(`${encodeURIComponent(messageId)}/`, baseUrl).toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const responseBody = await response.text();
    if (!response.ok) {
      this.logger.error(`BEFIANA delivery status request failed (${response.status}): ${responseBody.slice(0, 500)}`);
      throw new ServiceUnavailableException('Le statut du SMS est momentanément inaccessible.');
    }
    return JSON.parse(responseBody);
  }

  private parseProviderError(responseBody: string): string | undefined {
    try {
      const parsed = JSON.parse(responseBody) as { error?: { code?: string; message?: string } };
      return [parsed.error?.code, parsed.error?.message].filter(Boolean).join(': ');
    } catch {
      return responseBody.slice(0, 300) || undefined;
    }
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/[^0-9+]/g, '');
    if (digits.startsWith('+')) return digits;
    if (digits.startsWith('261')) return `+${digits}`;
    if (/^(032|033|034|037|038|039)/.test(digits)) return `+261${digits.slice(1)}`;
    return digits;
  }
}
