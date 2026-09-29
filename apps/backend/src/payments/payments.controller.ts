import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsEnum, IsPhoneNumber, IsUUID } from 'class-validator';
import { PaymentProvider } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { PaymentsService } from './payments.service';

class InitiatePaymentDto {
  @IsUUID()
  requestId!: string;

  @IsEnum(PaymentProvider)
  provider!: PaymentProvider;

  @IsPhoneNumber('MG')
  phone!: string;
}

@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('mobile-money')
  initiate(@Req() req: { user?: { id: string } }, @Body() body: InitiatePaymentDto) {
    return this.payments.initiate(req.user?.id ?? '', body);
  }

  @Get()
  list(@Req() req: { user?: { id: string } }) {
    return this.payments.listByUser(req.user?.id ?? '');
  }
}
