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
      throw new ServiceUnavailableException('La désactivation a été annulée, car l’e-mail de notification n’a pas pu être envoyé. Vérifiez la configuration SMTP et réessayez.');
    }
  }

  private async send(email: string, subject: string, text: string, failureMessage: string) {
    const { transporter, from } = this.getTransport();
    try {
      await transporter.sendMail({ from: `"Préfecture d’Ihosy" <${from}>`, to: email, subject, text });
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}`, error instanceof Error ? error.stack : String(error));
      throw new ServiceUnavailableException(failureMessage);
    }
  }

  sendPasswordResetOtp(email: string, code: string, locale: string) {
    return this.send(
      email,
      locale === 'mg' ? 'Kaody fanovana tenimiafina' : 'Code de réinitialisation du mot de passe',
      locale === 'mg'
        ? `Ny kaody fanovana ny tenimiafinao dia ${code}. Lany daty afaka 10 minitra izy io ary indray mandeha ihany no azo ampiasaina. Raha tsy ianao no nangataka izany dia aza zaraina ilay kaody.`
        : `Votre code de réinitialisation est : ${code}.\n\nIl expire dans 10 minutes et ne peut être utilisé qu’une seule fois. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
      'Le code n’a pas pu être envoyé. Vérifiez la configuration SMTP et réessayez.',
    );
  }

  sendReactivationDecision(email: string, approved: boolean, locale: string) {
    const message = locale === 'mg'
      ? approved
        ? { subject: 'Naverina nampiasaina ny kaontinao', text: 'Nekena ny fangatahanao. Afaka miditra indray amin’ny kaontinao ianao.' }
        : { subject: 'Valin’ny fangatahana famerenana kaonty', text: 'Tsy nekena ny fangatahanao hamerenana ny kaonty. Mbola mijanona ho tsy miasa ny kaontinao. Mifandraisa amin’ny Prefektioran’Ihosy raha mila fanazavana.' }
      : approved
        ? { subject: 'Votre compte a été réactivé', text: 'Votre demande de réactivation a été approuvée. Vous pouvez à nouveau vous connecter à votre compte.' }
        : { subject: 'Décision concernant votre demande de réactivation', text: 'Votre demande de réactivation a été refusée. Votre compte reste désactivé. Vous pouvez contacter la préfecture pour obtenir des informations.' };
    return this.send(email, message.subject, message.text, 'La décision a été annulée, car l’e-mail ne peut pas être envoyé. Vérifiez la configuration SMTP.');
  }

  sendReactivationRequestToAdmin(email: string, citizenName: string, reason: string | undefined, locale: string) {
    const message = locale === 'mg'
      ? {
          subject: 'Fangatahana hamerenana kaonty olom-pirenena',
          text: `Nangataka ny hamerenana ny kaontiny i ${citizenName}.${reason ? `\n\nAntony: ${reason}` : ''}\n\nJereo ao amin’ny back-office ny fangatahana.`,
        }
      : {
          subject: 'Demande de réactivation d’un compte citoyen',
          text: `${citizenName} demande la réactivation de son compte citoyen.${reason ? `\n\nMotif : ${reason}` : ''}\n\nConsultez la demande dans le back-office.`,
        };
    return this.send(email, message.subject, message.text, 'La demande a été enregistrée, mais l’e-mail à l’administration n’a pas pu être envoyé.');
  }

  sendComplaintResolved(email: string, title: string, locale: string) {
    const message = locale === 'mg'
      ? { subject: 'Voakarakara ny fitarainanao', text: `Voavaha ny fitarainanao momba ny « ${title} ». Nohavaozina ny antontan-taratasy ary azo alaina ao amin’ny sehatra olom-pirenena.` }
      : { subject: 'Votre réclamation a été traitée', text: `Votre réclamation concernant « ${title} » a été traitée. Le document corrigé est disponible dans votre espace citoyen.` };
    return this.send(email, message.subject, message.text, 'La réclamation n’a pas pu être clôturée, car l’e-mail de notification ne peut pas être envoyé.');
  }
}
