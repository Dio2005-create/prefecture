import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AppointmentsService } from './appointments.service';

class BookAppointmentDto {
  @IsUUID()
  slotId!: string;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

class CreateAppointmentSlotDto {
  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  office?: string;
}

class UpdateAppointmentSlotDto {
  @IsBoolean()
  isActive!: boolean;
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

  @Get('admin/slots')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  listSlotsForAdmin() { return this.appointments.listSlotsForAdmin(); }

  @Post('admin/slots')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  createSlot(@Body() body: CreateAppointmentSlotDto) { return this.appointments.createSlot(body); }

  @Patch('admin/slots/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  updateSlot(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAppointmentSlotDto) {
    return this.appointments.updateSlot(id, body.isActive);
  }

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
