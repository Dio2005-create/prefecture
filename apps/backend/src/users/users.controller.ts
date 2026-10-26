import { BadRequestException, Body, Controller, Get, Patch, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@Req() req: { user?: { id: string } }) {
    return this.usersService.me(req.user?.id ?? '');
  }

  @Get()
  list() {
    return this.usersService.list();
  }

  @Post('admins')
  @Roles('SUPERADMIN')
  createAdmin(@Body() body: { email?: string; password?: string; nom?: string; phone?: string }) {
    return this.usersService.createAdmin(body);
  }

  @Patch(':id/status')
  @Roles('ADMIN')
  updateCitizenStatus(@Param('id') id: string, @Body() body: { status?: 'ACTIVE' | 'DISABLED' }) {
    if (body.status !== 'ACTIVE' && body.status !== 'DISABLED') throw new BadRequestException('Statut de compte invalide');
    return this.usersService.updateCitizenStatus(id, body.status);
  }

  @Get('reactivations')
  reactivationRequests() {
    return this.usersService.listReactivationRequests();
  }

  @Post('reactivations/:id/decision')
  decideReactivation(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id: string } },
    @Body() body: { decision?: 'APPROVED' | 'REJECTED' },
  ) {
    if (body.decision !== 'APPROVED' && body.decision !== 'REJECTED') {
      throw new BadRequestException('Décision de réactivation invalide');
    }
    return this.usersService.decideReactivation(id, req.user?.id ?? '', body.decision);
  }

  @Get('password-reset-requests')
  passwordResetRequests() {
    return this.usersService.listPasswordResetRequests();
  }

  @Post('password-reset-requests/:id/temporary-password')
  issueTemporaryPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { id: string } },
    @Body() body: { identityVerified?: boolean },
  ) {
    return this.usersService.issueTemporaryPassword(id, req.user?.id ?? '', body.identityVerified === true);
  }
}
