import { Controller, Get, Param, ParseUUIDPipe, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() req: { user?: { id: string } }) {
    return this.notifications.listByUser(req.user?.id ?? '');
  }

  @Patch(':id/read')
  markAsRead(@Req() req: { user?: { id: string } }, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markAsRead(req.user?.id ?? '', id);
  }
}
