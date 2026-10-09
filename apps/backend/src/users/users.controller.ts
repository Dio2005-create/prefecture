import { Body, Controller, Get, Patch, Param, Post, Req, UseGuards } from '@nestjs/common';
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
  updateCitizenStatus(@Param('id') id: string, @Body() body: { status?: 'ACTIVE' | 'INACTIVE' }) {
    return this.usersService.updateCitizenStatus(id, body.status as 'ACTIVE' | 'INACTIVE');
  }
}
