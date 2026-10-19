import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AiModule } from './ai/ai.module';
import { PrismaModule } from './prisma/prisma.module';
import { DocumentsModule } from './documents/documents.module';
import { RagModule } from './rag/rag.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RequestsModule } from './requests/requests.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { AgentModule } from './agent/agent.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { FirearmsModule } from './firearms/firearms.module';

@Module({
  controllers: [AppController],
  imports: [PrismaModule, AiModule, DocumentsModule, RagModule, AuthModule, UsersModule, RequestsModule, ComplaintsModule, AgentModule, NotificationsModule, AppointmentsModule, FirearmsModule],
})
export class AppModule {}
