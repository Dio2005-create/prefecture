import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}
