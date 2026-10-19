import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FirearmsController } from './firearms.controller';
import { FirearmsService } from './firearms.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [FirearmsController],
  providers: [FirearmsService],
})
export class FirearmsModule {}
