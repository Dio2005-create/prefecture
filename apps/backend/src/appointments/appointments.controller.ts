import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AppointmentsService } from './appointments.service';

class BookAppointmentDto {
  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;
}

@Controller('appointments')
@UseGuards(AuthGuard)
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('available')
  available() { return this.appointments.listAvailable(); }

  @Get()
  list(@Req() req: { user?: { id: string } }) { return this.appointments.listByUser(req.user?.id ?? ''); }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  listForAdmin() { return this.appointments.listAll(); }

  @Patch('admin/:id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAppointmentStatusDto) {
    return this.appointments.updateStatus(id, body.status);
  }

  @Post()
  book(@Req() req: { user?: { id: string } }, @Body() body: BookAppointmentDto) { return this.appointments.book(req.user?.id ?? '', body); }

  @Delete(':id')
  cancel(@Req() req: { user?: { id: string } }, @Param('id', ParseUUIDPipe) id: string) { return this.appointments.cancel(req.user?.id ?? '', id); }
}
