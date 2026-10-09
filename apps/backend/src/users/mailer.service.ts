import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter?: Transporter;

  private getTransport() {
    const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT?.trim() || '465');
    const user = process.env.SMTP_USER?.trim() || 'joashclaudio@gmail.com';
    const password = process.env.SMTP_PASSWORD?.trim();

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ServiceUnavailableException('Configuration SMTP invalide : SMTP_PORT doit être un port valide.');
    }
    if (!password) {
      throw new ServiceUnavailableException('Configuration SMTP incomplète : renseignez le mot de passe d’application dans SMTP_PASSWORD.');
    }

    this.transporter ??= createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE?.toLowerCase() === 'true' || port === 465,
      auth: { user, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    return { transporter: this.transporter, from: process.env.SMTP_FROM?.trim() || user };
  }

  assertConfigured() {
    this.getTransport();
  }

  async sendCitizenDeactivation(email: string, locale: string) {
    const { transporter, from } = this.getTransport();
    const message = locale === 'mg'
      ? {
          subject: 'Najanona ny kaontinao olom-pirenena',
          text: 'Salama,\n\nNajanona ny kaontinao tao amin’ny sehatra nomerika an’ny Prefektioran’Ihosy. Raha mila fanazavana fanampiny ianao dia mifandraisa amin’ny prefektiora.\n\nPrefektioran’Ihosy',
        }
      : {
          subject: 'Désactivation de votre compte citoyen',
          text: 'Bonjour,\n\nVotre compte sur la plateforme de la Préfecture d’Ihosy vient d’être désactivé. Pour toute information complémentaire, veuillez contacter la préfecture.\n\nPréfecture d’Ihosy',
        };

    try {
      await transporter.sendMail({
        from: `"Préfecture d’Ihosy" <${from}>`,
        to: email,
        ...message,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send account deactivation email to ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException('Compte désactivé, mais l’e-mail de notification n’a pas pu être envoyé. Vérifiez la configuration SMTP et réessayez.');
    }
  }
}
