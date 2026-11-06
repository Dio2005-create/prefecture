import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { MailerService } from '../users/mailer.service';
import { SmsService } from '../notifications/sms.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RolesGuard, MailerService, SmsService],
  exports: [AuthService, AuthGuard, RolesGuard, MailerService, SmsService],
})
export class AuthModule {}