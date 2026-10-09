import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
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

class AssignCinAppointmentDto {
  @IsUUID()
  slotId!: string;
}

class CreateAppointmentAvailabilityDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsInt()
  @Min(1)
  @Max(1440)
  slotDurationMinutes!: number;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  breakStart?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  breakEnd?: string;

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
  available(@Query('date') date?: string) { return this.appointments.listAvailable(date); }

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

  @Get('admin/availability')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  listAvailabilityForAdmin() { return this.appointments.listAvailabilityForAdmin(); }

  @Post('admin/availability')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  createAvailability(@Body() body: CreateAppointmentAvailabilityDto) { return this.appointments.createAvailability(body); }

  @Post('admin/requests/:requestId/cin-appointment')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  assignCinAppointment(@Param('requestId', ParseUUIDPipe) requestId: string, @Body() body: AssignCinAppointmentDto, @Req() req: { user?: { id: string } }) {
    return this.appointments.assignCinRequest(requestId, body.slotId, req.user?.id ?? '');
  }

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
