import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { MailerService } from '../users/mailer.service';

@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RolesGuard, MailerService],
  exports: [AuthService, AuthGuard, RolesGuard, MailerService],
})
export class AuthModule {}